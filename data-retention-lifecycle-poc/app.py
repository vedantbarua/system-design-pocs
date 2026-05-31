#!/usr/bin/env python3
"""Data retention lifecycle POC.

This app models a compact retention control plane: policy matching, lifecycle
scans, archive/anonymize/delete jobs, legal hold overrides, and audit history.
It uses SQLite and Python's standard library so it runs locally without
external services.
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
DEFAULT_DB_PATH = RUNTIME_DIR / "retention.db"

STATES = {"ACTIVE", "ARCHIVED", "ANONYMIZED", "DELETION_PENDING", "DELETED", "LEGAL_HOLD"}
ACTIONS = {"RETAIN", "ARCHIVE", "ANONYMIZE", "DELETE", "LEGAL_HOLD"}
JOB_ACTIONS = {"ARCHIVE", "ANONYMIZE", "DELETE"}
JOB_STATUSES = {"QUEUED", "COMPLETED"}


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
    if not re.fullmatch(r"[A-Za-z0-9._:/@*+-]+", result):
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, slash, at, star, plus, or dash")
    return result


def optional_text(value: Any, max_len: int = 1000) -> str:
    if value is None:
        return ""
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"value must be at most {max_len} characters")
    return result


def normalize_region(value: Any) -> str:
    region = str(value or "*").strip().upper()
    if region == "*":
        return region
    if not re.fullmatch(r"[A-Z]{2,3}", region):
        raise ValueError("region must be *, or a 2 or 3 letter code")
    return region


def normalize_state(value: Any) -> str:
    state = str(value or "ACTIVE").strip().upper()
    if state not in STATES:
        raise ValueError(f"state must be one of: {', '.join(sorted(STATES))}")
    return state


def metadata(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("metadata must be an object")
    return value


def make_id(prefix: str) -> str:
    digest = hashlib.sha256(f"{prefix}:{time.time_ns()}".encode()).hexdigest()[:12]
    return f"{prefix}-{digest}"


class RetentionLifecycle:
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
            CREATE TABLE IF NOT EXISTS policies (
                policy_id TEXT PRIMARY KEY,
                data_type TEXT NOT NULL,
                region TEXT NOT NULL,
                purpose TEXT NOT NULL,
                retention_days INTEGER NOT NULL,
                archive_after_days INTEGER NOT NULL,
                terminal_action TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS records (
                record_id TEXT PRIMARY KEY,
                data_type TEXT NOT NULL,
                region TEXT NOT NULL,
                purpose TEXT NOT NULL,
                owner_service TEXT NOT NULL,
                subject_id TEXT NOT NULL,
                state TEXT NOT NULL,
                legal_hold INTEGER NOT NULL,
                hold_reason TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_accessed_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS lifecycle_decisions (
                decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id TEXT NOT NULL,
                policy_id TEXT,
                action TEXT NOT NULL,
                job_id TEXT,
                allowed INTEGER NOT NULL,
                reason TEXT NOT NULL,
                age_days INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                record_id TEXT NOT NULL,
                action TEXT NOT NULL,
                status TEXT NOT NULL,
                reason TEXT NOT NULL,
                created_at INTEGER NOT NULL,
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
        count = self.conn.execute("SELECT COUNT(*) AS count FROM policies").fetchone()["count"]
        if count:
            return
        self.upsert_policy(
            {
                "policy_id": "policy.eu.marketing-delete",
                "data_type": "profile",
                "region": "EU",
                "purpose": "marketing",
                "retention_days": 365,
                "archive_after_days": 180,
                "terminal_action": "DELETE",
                "description": "EU marketing profile data expires after one year.",
            },
            actor="seed",
        )
        self.upsert_policy(
            {
                "policy_id": "policy.us.analytics-anonymize",
                "data_type": "event",
                "region": "US",
                "purpose": "analytics",
                "retention_days": 730,
                "archive_after_days": 90,
                "terminal_action": "ANONYMIZE",
                "description": "US analytics events are anonymized after two years.",
            },
            actor="seed",
        )
        self.upsert_policy(
            {
                "policy_id": "policy.global.billing-delete",
                "data_type": "billing",
                "region": "*",
                "purpose": "finance",
                "retention_days": 2555,
                "archive_after_days": 365,
                "terminal_action": "DELETE",
                "description": "Billing records are retained for seven years.",
            },
            actor="seed",
        )
        base = now_ts()
        self.register_record(
            {
                "record_id": "rec-eu-marketing-expired",
                "data_type": "profile",
                "region": "EU",
                "purpose": "marketing",
                "owner_service": "campaign-service",
                "subject_id": "user-eu-1",
                "created_at": base - 420 * 24 * 60 * 60,
                "last_accessed_at": base - 200 * 24 * 60 * 60,
                "metadata": {"email": "ada@example.eu", "segment": "trial"},
            },
            actor="seed",
        )
        self.register_record(
            {
                "record_id": "rec-us-analytics-archive",
                "data_type": "event",
                "region": "US",
                "purpose": "analytics",
                "owner_service": "metrics-pipeline",
                "subject_id": "user-us-1",
                "created_at": base - 120 * 24 * 60 * 60,
                "last_accessed_at": base - 100 * 24 * 60 * 60,
                "metadata": {"event": "page_view", "url": "/pricing"},
            },
            actor="seed",
        )
        self.register_record(
            {
                "record_id": "rec-billing-hold",
                "data_type": "billing",
                "region": "US",
                "purpose": "finance",
                "owner_service": "payments",
                "subject_id": "acct-123",
                "created_at": base - 3000 * 24 * 60 * 60,
                "last_accessed_at": base - 400 * 24 * 60 * 60,
                "metadata": {"invoice": "inv-1001", "amount": 1200},
            },
            actor="seed",
        )
        self.place_legal_hold("rec-billing-hold", "audit-review", actor="seed")

    def upsert_policy(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        policy_id = token(payload.get("policy_id"), "policy_id")
        retention_days = int(payload.get("retention_days", 365))
        archive_after_days = int(payload.get("archive_after_days", retention_days))
        if retention_days < 1 or retention_days > 36500:
            raise ValueError("retention_days must be between 1 and 36500")
        if archive_after_days < 0 or archive_after_days > retention_days:
            raise ValueError("archive_after_days must be between 0 and retention_days")
        terminal_action = str(payload.get("terminal_action", "DELETE")).strip().upper()
        if terminal_action not in {"DELETE", "ANONYMIZE"}:
            raise ValueError("terminal_action must be DELETE or ANONYMIZE")
        timestamp = now_ts()
        self.conn.execute(
            """
            INSERT INTO policies(
                policy_id, data_type, region, purpose, retention_days,
                archive_after_days, terminal_action, description, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(policy_id) DO UPDATE SET
                data_type = excluded.data_type,
                region = excluded.region,
                purpose = excluded.purpose,
                retention_days = excluded.retention_days,
                archive_after_days = excluded.archive_after_days,
                terminal_action = excluded.terminal_action,
                description = excluded.description,
                updated_at = excluded.updated_at
            """,
            (
                policy_id,
                token(payload.get("data_type"), "data_type"),
                normalize_region(payload.get("region")),
                token(payload.get("purpose"), "purpose"),
                retention_days,
                archive_after_days,
                terminal_action,
                optional_text(payload.get("description")),
                timestamp,
                timestamp,
            ),
        )
        self.conn.commit()
        self.audit(actor, "upsert_policy", policy_id, "Registered retention policy.")
        return self.get_policy(policy_id)

    def register_record(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        record_id = token(payload.get("record_id"), "record_id")
        timestamp = now_ts()
        created_at = int(payload.get("created_at", timestamp))
        last_accessed_at = int(payload.get("last_accessed_at", created_at))
        state = normalize_state(payload.get("state", "ACTIVE"))
        self.conn.execute(
            """
            INSERT INTO records(
                record_id, data_type, region, purpose, owner_service, subject_id,
                state, legal_hold, hold_reason, created_at, last_accessed_at,
                updated_at, metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(record_id) DO UPDATE SET
                data_type = excluded.data_type,
                region = excluded.region,
                purpose = excluded.purpose,
                owner_service = excluded.owner_service,
                subject_id = excluded.subject_id,
                state = excluded.state,
                last_accessed_at = excluded.last_accessed_at,
                updated_at = excluded.updated_at,
                metadata_json = excluded.metadata_json
            """,
            (
                record_id,
                token(payload.get("data_type"), "data_type"),
                normalize_region(payload.get("region")),
                token(payload.get("purpose"), "purpose"),
                token(payload.get("owner_service"), "owner_service"),
                token(payload.get("subject_id"), "subject_id"),
                state,
                int(bool(payload.get("legal_hold", False))),
                optional_text(payload.get("hold_reason")),
                created_at,
                last_accessed_at,
                timestamp,
                encode_json(metadata(payload.get("metadata"))),
            ),
        )
        self.conn.commit()
        self.audit(actor, "register_record", record_id, f"Registered record in {state}.")
        return self.get_record(record_id)

    def place_legal_hold(self, record_id: str, reason: str, actor: str = "api") -> dict[str, Any]:
        record_id = token(record_id, "record_id")
        self.get_record(record_id)
        self.conn.execute(
            "UPDATE records SET legal_hold = 1, hold_reason = ?, state = 'LEGAL_HOLD', updated_at = ? WHERE record_id = ?",
            (optional_text(reason), now_ts(), record_id),
        )
        self.conn.commit()
        self.audit(actor, "place_legal_hold", record_id, optional_text(reason))
        return self.get_record(record_id)

    def release_legal_hold(self, record_id: str, actor: str = "api") -> dict[str, Any]:
        record_id = token(record_id, "record_id")
        self.get_record(record_id)
        self.conn.execute(
            "UPDATE records SET legal_hold = 0, hold_reason = '', state = 'ACTIVE', updated_at = ? WHERE record_id = ?",
            (now_ts(), record_id),
        )
        self.conn.commit()
        self.audit(actor, "release_legal_hold", record_id, "Released legal hold.")
        return self.get_record(record_id)

    def scan(self, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        scan_at = int(timestamp or now_ts())
        rows = self.conn.execute(
            "SELECT record_id FROM records WHERE state != 'DELETED' ORDER BY record_id"
        ).fetchall()
        decisions = [self.evaluate_record(row["record_id"], scan_at, actor=actor) for row in rows]
        summary: dict[str, int] = {}
        for decision in decisions:
            summary[decision["action"]] = summary.get(decision["action"], 0) + 1
        self.audit(actor, "retention_scan", "records", f"Scanned {len(decisions)} records.")
        return {"scanned_at": scan_at, "decision_count": len(decisions), "actions": summary, "decisions": decisions}

    def evaluate_record(self, record_id: str, scan_at: int, actor: str = "api") -> dict[str, Any]:
        record = self.get_record(record_id)
        age_days = max(0, (scan_at - record["created_at"]) // (24 * 60 * 60))
        policy = self.match_policy(record)
        if not policy:
            return self.record_decision(record_id, None, "RETAIN", True, "no matching retention policy", age_days, None)
        if record["legal_hold"]:
            return self.record_decision(
                record_id,
                policy["policy_id"],
                "LEGAL_HOLD",
                False,
                f"legal hold blocks {policy['terminal_action'].lower()}",
                age_days,
                None,
            )
        if record["state"] in {"DELETION_PENDING", "ANONYMIZED"}:
            return self.record_decision(record_id, policy["policy_id"], "RETAIN", True, f"record already {record['state'].lower()}", age_days, None)
        if age_days >= policy["retention_days"]:
            job = self.enqueue_job(record_id, policy["terminal_action"], f"retention age {age_days}d >= {policy['retention_days']}d", actor=actor)
            return self.record_decision(
                record_id,
                policy["policy_id"],
                policy["terminal_action"],
                True,
                job["reason"],
                age_days,
                job["job_id"],
            )
        if record["state"] == "ACTIVE" and age_days >= policy["archive_after_days"]:
            job = self.enqueue_job(record_id, "ARCHIVE", f"archive age {age_days}d >= {policy['archive_after_days']}d", actor=actor)
            return self.record_decision(record_id, policy["policy_id"], "ARCHIVE", True, job["reason"], age_days, job["job_id"])
        return self.record_decision(record_id, policy["policy_id"], "RETAIN", True, f"age {age_days}d below policy threshold", age_days, None)

    def match_policy(self, record: dict[str, Any]) -> dict[str, Any] | None:
        rows = self.conn.execute(
            """
            SELECT * FROM policies
            WHERE data_type = ?
            AND purpose = ?
            AND region IN (?, '*')
            ORDER BY CASE WHEN region = ? THEN 0 ELSE 1 END
            LIMIT 1
            """,
            (record["data_type"], record["purpose"], record["region"], record["region"]),
        ).fetchall()
        return policy_from_row(rows[0]) if rows else None

    def enqueue_job(self, record_id: str, action: str, reason: str, actor: str = "api") -> dict[str, Any]:
        action = str(action).upper()
        if action not in JOB_ACTIONS:
            raise ValueError("job action must be ARCHIVE, ANONYMIZE, or DELETE")
        existing = self.conn.execute(
            "SELECT * FROM jobs WHERE record_id = ? AND action = ? AND status = 'QUEUED' ORDER BY created_at DESC LIMIT 1",
            (record_id, action),
        ).fetchone()
        if existing:
            return job_from_row(existing)
        job_id = make_id("job")
        self.conn.execute(
            "INSERT INTO jobs(job_id, record_id, action, status, reason, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (job_id, record_id, action, "QUEUED", optional_text(reason), now_ts(), None),
        )
        if action == "ARCHIVE":
            new_state = "ARCHIVED"
        else:
            new_state = "DELETION_PENDING"
        self.conn.execute("UPDATE records SET state = ?, updated_at = ? WHERE record_id = ?", (new_state, now_ts(), record_id))
        self.conn.commit()
        self.audit(actor, "enqueue_job", job_id, f"Queued {action} for {record_id}.")
        return self.get_job(job_id)

    def complete_job(self, job_id: str, actor: str = "api") -> dict[str, Any]:
        job_id = token(job_id, "job_id")
        job = self.get_job(job_id)
        if job["status"] == "COMPLETED":
            return job
        if job["action"] == "ARCHIVE":
            state = "ARCHIVED"
        elif job["action"] == "ANONYMIZE":
            state = "ANONYMIZED"
            self.conn.execute(
                "UPDATE records SET subject_id = ?, metadata_json = ? WHERE record_id = ?",
                ("anon", encode_json({"anonymized": True}), job["record_id"]),
            )
        else:
            state = "DELETED"
            self.conn.execute(
                "UPDATE records SET metadata_json = ? WHERE record_id = ?",
                (encode_json({"deleted": True}), job["record_id"]),
            )
        self.conn.execute(
            "UPDATE records SET state = ?, updated_at = ? WHERE record_id = ?",
            (state, now_ts(), job["record_id"]),
        )
        self.conn.execute(
            "UPDATE jobs SET status = 'COMPLETED', completed_at = ? WHERE job_id = ?",
            (now_ts(), job_id),
        )
        self.conn.commit()
        self.audit(actor, "complete_job", job_id, f"Completed {job['action']} for {job['record_id']}.")
        return self.get_job(job_id)

    def run_queued_jobs(self, actor: str = "api") -> dict[str, Any]:
        rows = self.conn.execute("SELECT job_id FROM jobs WHERE status = 'QUEUED' ORDER BY created_at, job_id").fetchall()
        completed = [self.complete_job(row["job_id"], actor=actor) for row in rows]
        return {"completed_count": len(completed), "jobs": completed}

    def record_decision(self, record_id: str, policy_id: str | None, action: str, allowed: bool, reason: str, age_days: int, job_id: str | None) -> dict[str, Any]:
        cursor = self.conn.execute(
            """
            INSERT INTO lifecycle_decisions(record_id, policy_id, action, job_id, allowed, reason, age_days, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (record_id, policy_id, action, job_id, int(allowed), optional_text(reason), age_days, now_ts()),
        )
        self.conn.commit()
        return self.get_decision(int(cursor.lastrowid))

    def get_policy(self, policy_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM policies WHERE policy_id = ?", (policy_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown policy: {policy_id}")
        return policy_from_row(row)

    def get_record(self, record_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM records WHERE record_id = ?", (record_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown record: {record_id}")
        record = record_from_row(row)
        record["matched_policy"] = self.match_policy(record)
        return record

    def get_job(self, job_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown job: {job_id}")
        return job_from_row(row)

    def get_decision(self, decision_id: int) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM lifecycle_decisions WHERE decision_id = ?", (decision_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown decision: {decision_id}")
        return decision_from_row(row)

    def list_policies(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM policies ORDER BY policy_id").fetchall()
        return [policy_from_row(row) for row in rows]

    def list_records(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT record_id FROM records ORDER BY record_id").fetchall()
        return [self.get_record(row["record_id"]) for row in rows]

    def list_jobs(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM jobs ORDER BY created_at DESC, job_id DESC").fetchall()
        return [job_from_row(row) for row in rows]

    def list_decisions(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM lifecycle_decisions ORDER BY created_at DESC, decision_id DESC").fetchall()
        return [decision_from_row(row) for row in rows]

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
        state_rows = self.conn.execute("SELECT state, COUNT(*) AS count FROM records GROUP BY state").fetchall()
        job_rows = self.conn.execute("SELECT status, COUNT(*) AS count FROM jobs GROUP BY status").fetchall()
        action_rows = self.conn.execute("SELECT action, COUNT(*) AS count FROM lifecycle_decisions GROUP BY action").fetchall()
        scalar = lambda sql: self.conn.execute(sql).fetchone()["count"]
        return {
            "policy_count": scalar("SELECT COUNT(*) AS count FROM policies"),
            "record_count": scalar("SELECT COUNT(*) AS count FROM records"),
            "records_by_state": {row["state"]: row["count"] for row in state_rows},
            "jobs_by_status": {row["status"]: row["count"] for row in job_rows},
            "decisions_by_action": {row["action"]: row["count"] for row in action_rows},
            "legal_hold_count": scalar("SELECT COUNT(*) AS count FROM records WHERE legal_hold = 1"),
            "queued_job_count": scalar("SELECT COUNT(*) AS count FROM jobs WHERE status = 'QUEUED'"),
            "audit_event_count": scalar("SELECT COUNT(*) AS count FROM audit_events"),
        }


def policy_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "policy_id": row["policy_id"],
        "data_type": row["data_type"],
        "region": row["region"],
        "purpose": row["purpose"],
        "retention_days": row["retention_days"],
        "archive_after_days": row["archive_after_days"],
        "terminal_action": row["terminal_action"],
        "description": row["description"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def record_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "record_id": row["record_id"],
        "data_type": row["data_type"],
        "region": row["region"],
        "purpose": row["purpose"],
        "owner_service": row["owner_service"],
        "subject_id": row["subject_id"],
        "state": row["state"],
        "legal_hold": bool(row["legal_hold"]),
        "hold_reason": row["hold_reason"],
        "created_at": row["created_at"],
        "last_accessed_at": row["last_accessed_at"],
        "updated_at": row["updated_at"],
        "metadata": decode_json(row["metadata_json"], {}),
    }


def decision_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "decision_id": row["decision_id"],
        "record_id": row["record_id"],
        "policy_id": row["policy_id"],
        "action": row["action"],
        "job_id": row["job_id"],
        "allowed": bool(row["allowed"]),
        "reason": row["reason"],
        "age_days": row["age_days"],
        "created_at": row["created_at"],
    }


def job_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "job_id": row["job_id"],
        "record_id": row["record_id"],
        "action": row["action"],
        "status": row["status"],
        "reason": row["reason"],
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
    }


class RetentionHandler(BaseHTTPRequestHandler):
    store: RetentionLifecycle

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
            elif path == "/policies":
                self.send_json(HTTPStatus.OK, self.store.list_policies())
            elif path == "/records":
                self.send_json(HTTPStatus.OK, self.store.list_records())
            elif path == "/jobs":
                self.send_json(HTTPStatus.OK, self.store.list_jobs())
            elif path == "/decisions":
                self.send_json(HTTPStatus.OK, self.store.list_decisions())
            elif path == "/audit":
                self.send_json(HTTPStatus.OK, self.store.list_audit())
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except ValueError as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def do_POST(self) -> None:
        try:
            path = urllib.parse.urlparse(self.path).path.rstrip("/") or "/"
            payload = self.read_json()
            actor = self.headers.get("X-Actor", "api")
            if path == "/policies":
                self.send_json(HTTPStatus.CREATED, self.store.upsert_policy(payload, actor=actor))
            elif path == "/records":
                self.send_json(HTTPStatus.CREATED, self.store.register_record(payload, actor=actor))
            elif path == "/scan":
                self.send_json(HTTPStatus.OK, self.store.scan(actor=actor, timestamp=payload.get("timestamp")))
            elif path == "/jobs/run":
                self.send_json(HTTPStatus.OK, self.store.run_queued_jobs(actor=actor))
            elif path.startswith("/jobs/") and path.endswith("/complete"):
                job_id = path.split("/")[2]
                self.send_json(HTTPStatus.OK, self.store.complete_job(job_id, actor=actor))
            elif path.startswith("/records/") and path.endswith("/legal-hold"):
                record_id = path.split("/")[2]
                self.send_json(HTTPStatus.OK, self.store.place_legal_hold(record_id, payload.get("reason", ""), actor=actor))
            elif path.startswith("/records/") and path.endswith("/release-hold"):
                record_id = path.split("/")[2]
                self.send_json(HTTPStatus.OK, self.store.release_legal_hold(record_id, actor=actor))
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except (json.JSONDecodeError, ValueError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def send_html(self) -> None:
        snapshot = self.store.snapshot()
        records = self.store.list_records()
        jobs = self.store.list_jobs()[:8]
        decisions = self.store.list_decisions()[:8]
        html = render_html(snapshot, records, jobs, decisions).encode()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)


def render_html(snapshot: dict[str, Any], records: list[dict[str, Any]], jobs: list[dict[str, Any]], decisions: list[dict[str, Any]]) -> str:
    def esc(value: Any) -> str:
        return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    record_rows = "\n".join(
        f"<tr><td>{esc(record['record_id'])}</td><td>{esc(record['data_type'])}</td><td>{esc(record['state'])}</td><td>{'yes' if record['legal_hold'] else 'no'}</td></tr>"
        for record in records
    )
    job_rows = "\n".join(
        f"<tr><td>{esc(job['job_id'])}</td><td>{esc(job['action'])}</td><td>{esc(job['status'])}</td><td>{esc(job['record_id'])}</td></tr>"
        for job in jobs
    )
    decision_rows = "\n".join(
        f"<tr><td>{esc(item['record_id'])}</td><td>{esc(item['action'])}</td><td>{esc(item['age_days'])}d</td><td>{esc(item['reason'])}</td></tr>"
        for item in decisions
    )
    states = snapshot["records_by_state"]
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Data Retention Lifecycle POC</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; color: #172033; background: #f7f9fc; }}
    header {{ background: #152238; color: white; padding: 28px 36px; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 28px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }}
    h2 {{ margin: 0 0 14px; font-size: 18px; }}
    p {{ margin: 0; color: #d7deea; }}
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
    <h1>Data Retention Lifecycle POC</h1>
    <p>Policy matching, scheduled lifecycle scans, legal hold overrides, deletion/anonymization jobs, and audit history.</p>
  </header>
  <main>
    <div class="grid">
      <div class="metric"><strong>{snapshot['policy_count']}</strong><span>policies</span></div>
      <div class="metric"><strong>{snapshot['record_count']}</strong><span>records</span></div>
      <div class="metric"><strong>{snapshot['queued_job_count']}</strong><span>queued jobs</span></div>
      <div class="metric"><strong>{snapshot['legal_hold_count']}</strong><span>legal holds</span></div>
    </div>
    <div class="layout">
      <section>
        <h2>Records</h2>
        <table><thead><tr><th>Record</th><th>Type</th><th>State</th><th>Hold</th></tr></thead><tbody>{record_rows}</tbody></table>
      </section>
      <section>
        <h2>Jobs</h2>
        <table><thead><tr><th>Job</th><th>Action</th><th>Status</th><th>Record</th></tr></thead><tbody>{job_rows}</tbody></table>
      </section>
    </div>
    <section style="margin-top:18px">
      <h2>Recent Decisions</h2>
      <table><thead><tr><th>Record</th><th>Action</th><th>Age</th><th>Reason</th></tr></thead><tbody>{decision_rows}</tbody></table>
    </section>
  </main>
</body>
</html>"""


def run_demo(db_path: Path) -> None:
    store = RetentionLifecycle(db_path)
    try:
        store.seed_if_empty()
        scan = store.scan(actor="demo")
        completed = store.run_queued_jobs(actor="demo")
        print(json.dumps({"scan": scan, "completed": completed, "snapshot": store.snapshot()}, indent=2, sort_keys=True))
    finally:
        store.close()


def serve(db_path: Path, host: str, port: int) -> None:
    store = RetentionLifecycle(db_path)
    store.seed_if_empty()
    RetentionHandler.store = store
    server = HTTPServer((host, port), RetentionHandler)
    print(f"Serving data retention lifecycle POC on http://{host}:{port}")
    try:
        server.serve_forever()
    finally:
        store.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Data retention lifecycle POC")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("demo")
    serve_parser = subparsers.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8171)
    args = parser.parse_args()
    if args.command == "demo":
        run_demo(args.db_path)
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
