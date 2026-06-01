#!/usr/bin/env python3
"""Data subject rights orchestrator POC.

This app models a compact DSAR orchestration plane: request intake, service
inventory, task fanout, retries, blockers, export bundle assembly, deletion
receipts, SLA tracking, and audit history. It uses SQLite and Python's
standard library so it runs locally without external services.
"""

from __future__ import annotations

import argparse
import hashlib
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
DEFAULT_DB_PATH = RUNTIME_DIR / "dsar.db"

REQUEST_TYPES = {"EXPORT", "DELETE", "CORRECT", "RESTRICT_PROCESSING"}
REQUEST_STATUSES = {"REQUESTED", "IN_PROGRESS", "COMPLETED", "FAILED", "BLOCKED"}
TASK_STATUSES = {"PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "BLOCKED"}
STRICT_DELETE_SERVICES = {"billing-service"}


def now_ts() -> int:
    return int(time.time())


def encode_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def decode_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)


def token(value: Any, field: str, max_len: int = 180) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    if not re.fullmatch(r"[A-Za-z0-9._:/@+-]+", result):
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, slash, at, plus, or dash")
    return result


def optional_text(value: Any, max_len: int = 1000) -> str:
    if value is None:
        return ""
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"value must be at most {max_len} characters")
    return result


