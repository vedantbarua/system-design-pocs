#!/usr/bin/env python3
"""Schema registry and event contract POC.

This app models event schema governance: versioning, compatibility checks,
producer validation, consumer support tracking, and rollout readiness. It uses
SQLite and the Python standard library so it can run locally without services.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import time
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
RUNTIME_DIR = ROOT / "runtime"
DEFAULT_DB_PATH = RUNTIME_DIR / "schema_registry.db"
FIELD_TYPES = {"string", "integer", "number", "boolean", "object", "array"}
COMPATIBILITY_MODES = {"BACKWARD", "FORWARD", "FULL", "NONE"}


def now_ts() -> int:
    return int(time.time())


def json_dumps(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def decode_json(raw: str | None) -> Any:
    if not raw:
        return None
    return json.loads(raw)


def non_empty(value: Any, field: str, max_len: int = 100) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    if not re.fullmatch(r"[A-Za-z0-9._:-]+", result):
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, or dash")
    return result


class SchemaRegistry:
    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.init_schema()

    def close(self) -> None:
        self.conn.close()

    def init_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS subjects (
                name TEXT PRIMARY KEY,
                compatibility_mode TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS schema_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_name TEXT NOT NULL,
                version INTEGER NOT NULL,
                schema_json TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(subject_name, version)
            );

            CREATE TABLE IF NOT EXISTS consumers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                consumer_id TEXT NOT NULL,
                subject_name TEXT NOT NULL,
                min_version INTEGER NOT NULL,
                max_version INTEGER NOT NULL,
                owner TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(consumer_id, subject_name)
            );

            CREATE TABLE IF NOT EXISTS validation_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                subject_name TEXT NOT NULL,
                version INTEGER NOT NULL,
                valid INTEGER NOT NULL,
                message TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                message TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def seed_if_empty(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) AS count FROM subjects").fetchone()["count"]
        if count:
            return
        self.create_subject(
            {
                "name": "OrderCreated",
                "compatibility_mode": "BACKWARD",
                "description": "Order lifecycle event emitted after checkout.",
                "schema": {
                    "fields": [
                        {"name": "order_id", "type": "string", "required": True},
                        {"name": "customer_id", "type": "string", "required": True},
                        {"name": "total", "type": "number", "required": True},
                    ]
                },
            }
        )
        self.add_version(
            "OrderCreated",
            {
                "fields": [
                    {"name": "order_id", "type": "string", "required": True},
                    {"name": "customer_id", "type": "string", "required": True},
                    {"name": "total", "type": "number", "required": True},
                    {"name": "coupon_code", "type": "string", "required": False},
                ]
            },
            dry_run=False,
        )
        self.create_subject(
            {
                "name": "PaymentCaptured",
                "compatibility_mode": "FULL",
                "description": "Payment capture result from billing.",
                "schema": {
                    "fields": [
                        {"name": "payment_id", "type": "string", "required": True},
                        {"name": "order_id", "type": "string", "required": True},
                        {"name": "amount", "type": "number", "required": True},
                    ]
                },
            }
        )
        self.register_consumer(
            {
                "consumer_id": "billing-ledger",
                "subject_name": "PaymentCaptured",
                "min_version": 1,
                "max_version": 1,
                "owner": "finance-platform",
            }
        )
        self.register_consumer(
            {
                "consumer_id": "order-search-indexer",
                "subject_name": "OrderCreated",
                "min_version": 1,
                "max_version": 2,
                "owner": "search-platform",
            }
        )
        self.record("seed", "Loaded seed schemas and consumers.")

    def create_subject(self, payload: dict[str, Any]) -> dict[str, Any]:
        name = non_empty(payload.get("name"), "name")
        mode = normalize_mode(payload.get("compatibility_mode", "BACKWARD"))
        description = str(payload.get("description", "")).strip()
        schema = normalize_schema(payload.get("schema"))
        existing = self.conn.execute("SELECT name FROM subjects WHERE name = ?", (name,)).fetchone()
        if existing:
            raise ValueError(f"subject already exists: {name}")
        created_at = now_ts()
        self.conn.execute(
            "INSERT INTO subjects(name, compatibility_mode, description, created_at) VALUES (?, ?, ?, ?)",
            (name, mode, description, created_at),
        )
        self.conn.execute(
            """
            INSERT INTO schema_versions(subject_name, version, schema_json, status, created_at)
            VALUES (?, 1, ?, 'ACTIVE', ?)
            """,
            (name, json_dumps(schema), created_at),
        )
        self.conn.commit()
        self.record("subject_created", f"Created {name} with v1 in {mode} mode.")
        return self.get_subject(name)

    def add_version(self, subject_name: str, schema: dict[str, Any], dry_run: bool = False) -> dict[str, Any]:
        subject = self.subject_row(subject_name)
        proposed = normalize_schema(schema)
        latest = self.latest_version(subject_name)
        check = self.compatibility_check(subject_name, proposed, latest["version"])
        if not check["compatible"]:
            if dry_run:
                return check | {"registered": False}
            raise ValueError("schema is not compatible: " + "; ".join(check["issues"]))
        next_version = latest["version"] + 1
        if dry_run:
            return check | {"registered": False, "next_version": next_version}
        self.conn.execute(
            """
            INSERT INTO schema_versions(subject_name, version, schema_json, status, created_at)
            VALUES (?, ?, ?, 'ACTIVE', ?)
            """,
            (subject["name"], next_version, json_dumps(proposed), now_ts()),
        )
        self.conn.commit()
        self.record("schema_version_added", f"Registered {subject['name']} v{next_version}.")
        return self.get_subject(subject["name"])

    def compatibility_check(self, subject_name: str, proposed_schema: dict[str, Any], against_version: int | None = None) -> dict[str, Any]:
        subject = self.subject_row(subject_name)
        proposed = normalize_schema(proposed_schema)
        baseline = self.version_row(subject["name"], against_version or self.latest_version(subject["name"])["version"])
        current_schema = decode_json(baseline["schema_json"])
        mode = subject["compatibility_mode"]
        issues: list[str] = []
        if mode in {"BACKWARD", "FULL"}:
            issues.extend(backward_issues(current_schema, proposed))
        if mode in {"FORWARD", "FULL"}:
            issues.extend(forward_issues(current_schema, proposed))
        return {
            "subject_name": subject["name"],
            "mode": mode,
            "against_version": baseline["version"],
            "compatible": mode == "NONE" or not issues,
            "issues": [] if mode == "NONE" else issues,
        }

    def validate_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        subject_name = non_empty(payload.get("subject_name"), "subject_name")
        version = int(payload.get("version") or self.latest_version(subject_name)["version"])
        event = payload.get("event")
        if not isinstance(event, dict):
            raise ValueError("event must be a JSON object")
        schema = decode_json(self.version_row(subject_name, version)["schema_json"])
        errors = validate_against_schema(schema, event)
        valid = not errors
        message = "valid" if valid else "; ".join(errors)
        self.conn.execute(
            """
            INSERT INTO validation_events(created_at, subject_name, version, valid, message)
            VALUES (?, ?, ?, ?, ?)
            """,
            (now_ts(), subject_name, version, 1 if valid else 0, message),
        )
        self.conn.commit()
        self.record("event_validated", f"Validated {subject_name} v{version}: {message}.")
        return {"subject_name": subject_name, "version": version, "valid": valid, "errors": errors}

    def register_consumer(self, payload: dict[str, Any]) -> dict[str, Any]:
        consumer_id = non_empty(payload.get("consumer_id"), "consumer_id")
        subject_name = self.subject_row(payload.get("subject_name"))["name"]
        min_version = int(payload.get("min_version", 1))
        max_version = int(payload.get("max_version", min_version))
        owner = non_empty(payload.get("owner", "unknown"), "owner")
        if min_version < 1 or max_version < min_version:
            raise ValueError("consumer version range is invalid")
        latest = self.latest_version(subject_name)["version"]
        if max_version > latest:
            raise ValueError("consumer max_version cannot exceed latest registered schema")
        self.conn.execute(
            """
            INSERT OR REPLACE INTO consumers(consumer_id, subject_name, min_version, max_version, owner, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (consumer_id, subject_name, min_version, max_version, owner, now_ts()),
        )
        self.conn.commit()
        self.record("consumer_registered", f"{consumer_id} supports {subject_name} v{min_version}-v{max_version}.")
        return self.rollout_readiness(subject_name)

    def rollout_readiness(self, subject_name: str, target_version: int | None = None) -> dict[str, Any]:
        subject = self.subject_row(subject_name)
        version = target_version or self.latest_version(subject["name"])["version"]
        consumers = self.consumers(subject["name"])
        blockers = [
            consumer
            for consumer in consumers
            if not (consumer["min_version"] <= version <= consumer["max_version"])
        ]
        return {
            "subject_name": subject["name"],
            "target_version": version,
            "ready": not blockers,
            "consumer_count": len(consumers),
            "blockers": blockers,
        }

    def get_subject(self, subject_name: str) -> dict[str, Any]:
        subject = self.subject_row(subject_name)
        versions = self.conn.execute(
            """
            SELECT version, schema_json, status, created_at
            FROM schema_versions
            WHERE subject_name = ?
            ORDER BY version ASC
            """,
            (subject["name"],),
        ).fetchall()
        return {
            "name": subject["name"],
            "compatibility_mode": subject["compatibility_mode"],
            "description": subject["description"],
            "versions": [
                {
                    "version": row["version"],
                    "schema": decode_json(row["schema_json"]),
                    "status": row["status"],
                    "created_at": row["created_at"],
                }
                for row in versions
            ],
            "consumers": self.consumers(subject["name"]),
            "rollout": self.rollout_readiness(subject["name"]),
        }

    def snapshot(self) -> dict[str, Any]:
        subjects = [
            self.get_subject(row["name"])
            for row in self.conn.execute("SELECT name FROM subjects ORDER BY name").fetchall()
        ]
        validations = [
            dict(row)
            for row in self.conn.execute(
                """
                SELECT created_at, subject_name, version, valid, message
                FROM validation_events
                ORDER BY id DESC
                LIMIT 12
                """
            ).fetchall()
        ]
        return {
            "subject_count": len(subjects),
            "schema_version_count": self.conn.execute("SELECT COUNT(*) AS count FROM schema_versions").fetchone()["count"],
            "consumer_count": self.conn.execute("SELECT COUNT(*) AS count FROM consumers").fetchone()["count"],
            "subjects": subjects,
            "recent_validations": validations,
            "recent_events": self.recent_events(),
        }

    def consumers(self, subject_name: str) -> list[dict[str, Any]]:
        return [
            {
                "consumer_id": row["consumer_id"],
                "subject_name": row["subject_name"],
                "min_version": row["min_version"],
                "max_version": row["max_version"],
                "owner": row["owner"],
            }
            for row in self.conn.execute(
                """
                SELECT consumer_id, subject_name, min_version, max_version, owner
                FROM consumers
                WHERE subject_name = ?
                ORDER BY consumer_id
                """,
                (subject_name,),
            ).fetchall()
        ]

    def subject_row(self, subject_name: Any) -> sqlite3.Row:
        name = non_empty(subject_name, "subject_name")
        row = self.conn.execute("SELECT * FROM subjects WHERE name = ?", (name,)).fetchone()
        if not row:
            raise ValueError(f"unknown subject: {name}")
        return row

    def latest_version(self, subject_name: str) -> dict[str, Any]:
        row = self.conn.execute(
            """
            SELECT version, schema_json
            FROM schema_versions
            WHERE subject_name = ?
            ORDER BY version DESC
            LIMIT 1
            """,
            (subject_name,),
        ).fetchone()
        if not row:
            raise ValueError(f"subject has no versions: {subject_name}")
        return {"version": row["version"], "schema": decode_json(row["schema_json"])}

    def version_row(self, subject_name: str, version: int) -> sqlite3.Row:
        row = self.conn.execute(
            "SELECT * FROM schema_versions WHERE subject_name = ? AND version = ?",
            (subject_name, version),
        ).fetchone()
        if not row:
            raise ValueError(f"unknown schema version: {subject_name} v{version}")
        return row

    def record(self, event_type: str, message: str) -> None:
        self.conn.execute(
            "INSERT INTO audit_events(created_at, event_type, message) VALUES (?, ?, ?)",
            (now_ts(), event_type, message),
        )
        self.conn.commit()

    def recent_events(self) -> list[dict[str, Any]]:
        return [
            dict(row)
            for row in self.conn.execute(
                """
                SELECT created_at, event_type, message
                FROM audit_events
                ORDER BY id DESC
                LIMIT 20
                """
            ).fetchall()
        ]


