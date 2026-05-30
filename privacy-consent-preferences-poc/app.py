#!/usr/bin/env python3
"""Privacy consent and preferences POC.

This app models a compact privacy control plane: region-aware consent
defaults, purpose-level preferences, revocation, processing decisions, DSAR
requests, and audit history. It uses SQLite and Python's standard library so
it runs locally without external services.
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
DEFAULT_DB_PATH = RUNTIME_DIR / "privacy.db"

PURPOSES = {"marketing", "analytics", "personalization", "ads", "essential"}
CONSENT_STATUSES = {"GRANTED", "DENIED", "REVOKED"}
STRICT_REGIONS = {"EU", "UK", "CA"}
DSAR_TYPES = {"EXPORT", "DELETE"}
DSAR_STATUSES = {"REQUESTED", "IN_PROGRESS", "COMPLETED"}


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


def normalize_region(value: Any) -> str:
    region = str(value or "US").strip().upper()
    if not re.fullmatch(r"[A-Z]{2,3}", region):
        raise ValueError("region must be a 2 or 3 letter code")
    return region


def normalize_purpose(value: Any) -> str:
    purpose = str(value or "").strip().lower()
    if purpose not in PURPOSES:
        raise ValueError(f"purpose must be one of: {', '.join(sorted(PURPOSES))}")
    return purpose


def metadata(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("metadata must be an object")
    return value


def make_id(prefix: str) -> str:
    digest = hashlib.sha256(f"{prefix}:{time.time_ns()}".encode()).hexdigest()[:12]
    return f"{prefix}-{digest}"


class PrivacyConsent:
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
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                region TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS consents (
                consent_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                purpose TEXT NOT NULL,
                version INTEGER NOT NULL,
                status TEXT NOT NULL,
                source TEXT NOT NULL,
                policy_version TEXT NOT NULL,
                expires_at INTEGER,
                notes TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_consents_user_purpose
            ON consents(user_id, purpose, version DESC);

            CREATE TABLE IF NOT EXISTS processing_events (
                event_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                purpose TEXT NOT NULL,
                processor TEXT NOT NULL,
                resource TEXT NOT NULL,
                allowed INTEGER NOT NULL,
                reason TEXT NOT NULL,
                consent_version INTEGER,
                metadata_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dsar_requests (
                request_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                request_type TEXT NOT NULL,
                status TEXT NOT NULL,
                requested_at INTEGER NOT NULL,
                due_at INTEGER NOT NULL,
                completed_at INTEGER,
                actor TEXT NOT NULL,
                notes TEXT NOT NULL
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
        count = self.conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        if count:
            return
        self.create_user(
            {
                "user_id": "user-eu-1",
                "email": "ada@example.eu",
                "region": "EU",
                "metadata": {"plan": "pro", "locale": "en-IE"},
            },
            actor="seed",
        )
        self.create_user(
            {
                "user_id": "user-us-1",
                "email": "grace@example.com",
                "region": "US",
                "metadata": {"plan": "free", "locale": "en-US"},
            },
            actor="seed",
        )
        self.record_consent(
            {
                "user_id": "user-eu-1",
                "purpose": "analytics",
                "status": "GRANTED",
                "source": "preference-center",
                "policy_version": "privacy-2026.05",
            },
            actor="seed",
        )
        self.record_consent(
            {
                "user_id": "user-eu-1",
                "purpose": "ads",
                "status": "DENIED",
                "source": "cookie-banner",
                "policy_version": "privacy-2026.05",
            },
            actor="seed",
        )
        self.record_consent(
            {
                "user_id": "user-us-1",
                "purpose": "marketing",
                "status": "GRANTED",
                "source": "signup-checkbox",
                "policy_version": "privacy-2026.05",
            },
            actor="seed",
        )
        self.record_processing_event(
            {
                "user_id": "user-eu-1",
                "purpose": "analytics",
                "processor": "metrics-pipeline",
                "resource": "page_view",
                "metadata": {"sample": True},
            },
            actor="seed",
        )

    def create_user(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        user_id = token(payload.get("user_id"), "user_id")
        timestamp = now_ts()
        self.conn.execute(
            """
            INSERT INTO users(user_id, email, region, metadata_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                email = excluded.email,
                region = excluded.region,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            """,
            (
                user_id,
                token(payload.get("email"), "email"),
                normalize_region(payload.get("region")),
                encode_json(metadata(payload.get("metadata"))),
                timestamp,
                timestamp,
            ),
        )
        self.conn.commit()
        self.audit(actor, "upsert_user", user_id, "Registered privacy subject.")
        return self.get_user(user_id)

    def record_consent(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        user_id = token(payload.get("user_id"), "user_id")
        self.get_user(user_id)
        purpose = normalize_purpose(payload.get("purpose"))
        status = str(payload.get("status", "GRANTED")).strip().upper()
        if status not in CONSENT_STATUSES:
            raise ValueError("status must be GRANTED, DENIED, or REVOKED")
        latest = self.latest_consent(user_id, purpose)
        version = int(latest["version"]) + 1 if latest else 1
        expires_at = payload.get("expires_at")
        if expires_at is not None:
            expires_at = int(expires_at)
        cursor = self.conn.execute(
            """
            INSERT INTO consents(
                user_id, purpose, version, status, source, policy_version,
                expires_at, notes, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                purpose,
                version,
                status,
                token(payload.get("source", "api"), "source"),
                token(payload.get("policy_version", "privacy-2026.05"), "policy_version"),
                expires_at,
                optional_text(payload.get("notes")),
                now_ts(),
            ),
        )
        self.conn.commit()
        self.audit(actor, "record_consent", f"{user_id}:{purpose}", f"Recorded {status} consent v{version}.")
        return self.get_consent(int(cursor.lastrowid))

    def revoke_consent(self, user_id: str, purpose: str, actor: str = "api", notes: str = "") -> dict[str, Any]:
        return self.record_consent(
            {
                "user_id": user_id,
                "purpose": purpose,
                "status": "REVOKED",
                "source": "revocation",
                "policy_version": "privacy-2026.05",
                "notes": notes,
            },
            actor=actor,
        )

    def check_decision(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        user_id = token(payload.get("user_id"), "user_id")
        purpose = normalize_purpose(payload.get("purpose"))
        user = self.get_user(user_id)
        latest = self.latest_consent(user_id, purpose)
        timestamp = now_ts()
        if purpose == "essential":
            decision = {
                "user_id": user_id,
                "purpose": purpose,
                "allowed": True,
                "reason": "essential purpose is always allowed",
                "region": user["region"],
                "consent_version": latest["version"] if latest else None,
            }
        elif latest and latest["status"] == "GRANTED" and (latest["expires_at"] is None or latest["expires_at"] > timestamp):
            decision = {
                "user_id": user_id,
                "purpose": purpose,
                "allowed": True,
                "reason": f"explicit consent granted in version {latest['version']}",
                "region": user["region"],
                "consent_version": latest["version"],
            }
        elif latest and latest["status"] == "GRANTED":
            decision = {
                "user_id": user_id,
                "purpose": purpose,
                "allowed": False,
                "reason": f"consent version {latest['version']} expired",
                "region": user["region"],
                "consent_version": latest["version"],
            }
        elif latest:
            decision = {
                "user_id": user_id,
                "purpose": purpose,
                "allowed": False,
                "reason": f"latest consent is {latest['status'].lower()} in version {latest['version']}",
                "region": user["region"],
                "consent_version": latest["version"],
            }
        elif user["region"] in STRICT_REGIONS:
            decision = {
                "user_id": user_id,
                "purpose": purpose,
                "allowed": False,
                "reason": f"{user['region']} requires explicit consent for {purpose}",
                "region": user["region"],
                "consent_version": None,
            }
        elif purpose == "analytics":
            decision = {
                "user_id": user_id,
                "purpose": purpose,
                "allowed": True,
                "reason": "regional default allows first-party analytics until opt-out",
                "region": user["region"],
                "consent_version": None,
            }
        else:
            decision = {
                "user_id": user_id,
                "purpose": purpose,
                "allowed": False,
                "reason": f"{purpose} requires explicit opt-in",
                "region": user["region"],
                "consent_version": None,
            }
        self.audit(actor, "decision_check", f"{user_id}:{purpose}", decision["reason"])
        return decision

    def record_processing_event(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        decision = self.check_decision(payload, actor=actor)
        event_id = token(payload.get("event_id", make_id("evt")), "event_id")
        self.conn.execute(
            """
            INSERT INTO processing_events(
                event_id, user_id, purpose, processor, resource, allowed,
                reason, consent_version, metadata_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                decision["user_id"],
                decision["purpose"],
                token(payload.get("processor"), "processor"),
                token(payload.get("resource"), "resource"),
                int(decision["allowed"]),
                decision["reason"],
                decision["consent_version"],
                encode_json(metadata(payload.get("metadata"))),
                now_ts(),
            ),
        )
        self.conn.commit()
        self.audit(
            actor,
            "processing_event",
            event_id,
            f"Recorded processing decision allowed={decision['allowed']} for {decision['purpose']}.",
        )
        return self.get_processing_event(event_id)

    def create_dsar(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        user_id = token(payload.get("user_id"), "user_id")
        self.get_user(user_id)
        request_type = str(payload.get("request_type", "EXPORT")).strip().upper()
        if request_type not in DSAR_TYPES:
            raise ValueError("request_type must be EXPORT or DELETE")
        requested_at = now_ts()
        request_id = token(payload.get("request_id", make_id("dsar")), "request_id")
        self.conn.execute(
            """
            INSERT INTO dsar_requests(
                request_id, user_id, request_type, status, requested_at,
                due_at, completed_at, actor, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_id,
                user_id,
                request_type,
                "REQUESTED",
                requested_at,
                requested_at + 30 * 24 * 60 * 60,
                None,
                token(actor, "actor"),
                optional_text(payload.get("notes")),
            ),
        )
        self.conn.commit()
        self.audit(actor, "create_dsar", request_id, f"Created {request_type} request.")
        return self.get_dsar(request_id)

    def complete_dsar(self, request_id: str, actor: str = "api", notes: str = "") -> dict[str, Any]:
        request_id = token(request_id, "request_id")
        request = self.get_dsar(request_id)
        if request["status"] == "COMPLETED":
            return request
        timestamp = now_ts()
        self.conn.execute(
            """
            UPDATE dsar_requests
            SET status = ?, completed_at = ?, notes = ?
            WHERE request_id = ?
            """,
            ("COMPLETED", timestamp, optional_text(notes or request["notes"]), request_id),
        )
        self.conn.commit()
        if request["request_type"] == "DELETE":
            for purpose in sorted(PURPOSES - {"essential"}):
                self.revoke_consent(request["user_id"], purpose, actor=actor, notes=f"DSAR delete {request_id}")
        self.audit(actor, "complete_dsar", request_id, f"Completed {request['request_type']} request.")
        return self.get_dsar(request_id)

    def get_user(self, user_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown user: {user_id}")
        user = user_from_row(row)
        user["current_consents"] = {
            purpose: self.latest_consent(user_id, purpose) for purpose in sorted(PURPOSES) if self.latest_consent(user_id, purpose)
        }
        return user

    def get_consent(self, consent_id: int) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM consents WHERE consent_id = ?", (consent_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown consent: {consent_id}")
        return consent_from_row(row)

    def latest_consent(self, user_id: str, purpose: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            """
            SELECT * FROM consents
            WHERE user_id = ? AND purpose = ?
            ORDER BY version DESC, consent_id DESC
            LIMIT 1
            """,
            (user_id, purpose),
        ).fetchone()
        return consent_from_row(row) if row else None

    def get_processing_event(self, event_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM processing_events WHERE event_id = ?", (event_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown event: {event_id}")
        return processing_from_row(row)

    def get_dsar(self, request_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM dsar_requests WHERE request_id = ?", (request_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown request: {request_id}")
        return dsar_from_row(row)

    def list_users(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT user_id FROM users ORDER BY user_id").fetchall()
        return [self.get_user(row["user_id"]) for row in rows]

    def list_consents(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM consents ORDER BY created_at DESC, consent_id DESC").fetchall()
        return [consent_from_row(row) for row in rows]

    def list_processing_events(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM processing_events ORDER BY created_at DESC, event_id DESC"
        ).fetchall()
        return [processing_from_row(row) for row in rows]

    def list_dsar(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM dsar_requests ORDER BY requested_at DESC, request_id DESC").fetchall()
        return [dsar_from_row(row) for row in rows]

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
        latest = self.conn.execute(
            """
            SELECT c.*
            FROM consents c
            JOIN (
                SELECT user_id, purpose, MAX(version) AS max_version
                FROM consents
                GROUP BY user_id, purpose
            ) latest
            ON latest.user_id = c.user_id
            AND latest.purpose = c.purpose
            AND latest.max_version = c.version
            """
        ).fetchall()
        consent_counts = {"GRANTED": 0, "DENIED": 0, "REVOKED": 0}
        for row in latest:
            consent_counts[row["status"]] += 1
        scalar = lambda sql: self.conn.execute(sql).fetchone()["count"]
        return {
            "user_count": scalar("SELECT COUNT(*) AS count FROM users"),
            "current_consent_counts": consent_counts,
            "processing_event_count": scalar("SELECT COUNT(*) AS count FROM processing_events"),
            "policy_violation_count": scalar("SELECT COUNT(*) AS count FROM processing_events WHERE allowed = 0"),
            "open_dsar_count": scalar("SELECT COUNT(*) AS count FROM dsar_requests WHERE status != 'COMPLETED'"),
            "audit_event_count": scalar("SELECT COUNT(*) AS count FROM audit_events"),
            "purposes": sorted(PURPOSES),
            "strict_regions": sorted(STRICT_REGIONS),
        }


def user_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "user_id": row["user_id"],
        "email": row["email"],
        "region": row["region"],
        "metadata": decode_json(row["metadata_json"], {}),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def consent_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "consent_id": row["consent_id"],
        "user_id": row["user_id"],
        "purpose": row["purpose"],
        "version": row["version"],
        "status": row["status"],
        "source": row["source"],
        "policy_version": row["policy_version"],
        "expires_at": row["expires_at"],
        "notes": row["notes"],
        "created_at": row["created_at"],
    }


def processing_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "event_id": row["event_id"],
        "user_id": row["user_id"],
        "purpose": row["purpose"],
        "processor": row["processor"],
        "resource": row["resource"],
        "allowed": bool(row["allowed"]),
        "reason": row["reason"],
        "consent_version": row["consent_version"],
        "metadata": decode_json(row["metadata_json"], {}),
        "created_at": row["created_at"],
    }


def dsar_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "request_id": row["request_id"],
        "user_id": row["user_id"],
        "request_type": row["request_type"],
        "status": row["status"],
        "requested_at": row["requested_at"],
        "due_at": row["due_at"],
        "completed_at": row["completed_at"],
        "actor": row["actor"],
        "notes": row["notes"],
    }


class PrivacyHandler(BaseHTTPRequestHandler):
    store: PrivacyConsent

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
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            if path == "/":
                self.send_html()
            elif path == "/health":
                self.send_json(HTTPStatus.OK, {"status": "ok"})
            elif path == "/snapshot":
                self.send_json(HTTPStatus.OK, self.store.snapshot())
            elif path == "/users":
                self.send_json(HTTPStatus.OK, self.store.list_users())
            elif path == "/consents":
                self.send_json(HTTPStatus.OK, self.store.list_consents())
            elif path == "/processing-events":
                self.send_json(HTTPStatus.OK, self.store.list_processing_events())
            elif path == "/dsar":
                self.send_json(HTTPStatus.OK, self.store.list_dsar())
            elif path == "/audit":
                self.send_json(HTTPStatus.OK, self.store.list_audit())
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except ValueError as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def do_POST(self) -> None:
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            payload = self.read_json()
            actor = self.headers.get("X-Actor", "api")
            if path == "/users":
                self.send_json(HTTPStatus.CREATED, self.store.create_user(payload, actor=actor))
            elif path == "/consents":
                self.send_json(HTTPStatus.CREATED, self.store.record_consent(payload, actor=actor))
            elif path == "/consents/revoke":
                self.send_json(
                    HTTPStatus.CREATED,
                    self.store.revoke_consent(
                        token(payload.get("user_id"), "user_id"),
                        normalize_purpose(payload.get("purpose")),
                        actor=actor,
                        notes=optional_text(payload.get("notes")),
                    ),
                )
            elif path == "/decisions/check":
                self.send_json(HTTPStatus.OK, self.store.check_decision(payload, actor=actor))
            elif path == "/processing-events":
                self.send_json(HTTPStatus.CREATED, self.store.record_processing_event(payload, actor=actor))
            elif path == "/dsar":
                self.send_json(HTTPStatus.CREATED, self.store.create_dsar(payload, actor=actor))
            elif path.startswith("/dsar/") and path.endswith("/complete"):
                request_id = path.split("/")[2]
                self.send_json(HTTPStatus.OK, self.store.complete_dsar(request_id, actor=actor, notes=payload.get("notes", "")))
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except (json.JSONDecodeError, ValueError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def send_html(self) -> None:
        snapshot = self.store.snapshot()
        users = self.store.list_users()
        events = self.store.list_processing_events()[:8]
        dsars = self.store.list_dsar()[:8]
        html = render_html(snapshot, users, events, dsars).encode()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)


def render_html(snapshot: dict[str, Any], users: list[dict[str, Any]], events: list[dict[str, Any]], dsars: list[dict[str, Any]]) -> str:
    def esc(value: Any) -> str:
        return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    user_rows = "\n".join(
        f"<tr><td>{esc(user['user_id'])}</td><td>{esc(user['region'])}</td><td>{len(user['current_consents'])}</td></tr>"
        for user in users
    )
    event_rows = "\n".join(
        f"<tr><td>{esc(event['user_id'])}</td><td>{esc(event['purpose'])}</td><td>{'ALLOW' if event['allowed'] else 'DENY'}</td><td>{esc(event['reason'])}</td></tr>"
        for event in events
    )
    dsar_rows = "\n".join(
        f"<tr><td>{esc(item['request_id'])}</td><td>{esc(item['request_type'])}</td><td>{esc(item['status'])}</td></tr>"
        for item in dsars
    )
    granted = snapshot["current_consent_counts"]["GRANTED"]
    denied = snapshot["current_consent_counts"]["DENIED"]
    revoked = snapshot["current_consent_counts"]["REVOKED"]
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacy Consent Preferences POC</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; color: #1f2937; background: #f6f8fb; }}
    header {{ background: #0f172a; color: white; padding: 28px 36px; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 28px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }}
    h2 {{ margin: 0 0 14px; font-size: 18px; }}
    p {{ margin: 0; color: #cbd5e1; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 22px; }}
    .metric, section {{ background: white; border: 1px solid #dbe3ef; border-radius: 8px; padding: 18px; }}
    .metric strong {{ display: block; font-size: 28px; color: #111827; }}
    .metric span {{ color: #64748b; font-size: 13px; }}
    .layout {{ display: grid; grid-template-columns: 1fr 1.4fr; gap: 18px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; vertical-align: top; }}
    th {{ color: #475569; font-size: 12px; text-transform: uppercase; }}
    code {{ background: #eef2f7; border-radius: 4px; padding: 2px 5px; }}
    @media (max-width: 820px) {{ .grid, .layout {{ grid-template-columns: 1fr; }} main {{ padding: 18px; }} }}
  </style>
</head>
<body>
  <header>
    <h1>Privacy Consent Preferences POC</h1>
    <p>Region-aware consent decisions, revocation, processing enforcement, DSAR workflow, and audit history.</p>
  </header>
  <main>
    <div class="grid">
      <div class="metric"><strong>{snapshot['user_count']}</strong><span>users</span></div>
      <div class="metric"><strong>{granted}</strong><span>current grants</span></div>
      <div class="metric"><strong>{denied + revoked}</strong><span>denied or revoked</span></div>
      <div class="metric"><strong>{snapshot['policy_violation_count']}</strong><span>blocked processing events</span></div>
    </div>
    <div class="layout">
      <section>
        <h2>Privacy Subjects</h2>
        <table><thead><tr><th>User</th><th>Region</th><th>Current Consents</th></tr></thead><tbody>{user_rows}</tbody></table>
      </section>
      <section>
        <h2>Processing Decisions</h2>
        <table><thead><tr><th>User</th><th>Purpose</th><th>Decision</th><th>Reason</th></tr></thead><tbody>{event_rows}</tbody></table>
      </section>
    </div>
    <section style="margin-top:18px">
      <h2>DSAR Requests</h2>
      <table><thead><tr><th>Request</th><th>Type</th><th>Status</th></tr></thead><tbody>{dsar_rows}</tbody></table>
    </section>
  </main>
</body>
</html>"""


def run_demo(db_path: Path) -> None:
    store = PrivacyConsent(db_path)
    try:
        store.seed_if_empty()
        denied = store.record_processing_event(
            {
                "user_id": "user-eu-1",
                "purpose": "marketing",
                "processor": "campaign-service",
                "resource": "newsletter",
            },
            actor="demo",
        )
        granted = store.record_consent(
            {
                "user_id": "user-eu-1",
                "purpose": "marketing",
                "status": "GRANTED",
                "source": "preference-center",
                "policy_version": "privacy-2026.05",
            },
            actor="demo",
        )
        allowed = store.record_processing_event(
            {
                "user_id": "user-eu-1",
                "purpose": "marketing",
                "processor": "campaign-service",
                "resource": "newsletter",
            },
            actor="demo",
        )
        dsar = store.create_dsar({"user_id": "user-us-1", "request_type": "EXPORT"}, actor="demo")
        print(json.dumps({"denied_event": denied, "grant": granted, "allowed_event": allowed, "dsar": dsar, "snapshot": store.snapshot()}, indent=2, sort_keys=True))
    finally:
        store.close()


def serve(db_path: Path, host: str, port: int) -> None:
    store = PrivacyConsent(db_path)
    store.seed_if_empty()
    PrivacyHandler.store = store
    server = HTTPServer((host, port), PrivacyHandler)
    print(f"Serving privacy consent POC on http://{host}:{port}")
    try:
        server.serve_forever()
    finally:
        store.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Privacy consent preferences POC")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("demo")
    serve_parser = subparsers.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8170)
    args = parser.parse_args()
    if args.command == "demo":
        run_demo(args.db_path)
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