def metadata(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("metadata must be an object")
    return value


def make_id(prefix: str) -> str:
    digest = hashlib.sha256(f"{prefix}:{time.time_ns()}".encode()).hexdigest()[:12]
    return f"{prefix}-{digest}"


class DataSubjectRightsOrchestrator:
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
            CREATE TABLE IF NOT EXISTS services (
                service_id TEXT PRIMARY KEY,
                owner_team TEXT NOT NULL,
                supports_json TEXT NOT NULL,
                data_scope TEXT NOT NULL,
                fail_until_attempt INTEGER NOT NULL,
                timeout_seconds INTEGER NOT NULL,
                legal_hold INTEGER NOT NULL,
                active INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS requests (
                request_id TEXT PRIMARY KEY,
                subject_id TEXT NOT NULL,
                request_type TEXT NOT NULL,
                status TEXT NOT NULL,
                due_at INTEGER NOT NULL,
                requested_at INTEGER NOT NULL,
                completed_at INTEGER,
                actor TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                notes TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                status TEXT NOT NULL,
                attempt_count INTEGER NOT NULL,
                max_attempts INTEGER NOT NULL,
                due_at INTEGER NOT NULL,
                result_json TEXT NOT NULL,
                error TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                completed_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                resource TEXT NOT NULL,
                message TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def seed_if_empty(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) AS count FROM services").fetchone()["count"]
        if count:
            return
        self.upsert_service(
            {
                "service_id": "profile-service",
                "owner_team": "identity",
                "supports": ["EXPORT", "DELETE", "CORRECT", "RESTRICT_PROCESSING"],
                "data_scope": "profile, email, preferences",
            },
            actor="seed",
        )
        self.upsert_service(
            {
                "service_id": "billing-service",
                "owner_team": "payments",
                "supports": ["EXPORT", "DELETE", "CORRECT"],
                "data_scope": "invoices, payment profile, tax records",
                "legal_hold": True,
            },
            actor="seed",
        )
        self.upsert_service(
            {
                "service_id": "analytics-service",
                "owner_team": "data-platform",
                "supports": ["EXPORT", "DELETE", "RESTRICT_PROCESSING"],
                "data_scope": "events and attribution data",
                "fail_until_attempt": 2,
            },
            actor="seed",
        )
        self.create_request(
            {
                "request_id": "dsar-export-ada",
                "subject_id": "user-eu-1",
                "request_type": "EXPORT",
                "payload": {"format": "json"},
                "notes": "Seed export request.",
            },
            actor="seed",
        )

    def upsert_service(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        service_id = token(payload.get("service_id"), "service_id")
        supports = [str(item).strip().upper() for item in payload.get("supports", [])]
        if not supports or any(item not in REQUEST_TYPES for item in supports):
            raise ValueError("supports must contain valid request types")
        timestamp = now_ts()
        self.conn.execute(
            """
            INSERT INTO services(
                service_id, owner_team, supports_json, data_scope, fail_until_attempt,
                timeout_seconds, legal_hold, active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(service_id) DO UPDATE SET
                owner_team = excluded.owner_team,
                supports_json = excluded.supports_json,
                data_scope = excluded.data_scope,
                fail_until_attempt = excluded.fail_until_attempt,
                timeout_seconds = excluded.timeout_seconds,
                legal_hold = excluded.legal_hold,
                active = excluded.active,
                updated_at = excluded.updated_at
            """,
            (
                service_id,
                token(payload.get("owner_team"), "owner_team"),
                encode_json(sorted(set(supports))),
                optional_text(payload.get("data_scope")),
                int(payload.get("fail_until_attempt", 0)),
                int(payload.get("timeout_seconds", 24 * 60 * 60)),
                int(bool(payload.get("legal_hold", False))),
                int(payload.get("active", True)),
                timestamp,
                timestamp,
            ),
        )
        self.conn.commit()
        self.audit(actor, "upsert_service", service_id, "Registered downstream service.")
        return self.get_service(service_id)

    def create_request(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        request_type = str(payload.get("request_type", "EXPORT")).strip().upper()
        if request_type not in REQUEST_TYPES:
            raise ValueError("request_type must be EXPORT, DELETE, CORRECT, or RESTRICT_PROCESSING")
        request_id = token(payload.get("request_id", make_id("dsar")), "request_id")
        requested_at = now_ts()
        due_at = int(payload.get("due_at", requested_at + 30 * 24 * 60 * 60))
        self.conn.execute(
            """
            INSERT INTO requests(
                request_id, subject_id, request_type, status, due_at, requested_at,
                completed_at, actor, payload_json, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_id,
                token(payload.get("subject_id"), "subject_id"),
                request_type,
                "REQUESTED",
                due_at,
                requested_at,
                None,
                token(actor, "actor"),
                encode_json(metadata(payload.get("payload"))),
                optional_text(payload.get("notes")),
            ),
        )
        self.conn.commit()
        self.fanout_tasks(request_id, actor=actor)
        self.update_request_status(request_id)
        self.audit(actor, "create_request", request_id, f"Created {request_type} request.")
        return self.get_request(request_id)

    def fanout_tasks(self, request_id: str, actor: str = "api") -> list[dict[str, Any]]:
        request = self.get_request(request_id, include_tasks=False)
        services = self.services_for_type(request["request_type"])
        tasks = []
        for service in services:
            task_id = f"task-{request_id}-{service['service_id']}"
            existing = self.conn.execute("SELECT task_id FROM tasks WHERE task_id = ?", (task_id,)).fetchone()
            if existing:
                tasks.append(self.get_task(task_id))
                continue
            self.conn.execute(
                """
                INSERT INTO tasks(
                    task_id, request_id, service_id, status, attempt_count, max_attempts,
                    due_at, result_json, error, created_at, updated_at, completed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    request_id,
                    service["service_id"],
                    "PENDING",
                    0,
                    3,
                    min(request["due_at"], now_ts() + service["timeout_seconds"]),
                    encode_json({}),
                    "",
                    now_ts(),
                    now_ts(),
                    None,
                ),
            )
            self.conn.commit()
            self.audit(actor, "fanout_task", task_id, f"Assigned {request['request_type']} to {service['service_id']}.")
            tasks.append(self.get_task(task_id))
        return tasks

    def run_tasks(self, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        run_at = int(timestamp or now_ts())
        rows = self.conn.execute(
            """
            SELECT task_id FROM tasks
            WHERE status IN ('PENDING', 'FAILED')
            AND attempt_count < max_attempts
            ORDER BY created_at, task_id
            """
        ).fetchall()
        processed = [self.process_task(row["task_id"], actor=actor, timestamp=run_at) for row in rows]
        touched = sorted({task["request_id"] for task in processed})
        for request_id in touched:
            self.update_request_status(request_id)
        return {"processed_count": len(processed), "tasks": processed}

    def process_task(self, task_id: str, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        run_at = int(timestamp or now_ts())
        task = self.get_task(task_id)
        request = self.get_request(task["request_id"], include_tasks=False)
        service = self.get_service(task["service_id"])
        if task["status"] in {"COMPLETED", "BLOCKED"}:
            return task
        if run_at > task["due_at"]:
            return self.transition_task(task_id, "FAILED", {}, "task timed out before service response", actor)
        if request["request_type"] == "DELETE" and service["legal_hold"]:
            return self.transition_task(task_id, "BLOCKED", {}, "legal hold blocks deletion", actor)
        next_attempt = task["attempt_count"] + 1
        self.conn.execute("UPDATE tasks SET status = 'IN_PROGRESS', attempt_count = ?, updated_at = ? WHERE task_id = ?", (next_attempt, run_at, task_id))
        self.conn.commit()
        if service["fail_until_attempt"] and next_attempt <= service["fail_until_attempt"]:
            updated = self.transition_task(task_id, "FAILED", {}, f"simulated downstream failure on attempt {next_attempt}", actor)
            self.update_request_status(task["request_id"])
            return updated
        result = self.result_for(request, service, next_attempt)
        updated = self.transition_task(task_id, "COMPLETED", result, "", actor)
        self.update_request_status(task["request_id"])
        return updated

    def transition_task(self, task_id: str, status: str, result: dict[str, Any], error: str, actor: str = "api") -> dict[str, Any]:
        status = str(status).upper()
        if status not in TASK_STATUSES:
            raise ValueError("invalid task status")
        completed_at = now_ts() if status in {"COMPLETED", "BLOCKED"} else None
        self.conn.execute(
            """
            UPDATE tasks
            SET status = ?, result_json = ?, error = ?, updated_at = ?, completed_at = ?
            WHERE task_id = ?
            """,
            (status, encode_json(result), optional_text(error), now_ts(), completed_at, task_id),
        )
        self.conn.commit()
        self.audit(actor, "transition_task", task_id, f"Task moved to {status}.")
        return self.get_task(task_id)

    def result_for(self, request: dict[str, Any], service: dict[str, Any], attempt: int) -> dict[str, Any]:
        if request["request_type"] == "EXPORT":
            return {
                "records": [
                    {
                        "service": service["service_id"],
                        "subject_id": request["subject_id"],
                        "scope": service["data_scope"],
                    }
                ],
                "attempt": attempt,
            }
        if request["request_type"] == "DELETE":
            return {
                "receipt_id": make_id("receipt"),
                "deleted_subject_id": request["subject_id"],
                "service": service["service_id"],
            }
        if request["request_type"] == "CORRECT":
            return {
                "corrected_subject_id": request["subject_id"],
                "applied_patch": request["payload"],
                "service": service["service_id"],
            }
        return {
            "restricted_subject_id": request["subject_id"],
            "processing_restricted": True,
            "service": service["service_id"],
        }

    def update_request_status(self, request_id: str) -> dict[str, Any]:
        request = self.get_request(request_id, include_tasks=False)
        tasks = self.tasks_for_request(request_id)
        if not tasks:
            status = "FAILED"
        elif any(task["status"] == "BLOCKED" for task in tasks):
            status = "BLOCKED"
        elif all(task["status"] == "COMPLETED" for task in tasks):
            status = "COMPLETED"
        elif any(task["status"] in {"PENDING", "IN_PROGRESS", "FAILED"} for task in tasks):
            status = "IN_PROGRESS"
        else:
            status = request["status"]
        completed_at = now_ts() if status == "COMPLETED" else None
        self.conn.execute(
            "UPDATE requests SET status = ?, completed_at = ? WHERE request_id = ?",
            (status, completed_at, request_id),
        )
        self.conn.commit()
        return self.get_request(request_id)

    def assemble_export_bundle(self, request_id: str, actor: str = "api") -> dict[str, Any]:
        request = self.get_request(request_id)
        if request["request_type"] != "EXPORT":
            raise ValueError("export bundle is only available for EXPORT requests")
        if request["status"] != "COMPLETED":
            raise ValueError("request must be completed before assembling export bundle")
        bundle = {
            "request_id": request_id,
            "subject_id": request["subject_id"],
            "assembled_at": now_ts(),
            "service_count": len(request["tasks"]),
            "records": [],
        }
        for task in request["tasks"]:
            bundle["records"].extend(task["result"].get("records", []))
        self.audit(actor, "assemble_export", request_id, f"Assembled {len(bundle['records'])} exported records.")
        return bundle

    def deletion_receipts(self, request_id: str, actor: str = "api") -> dict[str, Any]:
        request = self.get_request(request_id)
        if request["request_type"] != "DELETE":
            raise ValueError("deletion receipts are only available for DELETE requests")
        receipts = [task["result"] for task in request["tasks"] if task["status"] == "COMPLETED" and task["result"].get("receipt_id")]
        self.audit(actor, "read_receipts", request_id, f"Read {len(receipts)} deletion receipts.")
        return {"request_id": request_id, "status": request["status"], "receipts": receipts}

    def get_service(self, service_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM services WHERE service_id = ?", (service_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown service: {service_id}")
        return service_from_row(row)

    def get_request(self, request_id: str, include_tasks: bool = True) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM requests WHERE request_id = ?", (request_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown request: {request_id}")
        request = request_from_row(row)
        if include_tasks:
            request["tasks"] = self.tasks_for_request(request_id)
            request["sla"] = sla_status(request)
        return request

    def get_task(self, task_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM tasks WHERE task_id = ?", (task_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown task: {task_id}")
        return task_from_row(row)

    def services_for_type(self, request_type: str) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM services WHERE active = 1 ORDER BY service_id").fetchall()
        return [service_from_row(row) for row in rows if request_type in decode_json(row["supports_json"], [])]

    def tasks_for_request(self, request_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM tasks WHERE request_id = ? ORDER BY service_id", (request_id,)).fetchall()
        return [task_from_row(row) for row in rows]

    def list_services(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM services ORDER BY service_id").fetchall()
        return [service_from_row(row) for row in rows]

    def list_requests(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT request_id FROM requests ORDER BY requested_at DESC, request_id DESC").fetchall()
        return [self.get_request(row["request_id"]) for row in rows]

    def list_tasks(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM tasks ORDER BY updated_at DESC, task_id DESC").fetchall()
        return [task_from_row(row) for row in rows]

    def audit(self, actor: str, action: str, resource: str, message: str) -> None:
        self.conn.execute(
            "INSERT INTO audit_events(created_at, actor, action, resource, message) VALUES (?, ?, ?, ?, ?)",
            (now_ts(), optional_text(actor, 120) or "system", token(action, "action"), optional_text(resource, 180), optional_text(message)),
        )
        self.conn.commit()

    def list_audit(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM audit_events ORDER BY created_at DESC, audit_id DESC").fetchall()
        return [dict(row) for row in rows]

    def snapshot(self) -> dict[str, Any]:
        request_rows = self.conn.execute("SELECT status, COUNT(*) AS count FROM requests GROUP BY status").fetchall()
        task_rows = self.conn.execute("SELECT status, COUNT(*) AS count FROM tasks GROUP BY status").fetchall()
        scalar = lambda sql: self.conn.execute(sql).fetchone()["count"]
        overdue = len([request for request in self.list_requests() if request["sla"]["status"] == "OVERDUE"])
        return {
            "service_count": scalar("SELECT COUNT(*) AS count FROM services"),
            "request_count": scalar("SELECT COUNT(*) AS count FROM requests"),
            "requests_by_status": {row["status"]: row["count"] for row in request_rows},
            "tasks_by_status": {row["status"]: row["count"] for row in task_rows},
            "blocked_task_count": scalar("SELECT COUNT(*) AS count FROM tasks WHERE status = 'BLOCKED'"),
            "overdue_request_count": overdue,
            "audit_event_count": scalar("SELECT COUNT(*) AS count FROM audit_events"),
        }


def service_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "service_id": row["service_id"],
        "owner_team": row["owner_team"],
        "supports": decode_json(row["supports_json"], []),
        "data_scope": row["data_scope"],
        "fail_until_attempt": row["fail_until_attempt"],
        "timeout_seconds": row["timeout_seconds"],
        "legal_hold": bool(row["legal_hold"]),
        "active": bool(row["active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def request_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "request_id": row["request_id"],
        "subject_id": row["subject_id"],
        "request_type": row["request_type"],
        "status": row["status"],
        "due_at": row["due_at"],
        "requested_at": row["requested_at"],
        "completed_at": row["completed_at"],
        "actor": row["actor"],
        "payload": decode_json(row["payload_json"], {}),
        "notes": row["notes"],
    }


def task_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "task_id": row["task_id"],
        "request_id": row["request_id"],
        "service_id": row["service_id"],
        "status": row["status"],
        "attempt_count": row["attempt_count"],
        "max_attempts": row["max_attempts"],
        "due_at": row["due_at"],
        "result": decode_json(row["result_json"], {}),
        "error": row["error"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "completed_at": row["completed_at"],
    }


def sla_status(request: dict[str, Any]) -> dict[str, Any]:
    remaining = request["due_at"] - now_ts()
    if request["status"] == "COMPLETED":
        status = "MET" if request["completed_at"] and request["completed_at"] <= request["due_at"] else "LATE"
    elif remaining < 0:
        status = "OVERDUE"
    elif remaining < 3 * 24 * 60 * 60:
        status = "AT_RISK"
    else:
        status = "ON_TRACK"
    return {"status": status, "seconds_remaining": remaining}


class DSARHandler(BaseHTTPRequestHandler):
    store: DataSubjectRightsOrchestrator

    def log_message(self, format: str, *args: Any) -> None:
        return

    def send_json(self, status: HTTPStatus, body: Any) -> None:
        payload = json.dumps(body, indent=2, sort_keys=True).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self) -> dict[str, Any]:
        size = int(self.headers.get("Content-Length", "0"))
        if size == 0:
            return {}
        return json.loads(self.rfile.read(size).decode())

    def do_GET(self) -> None:
        try:
            path = urllib.parse.urlparse(self.path).path.rstrip("/") or "/"
            if path == "/":
                self.send_html()
            elif path == "/health":
                self.send_json(HTTPStatus.OK, {"status": "ok"})
            elif path == "/snapshot":
                self.send_json(HTTPStatus.OK, self.store.snapshot())
            elif path == "/services":
                self.send_json(HTTPStatus.OK, self.store.list_services())
            elif path == "/requests":
                self.send_json(HTTPStatus.OK, self.store.list_requests())
            elif path == "/tasks":
                self.send_json(HTTPStatus.OK, self.store.list_tasks())
            elif path == "/audit":
                self.send_json(HTTPStatus.OK, self.store.list_audit())
            elif path.startswith("/requests/") and path.endswith("/export-bundle"):
                self.send_json(HTTPStatus.OK, self.store.assemble_export_bundle(path.split("/")[2]))
            elif path.startswith("/requests/") and path.endswith("/deletion-receipts"):
                self.send_json(HTTPStatus.OK, self.store.deletion_receipts(path.split("/")[2]))
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except ValueError as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def do_POST(self) -> None:
        try:
            path = urllib.parse.urlparse(self.path).path.rstrip("/") or "/"
            payload = self.read_json()
            actor = self.headers.get("X-Actor", "api")
            if path == "/services":
                self.send_json(HTTPStatus.CREATED, self.store.upsert_service(payload, actor=actor))
            elif path == "/requests":
                self.send_json(HTTPStatus.CREATED, self.store.create_request(payload, actor=actor))
            elif path == "/tasks/run":
                self.send_json(HTTPStatus.OK, self.store.run_tasks(actor=actor, timestamp=payload.get("timestamp")))
            elif path.startswith("/tasks/") and path.endswith("/process"):
                self.send_json(HTTPStatus.OK, self.store.process_task(path.split("/")[2], actor=actor, timestamp=payload.get("timestamp")))
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except (json.JSONDecodeError, ValueError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def send_html(self) -> None:
        html = render_html(self.store.snapshot(), self.store.list_requests(), self.store.list_tasks()[:10]).encode()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)


def render_html(snapshot: dict[str, Any], requests: list[dict[str, Any]], tasks: list[dict[str, Any]]) -> str:
    def esc(value: Any) -> str:
        return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    request_rows = "\n".join(
        f"<tr><td>{esc(item['request_id'])}</td><td>{esc(item['request_type'])}</td><td>{esc(item['status'])}</td><td>{esc(item['sla']['status'])}</td></tr>"
        for item in requests
    )
    task_rows = "\n".join(
        f"<tr><td>{esc(item['service_id'])}</td><td>{esc(item['status'])}</td><td>{esc(item['attempt_count'])}</td><td>{esc(item['error'])}</td></tr>"
        for item in tasks
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Data Subject Rights Orchestrator POC</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; color: #172033; background: #f7f9fc; }}
    header {{ background: #17324d; color: white; padding: 28px 36px; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 28px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }}
    h2 {{ margin: 0 0 14px; font-size: 18px; }}
    p {{ margin: 0; color: #d6e2ef; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 22px; }}
    .metric, section {{ background: white; border: 1px solid #dce5f2; border-radius: 8px; padding: 18px; }}
    .metric strong {{ display: block; font-size: 28px; color: #0f172a; }}
    .metric span {{ color: #64748b; font-size: 13px; }}
    .layout {{ display: grid; grid-template-columns: 1.1fr 1fr; gap: 18px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; vertical-align: top; }}
    th {{ color: #475569; font-size: 12px; text-transform: uppercase; }}
    @media (max-width: 820px) {{ .grid, .layout {{ grid-template-columns: 1fr; }} main {{ padding: 18px; }} }}
  </style>
</head>
<body>
  <header>
    <h1>Data Subject Rights Orchestrator POC</h1>
    <p>Request intake, service fanout, retries, blockers, export bundles, deletion receipts, and SLA tracking.</p>
  </header>
  <main>
    <div class="grid">
      <div class="metric"><strong>{snapshot['service_count']}</strong><span>services</span></div>
      <div class="metric"><strong>{snapshot['request_count']}</strong><span>requests</span></div>
      <div class="metric"><strong>{snapshot['blocked_task_count']}</strong><span>blocked tasks</span></div>
      <div class="metric"><strong>{snapshot['overdue_request_count']}</strong><span>overdue requests</span></div>
    </div>
    <div class="layout">
      <section>
        <h2>Requests</h2>
        <table><thead><tr><th>Request</th><th>Type</th><th>Status</th><th>SLA</th></tr></thead><tbody>{request_rows}</tbody></table>
      </section>
      <section>
        <h2>Tasks</h2>
        <table><thead><tr><th>Service</th><th>Status</th><th>Attempts</th><th>Error</th></tr></thead><tbody>{task_rows}</tbody></table>
      </section>
    </div>
  </main>
</body>
</html>"""


def run_demo(db_path: Path) -> None:
    store = DataSubjectRightsOrchestrator(db_path)
    try:
        store.seed_if_empty()
        first = store.run_tasks(actor="demo")
        second = store.run_tasks(actor="demo")
        third = store.run_tasks(actor="demo")
        bundle = store.assemble_export_bundle("dsar-export-ada", actor="demo")
        delete_request = store.create_request(
            {"subject_id": "acct-123", "request_type": "DELETE", "notes": "Seed delete request."},
            actor="demo",
        )
        blocked = store.run_tasks(actor="demo")
        print(
            json.dumps(
                {
                    "first_run": first,
                    "second_run": second,
                    "third_run": third,
                    "export_bundle": bundle,
                    "delete_request": delete_request,
                    "blocked_delete_run": blocked,
                    "snapshot": store.snapshot(),
                },
                indent=2,
                sort_keys=True,
            )
        )
    finally:
        store.close()


def serve(db_path: Path, host: str, port: int) -> None:
    store = DataSubjectRightsOrchestrator(db_path)
    store.seed_if_empty()
    DSARHandler.store = store
    server = HTTPServer((host, port), DSARHandler)
    print(f"Serving data subject rights orchestrator POC on http://{host}:{port}")
    try:
        server.serve_forever()
    finally:
        store.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Data subject rights orchestrator POC")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("demo")
    serve_parser = subparsers.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8172)
    args = parser.parse_args()
    if args.command == "demo":
        run_demo(args.db_path)
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