def normalize_mode(value: Any) -> str:
    mode = str(value or "BACKWARD").strip().upper()
    if mode not in COMPATIBILITY_MODES:
        raise ValueError(f"compatibility_mode must be one of {sorted(COMPATIBILITY_MODES)}")
    return mode


def normalize_schema(schema: Any) -> dict[str, Any]:
    if not isinstance(schema, dict):
        raise ValueError("schema must be a JSON object")
    fields = schema.get("fields")
    if not isinstance(fields, list) or not fields:
        raise ValueError("schema.fields must be a non-empty list")
    normalized = []
    names = set()
    for field in fields:
        if not isinstance(field, dict):
            raise ValueError("each field must be an object")
        name = non_empty(field.get("name"), "field.name")
        field_type = str(field.get("type", "")).strip().lower()
        if field_type not in FIELD_TYPES:
            raise ValueError(f"field {name} has unsupported type {field_type}")
        if name in names:
            raise ValueError(f"duplicate field: {name}")
        names.add(name)
        normalized.append(
            {
                "name": name,
                "type": field_type,
                "required": bool(field.get("required", False)),
            }
        )
    return {"fields": sorted(normalized, key=lambda item: item["name"])}


def fields_by_name(schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {field["name"]: field for field in schema["fields"]}


def backward_issues(old: dict[str, Any], new: dict[str, Any]) -> list[str]:
    issues = []
    old_fields = fields_by_name(old)
    new_fields = fields_by_name(new)
    for name, old_field in old_fields.items():
        new_field = new_fields.get(name)
        if not new_field:
            if old_field["required"]:
                issues.append(f"required field removed: {name}")
            continue
        if new_field["type"] != old_field["type"]:
            issues.append(f"field type changed: {name} {old_field['type']} -> {new_field['type']}")
        if old_field["required"] and not new_field["required"]:
            issues.append(f"required field became optional: {name}")
    for name, new_field in new_fields.items():
        if name not in old_fields and new_field["required"]:
            issues.append(f"new required field added: {name}")
    return issues


def forward_issues(old: dict[str, Any], new: dict[str, Any]) -> list[str]:
    issues = []
    old_fields = fields_by_name(old)
    new_fields = fields_by_name(new)
    for name, new_field in new_fields.items():
        old_field = old_fields.get(name)
        if not old_field:
            if new_field["required"]:
                issues.append(f"new required field is not forward compatible: {name}")
            continue
        if old_field["type"] != new_field["type"]:
            issues.append(f"field type changed: {name} {old_field['type']} -> {new_field['type']}")
    for name, old_field in old_fields.items():
        if name not in new_fields and old_field["required"]:
            issues.append(f"old required field removed for forward readers: {name}")
    return issues


def validate_against_schema(schema: dict[str, Any], event: dict[str, Any]) -> list[str]:
    errors = []
    for field in schema["fields"]:
        name = field["name"]
        if field["required"] and name not in event:
            errors.append(f"missing required field: {name}")
            continue
        if name in event and not value_matches_type(event[name], field["type"]):
            errors.append(f"field {name} expected {field['type']}")
    return errors


def value_matches_type(value: Any, field_type: str) -> bool:
    if field_type == "string":
        return isinstance(value, str)
    if field_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if field_type == "number":
        return (isinstance(value, int) or isinstance(value, float)) and not isinstance(value, bool)
    if field_type == "boolean":
        return isinstance(value, bool)
    if field_type == "object":
        return isinstance(value, dict)
    if field_type == "array":
        return isinstance(value, list)
    return False


def build_html(snapshot: dict[str, Any]) -> str:
    subject_cards = []
    for subject in snapshot["subjects"]:
        versions = ", ".join(f"v{version['version']}" for version in subject["versions"])
        blockers = subject["rollout"]["blockers"]
        blocker_text = "ready" if not blockers else "blocked by " + ", ".join(item["consumer_id"] for item in blockers)
        subject_cards.append(
            f"""
            <section class="card">
              <h3>{subject['name']}</h3>
              <p>{subject['description']}</p>
              <p><strong>Mode:</strong> {subject['compatibility_mode']} <strong>Versions:</strong> {versions}</p>
              <p><strong>Rollout:</strong> {blocker_text}</p>
            </section>
            """
        )
    events = "".join(f"<li><strong>{event['event_type']}</strong> {event['message']}</li>" for event in snapshot["recent_events"])
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Schema Registry Event Contract POC</title>
  <style>
    body {{ margin: 0; background: #eef2f7; color: #172033; font-family: Inter, Segoe UI, sans-serif; }}
    main {{ max-width: 1300px; margin: 0 auto; padding: 28px 20px 56px; }}
    h1, h2, h3 {{ margin: 0; }}
    p {{ color: #5a6475; }}
    .stats, .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }}
    .card {{ background: white; border: 1px solid #d9dee8; border-radius: 8px; padding: 18px; box-shadow: 0 16px 42px rgba(23,32,51,.07); }}
    .stat span {{ color: #5a6475; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }}
    .stat strong {{ display: block; font-size: 28px; margin-top: 6px; }}
    code {{ font-family: SFMono-Regular, Consolas, monospace; }}
  </style>
</head>
<body>
<main>
  <h1>Schema Registry Event Contract POC</h1>
  <p>Schema versioning, compatibility checks, event validation, consumer support, and rollout readiness.</p>
  <section class="stats">
    <div class="card stat"><span>Subjects</span><strong>{snapshot['subject_count']}</strong></div>
    <div class="card stat"><span>Versions</span><strong>{snapshot['schema_version_count']}</strong></div>
    <div class="card stat"><span>Consumers</span><strong>{snapshot['consumer_count']}</strong></div>
  </section>
  <section class="grid" style="margin-top:18px">{''.join(subject_cards)}</section>
  <section class="card" style="margin-top:18px">
    <h2>API</h2>
    <p><code>GET /snapshot</code> <code>POST /schemas</code> <code>POST /events/validate</code></p>
  </section>
  <section class="card" style="margin-top:18px"><h2>Recent Events</h2><ol>{events}</ol></section>
</main>
</body>
</html>"""


class RegistryHandler(BaseHTTPRequestHandler):
    registry: SchemaRegistry

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        try:
            if parsed.path == "/":
                self.respond_html(build_html(self.registry.snapshot()))
                return
            if parsed.path == "/health":
                self.respond_json({"ok": True})
                return
            if parsed.path == "/snapshot":
                self.respond_json(self.registry.snapshot())
                return
            if parsed.path.startswith("/schemas/"):
                subject = urllib.parse.unquote(parsed.path.rsplit("/", 1)[-1])
                self.respond_json(self.registry.get_subject(subject))
                return
            self.respond_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self.respond_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        try:
            if parsed.path == "/schemas":
                self.respond_json(self.registry.create_subject(self.read_json()), HTTPStatus.CREATED)
                return
            if parsed.path.startswith("/schemas/") and parsed.path.endswith("/versions"):
                subject = urllib.parse.unquote(parsed.path.split("/")[2])
                payload = self.read_json()
                self.respond_json(self.registry.add_version(subject, payload.get("schema", payload), dry_run=bool(payload.get("dry_run", False))))
                return
            if parsed.path.startswith("/schemas/") and parsed.path.endswith("/compatibility-check"):
                subject = urllib.parse.unquote(parsed.path.split("/")[2])
                payload = self.read_json()
                self.respond_json(self.registry.compatibility_check(subject, payload.get("schema", payload), payload.get("against_version")))
                return
            if parsed.path == "/events/validate":
                self.respond_json(self.registry.validate_event(self.read_json()))
                return
            if parsed.path == "/consumers":
                self.respond_json(self.registry.register_consumer(self.read_json()), HTTPStatus.CREATED)
                return
            self.respond_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self.respond_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            raise ValueError("JSON body is required")
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("JSON body must be an object")
        return payload

    def respond_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        raw = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def respond_html(self, html: str) -> None:
        raw = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, format: str, *args: Any) -> None:
        return


def serve(args: argparse.Namespace) -> None:
    registry = SchemaRegistry(args.db_path)
    registry.seed_if_empty()
    RegistryHandler.registry = registry
    server = HTTPServer((args.host, args.port), RegistryHandler)
    print(f"Schema Registry POC running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")
    finally:
        server.server_close()
        registry.close()


def demo(args: argparse.Namespace) -> None:
    registry = SchemaRegistry(args.db_path)
    registry.seed_if_empty()
    result = registry.validate_event(
        {
            "subject_name": "OrderCreated",
            "version": 2,
            "event": {"order_id": "order-1", "customer_id": "customer-1", "total": 42.5},
        }
    )
    print(json.dumps({"validation": result, "snapshot": registry.snapshot()}, indent=2))
    registry.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Schema registry event contract POC")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH))
    sub = parser.add_subparsers(dest="command", required=True)
    serve_parser = sub.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8162)
    serve_parser.set_defaults(func=serve)
    demo_parser = sub.add_parser("demo")
    demo_parser.set_defaults(func=demo)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
