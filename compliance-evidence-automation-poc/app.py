#!/usr/bin/env python3
"""Compliance evidence automation POC.

This app models a compact compliance evidence plane: control registry,
scheduled evidence collection, freshness checks, exceptions, audit package
generation, evidence checksums, readiness status, and audit history. It uses
SQLite and Python's standard library so it runs locally without external
services.
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
DEFAULT_DB_PATH = RUNTIME_DIR / "compliance.db"

CONTROL_STATUSES = {"PASS", "WARN", "FAIL", "MISSING"}
EXCEPTION_STATUSES = {"OPEN", "IN_PROGRESS", "REMEDIATED", "ACCEPTED"}
FRAMEWORKS = {"SOC2", "GDPR", "HIPAA"}


def now_ts() -> int:
    return int(time.time())


def encode_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def decode_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)


def checksum(value: Any) -> str:
    return hashlib.sha256(encode_json(value).encode()).hexdigest()


def make_id(prefix: str) -> str:
    digest = hashlib.sha256(f"{prefix}:{time.time_ns()}".encode()).hexdigest()[:12]
    return f"{prefix}-{digest}"


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


class ComplianceEvidence:
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
            CREATE TABLE IF NOT EXISTS controls (
                control_id TEXT PRIMARY KEY,
                framework TEXT NOT NULL,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                owner TEXT NOT NULL,
                evidence_ttl_days INTEGER NOT NULL,
                required_sources_json TEXT NOT NULL,
                active INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS evidence (
                evidence_id TEXT PRIMARY KEY,
                control_id TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_ref TEXT NOT NULL,
                collected_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                checksum TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assessments (
                assessment_id INTEGER PRIMARY KEY AUTOINCREMENT,
                control_id TEXT NOT NULL,
                status TEXT NOT NULL,
                reasons_json TEXT NOT NULL,
                fresh_evidence_count INTEGER NOT NULL,
                assessed_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS exceptions (
                exception_id TEXT PRIMARY KEY,
                control_id TEXT NOT NULL,
                owner TEXT NOT NULL,
                status TEXT NOT NULL,
                due_at INTEGER NOT NULL,
                notes TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_packages (
                package_id TEXT PRIMARY KEY,
                framework TEXT NOT NULL,
                status TEXT NOT NULL,
                generated_at INTEGER NOT NULL,
                controls_json TEXT NOT NULL,
                evidence_json TEXT NOT NULL,
                exceptions_json TEXT NOT NULL,
                checksum TEXT NOT NULL
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
        count = self.conn.execute("SELECT COUNT(*) AS count FROM controls").fetchone()["count"]
        if count:
            return
        controls = [
            {
                "control_id": "gdpr.consent-decisions",
                "framework": "GDPR",
                "category": "privacy",
                "title": "Consent decisions are recorded with purpose and reason.",
                "owner": "privacy-platform",
                "evidence_ttl_days": 7,
                "required_sources": ["consent_log", "decision_log"],
            },
            {
                "control_id": "gdpr.retention-deletion",
                "framework": "GDPR",
                "category": "retention",
                "title": "Expired personal data is deleted or anonymized.",
                "owner": "data-governance",
                "evidence_ttl_days": 14,
                "required_sources": ["retention_scan", "deletion_receipt"],
            },
            {
                "control_id": "gdpr.dsar-completion",
                "framework": "GDPR",
                "category": "privacy",
                "title": "Data subject requests complete within SLA.",
                "owner": "privacy-ops",
                "evidence_ttl_days": 7,
                "required_sources": ["dsar_task_log", "export_bundle"],
            },
            {
                "control_id": "soc2.access-review",
                "framework": "SOC2",
                "category": "access",
                "title": "Privileged access is reviewed regularly.",
                "owner": "security",
                "evidence_ttl_days": 30,
                "required_sources": ["access_review"],
            },
            {
                "control_id": "soc2.incident-review",
                "framework": "SOC2",
                "category": "incident",
                "title": "Incidents have timelines and action-item closure.",
                "owner": "sre",
                "evidence_ttl_days": 30,
                "required_sources": ["incident_postmortem", "action_items"],
            },
        ]
        for control in controls:
            self.upsert_control(control, actor="seed")
        self.collect_evidence("gdpr.consent-decisions", actor="seed")
        self.collect_evidence("gdpr.retention-deletion", actor="seed")
        self.collect_evidence("gdpr.dsar-completion", actor="seed")
        self.collect_evidence("soc2.access-review", actor="seed")
        self.create_exception(
            {
                "exception_id": "ex-soc2-incident-actions",
                "control_id": "soc2.incident-review",
                "owner": "sre",
                "status": "OPEN",
                "due_at": now_ts() + 3 * 24 * 60 * 60,
                "notes": "Action item evidence migration is in progress.",
            },
            actor="seed",
        )

    def upsert_control(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        control_id = token(payload.get("control_id"), "control_id")
        framework = str(payload.get("framework", "SOC2")).strip().upper()
        if framework not in FRAMEWORKS:
            raise ValueError("framework must be SOC2, GDPR, or HIPAA")
        ttl = int(payload.get("evidence_ttl_days", 30))
        if ttl < 1 or ttl > 3650:
            raise ValueError("evidence_ttl_days must be between 1 and 3650")
        sources = [token(item, "required_source") for item in payload.get("required_sources", [])]
        if not sources:
            raise ValueError("required_sources must not be empty")
        timestamp = now_ts()
        self.conn.execute(
            """
            INSERT INTO controls(
                control_id, framework, category, title, owner, evidence_ttl_days,
                required_sources_json, active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(control_id) DO UPDATE SET
                framework = excluded.framework,
                category = excluded.category,
                title = excluded.title,
                owner = excluded.owner,
                evidence_ttl_days = excluded.evidence_ttl_days,
                required_sources_json = excluded.required_sources_json,
                active = excluded.active,
                updated_at = excluded.updated_at
            """,
            (
                control_id,
                framework,
                token(payload.get("category"), "category"),
                optional_text(payload.get("title")),
                token(payload.get("owner"), "owner"),
                ttl,
                encode_json(sorted(set(sources))),
                int(payload.get("active", True)),
                timestamp,
                timestamp,
            ),
        )
        self.conn.commit()
        self.audit(actor, "upsert_control", control_id, "Registered compliance control.")
        return self.get_control(control_id)

    def collect_evidence(self, control_id: str, actor: str = "api", collected_at: int | None = None) -> list[dict[str, Any]]:
        control = self.get_control(control_id)
        collected = int(collected_at or now_ts())
        results = []
        for source in control["required_sources"]:
            payload = self.synthetic_source_payload(control, source, collected)
            evidence_id = make_id("ev")
            digest = checksum(payload)
            self.conn.execute(
                """
                INSERT INTO evidence(
                    evidence_id, control_id, source_type, source_ref,
                    collected_at, expires_at, payload_json, checksum
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    evidence_id,
                    control_id,
                    source,
                    f"{source}:{collected}",
                    collected,
                    collected + control["evidence_ttl_days"] * 24 * 60 * 60,
                    encode_json(payload),
                    digest,
                ),
            )
            self.conn.commit()
            results.append(self.get_evidence(evidence_id))
        self.audit(actor, "collect_evidence", control_id, f"Collected {len(results)} evidence records.")
        self.assess_control(control_id, actor=actor)
        return results

    def synthetic_source_payload(self, control: dict[str, Any], source: str, collected_at: int) -> dict[str, Any]:
        return {
            "control_id": control["control_id"],
            "source_type": source,
            "collected_at": collected_at,
            "sample_count": 3,
            "source_summary": f"Sampled {source} for {control['title']}",
        }

    def assess_control(self, control_id: str, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        control = self.get_control(control_id)
        assessed_at = int(timestamp or now_ts())
        fresh = self.fresh_evidence_by_source(control_id, assessed_at)
        exceptions = self.open_exceptions(control_id)
        reasons: list[str] = []
        missing = [source for source in control["required_sources"] if source not in fresh]
        overdue = [item for item in exceptions if item["due_at"] < assessed_at and item["status"] != "ACCEPTED"]
        if overdue:
            status = "FAIL"
            reasons.append(f"{len(overdue)} exception(s) overdue")
        elif missing:
            status = "MISSING"
            reasons.append(f"missing fresh evidence: {', '.join(missing)}")
        elif exceptions:
            status = "WARN"
            reasons.append(f"{len(exceptions)} open exception(s)")
        elif any(item["expires_at"] - assessed_at <= 24 * 60 * 60 for item in fresh.values()):
            status = "WARN"
            reasons.append("evidence expires within 24 hours")
        else:
            status = "PASS"
            reasons.append("all required evidence is fresh")
        cursor = self.conn.execute(
            """
            INSERT INTO assessments(control_id, status, reasons_json, fresh_evidence_count, assessed_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (control_id, status, encode_json(reasons), len(fresh), assessed_at),
        )
        self.conn.commit()
        self.audit(actor, "assess_control", control_id, f"Control assessed as {status}.")
        return self.get_assessment(int(cursor.lastrowid))

    def assess_all(self, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        assessments = [self.assess_control(control["control_id"], actor=actor, timestamp=timestamp) for control in self.list_controls()]
        summary: dict[str, int] = {}
        for item in assessments:
            summary[item["status"]] = summary.get(item["status"], 0) + 1
        return {"assessment_count": len(assessments), "status_counts": summary, "assessments": assessments}

    def create_exception(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        exception_id = token(payload.get("exception_id", make_id("ex")), "exception_id")
        control_id = token(payload.get("control_id"), "control_id")
        self.get_control(control_id)
        status = str(payload.get("status", "OPEN")).strip().upper()
        if status not in EXCEPTION_STATUSES:
            raise ValueError("status must be OPEN, IN_PROGRESS, REMEDIATED, or ACCEPTED")
        timestamp = now_ts()
        self.conn.execute(
            """
            INSERT INTO exceptions(exception_id, control_id, owner, status, due_at, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(exception_id) DO UPDATE SET
                owner = excluded.owner,
                status = excluded.status,
                due_at = excluded.due_at,
                notes = excluded.notes,
                updated_at = excluded.updated_at
            """,
            (
                exception_id,
                control_id,
                token(payload.get("owner"), "owner"),
                status,
                int(payload.get("due_at", timestamp + 7 * 24 * 60 * 60)),
                optional_text(payload.get("notes")),
                timestamp,
                timestamp,
            ),
        )
        self.conn.commit()
        self.audit(actor, "upsert_exception", exception_id, f"Exception for {control_id} is {status}.")
        self.assess_control(control_id, actor=actor)
        return self.get_exception(exception_id)

    def generate_package(self, framework: str, actor: str = "api") -> dict[str, Any]:
        framework = str(framework).strip().upper()
        if framework not in FRAMEWORKS:
            raise ValueError("framework must be SOC2, GDPR, or HIPAA")
        controls = [control for control in self.list_controls() if control["framework"] == framework]
        for control in controls:
            self.assess_control(control["control_id"], actor=actor)
        packaged_controls = []
        packaged_evidence = []
        packaged_exceptions = []
        statuses = []
        for control in controls:
            latest = self.latest_assessment(control["control_id"])
            item = dict(control)
            item["latest_assessment"] = latest
            packaged_controls.append(item)
            statuses.append(latest["status"] if latest else "MISSING")
            packaged_evidence.extend(self.evidence_for_control(control["control_id"]))
            packaged_exceptions.extend(self.exceptions_for_control(control["control_id"]))
        package_status = "FAIL" if "FAIL" in statuses else "MISSING" if "MISSING" in statuses else "WARN" if "WARN" in statuses else "PASS"
        body = {
            "framework": framework,
            "status": package_status,
            "controls": packaged_controls,
            "evidence": packaged_evidence,
            "exceptions": packaged_exceptions,
        }
        package_id = make_id("pkg")
        digest = checksum(body)
        self.conn.execute(
            """
            INSERT INTO audit_packages(
                package_id, framework, status, generated_at, controls_json,
                evidence_json, exceptions_json, checksum
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                package_id,
                framework,
                package_status,
                now_ts(),
                encode_json(packaged_controls),
                encode_json(packaged_evidence),
                encode_json(packaged_exceptions),
                digest,
            ),
        )
        self.conn.commit()
        self.audit(actor, "generate_package", package_id, f"Generated {framework} package with status {package_status}.")
        return self.get_package(package_id)

    def get_control(self, control_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM controls WHERE control_id = ?", (control_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown control: {control_id}")
        control = control_from_row(row)
        control["latest_assessment"] = self.latest_assessment(control_id)
        return control

    def get_evidence(self, evidence_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM evidence WHERE evidence_id = ?", (evidence_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown evidence: {evidence_id}")
        return evidence_from_row(row)

    def get_assessment(self, assessment_id: int) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM assessments WHERE assessment_id = ?", (assessment_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown assessment: {assessment_id}")
        return assessment_from_row(row)

    def get_exception(self, exception_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM exceptions WHERE exception_id = ?", (exception_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown exception: {exception_id}")
        return exception_from_row(row)

    def get_package(self, package_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM audit_packages WHERE package_id = ?", (package_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown package: {package_id}")
        return package_from_row(row)

    def latest_assessment(self, control_id: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT * FROM assessments WHERE control_id = ? ORDER BY assessed_at DESC, assessment_id DESC LIMIT 1",
            (control_id,),
        ).fetchone()
        return assessment_from_row(row) if row else None

    def fresh_evidence_by_source(self, control_id: str, timestamp: int) -> dict[str, dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT * FROM evidence
            WHERE control_id = ? AND expires_at > ?
            ORDER BY collected_at DESC, evidence_id DESC
            """,
            (control_id, timestamp),
        ).fetchall()
        fresh: dict[str, dict[str, Any]] = {}
        for row in rows:
            item = evidence_from_row(row)
            fresh.setdefault(item["source_type"], item)
        return fresh

    def evidence_for_control(self, control_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM evidence WHERE control_id = ? ORDER BY collected_at DESC", (control_id,)).fetchall()
        return [evidence_from_row(row) for row in rows]

    def exceptions_for_control(self, control_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM exceptions WHERE control_id = ? ORDER BY due_at", (control_id,)).fetchall()
        return [exception_from_row(row) for row in rows]

    def open_exceptions(self, control_id: str) -> list[dict[str, Any]]:
        return [item for item in self.exceptions_for_control(control_id) if item["status"] in {"OPEN", "IN_PROGRESS"}]

    def list_controls(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT control_id FROM controls ORDER BY framework, control_id").fetchall()
        return [self.get_control(row["control_id"]) for row in rows]

    def list_evidence(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM evidence ORDER BY collected_at DESC, evidence_id DESC").fetchall()
        return [evidence_from_row(row) for row in rows]

    def list_exceptions(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM exceptions ORDER BY due_at, exception_id").fetchall()
        return [exception_from_row(row) for row in rows]

    def list_packages(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM audit_packages ORDER BY generated_at DESC, package_id DESC").fetchall()
        return [package_from_row(row) for row in rows]

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
        latest = [control["latest_assessment"] for control in self.list_controls() if control["latest_assessment"]]
        status_counts: dict[str, int] = {}
        for item in latest:
            status_counts[item["status"]] = status_counts.get(item["status"], 0) + 1
        scalar = lambda sql: self.conn.execute(sql).fetchone()["count"]
        current = now_ts()
        expired = scalar(f"SELECT COUNT(*) AS count FROM evidence WHERE expires_at <= {current}")
        return {
            "control_count": scalar("SELECT COUNT(*) AS count FROM controls"),
            "evidence_count": scalar("SELECT COUNT(*) AS count FROM evidence"),
            "expired_evidence_count": expired,
            "exception_count": scalar("SELECT COUNT(*) AS count FROM exceptions"),
            "open_exception_count": scalar("SELECT COUNT(*) AS count FROM exceptions WHERE status IN ('OPEN', 'IN_PROGRESS')"),
            "package_count": scalar("SELECT COUNT(*) AS count FROM audit_packages"),
            "control_status_counts": status_counts,
            "audit_event_count": scalar("SELECT COUNT(*) AS count FROM audit_events"),
        }


def control_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "control_id": row["control_id"],
        "framework": row["framework"],
        "category": row["category"],
        "title": row["title"],
        "owner": row["owner"],
        "evidence_ttl_days": row["evidence_ttl_days"],
        "required_sources": decode_json(row["required_sources_json"], []),
        "active": bool(row["active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def evidence_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "evidence_id": row["evidence_id"],
        "control_id": row["control_id"],
        "source_type": row["source_type"],
        "source_ref": row["source_ref"],
        "collected_at": row["collected_at"],
        "expires_at": row["expires_at"],
        "payload": decode_json(row["payload_json"], {}),
        "checksum": row["checksum"],
    }


def assessment_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "assessment_id": row["assessment_id"],
        "control_id": row["control_id"],
        "status": row["status"],
        "reasons": decode_json(row["reasons_json"], []),
        "fresh_evidence_count": row["fresh_evidence_count"],
        "assessed_at": row["assessed_at"],
    }


def exception_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "exception_id": row["exception_id"],
        "control_id": row["control_id"],
        "owner": row["owner"],
        "status": row["status"],
        "due_at": row["due_at"],
        "notes": row["notes"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def package_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "package_id": row["package_id"],
        "framework": row["framework"],
        "status": row["status"],
        "generated_at": row["generated_at"],
        "controls": decode_json(row["controls_json"], []),
        "evidence": decode_json(row["evidence_json"], []),
        "exceptions": decode_json(row["exceptions_json"], []),
        "checksum": row["checksum"],
    }


class ComplianceHandler(BaseHTTPRequestHandler):
    store: ComplianceEvidence

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
            elif path == "/controls":
                self.send_json(HTTPStatus.OK, self.store.list_controls())
            elif path == "/evidence":
                self.send_json(HTTPStatus.OK, self.store.list_evidence())
            elif path == "/exceptions":
                self.send_json(HTTPStatus.OK, self.store.list_exceptions())
            elif path == "/packages":
                self.send_json(HTTPStatus.OK, self.store.list_packages())
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
            if path == "/controls":
                self.send_json(HTTPStatus.CREATED, self.store.upsert_control(payload, actor=actor))
            elif path == "/evidence/collect":
                self.send_json(HTTPStatus.CREATED, self.store.collect_evidence(token(payload.get("control_id"), "control_id"), actor=actor))
            elif path == "/assess":
                self.send_json(HTTPStatus.OK, self.store.assess_all(actor=actor, timestamp=payload.get("timestamp")))
            elif path == "/exceptions":
                self.send_json(HTTPStatus.CREATED, self.store.create_exception(payload, actor=actor))
            elif path == "/packages":
                self.send_json(HTTPStatus.CREATED, self.store.generate_package(token(payload.get("framework"), "framework"), actor=actor))
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except (json.JSONDecodeError, ValueError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def send_html(self) -> None:
        html = render_html(self.store.snapshot(), self.store.list_controls(), self.store.list_exceptions()).encode()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)


def render_html(snapshot: dict[str, Any], controls: list[dict[str, Any]], exceptions: list[dict[str, Any]]) -> str:
    def esc(value: Any) -> str:
        return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    control_rows = "\n".join(
        f"<tr><td>{esc(control['control_id'])}</td><td>{esc(control['framework'])}</td><td>{esc((control['latest_assessment'] or {}).get('status', 'MISSING'))}</td><td>{esc(control['owner'])}</td></tr>"
        for control in controls
    )
    exception_rows = "\n".join(
        f"<tr><td>{esc(item['exception_id'])}</td><td>{esc(item['control_id'])}</td><td>{esc(item['status'])}</td><td>{esc(item['owner'])}</td></tr>"
        for item in exceptions
    )
    failing = snapshot["control_status_counts"].get("FAIL", 0) + snapshot["control_status_counts"].get("MISSING", 0)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Compliance Evidence Automation POC</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; color: #172033; background: #f7f9fc; }}
    header {{ background: #183044; color: white; padding: 28px 36px; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 28px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }}
    h2 {{ margin: 0 0 14px; font-size: 18px; }}
    p {{ margin: 0; color: #d8e3ef; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 22px; }}
    .metric, section {{ background: white; border: 1px solid #dce5f2; border-radius: 8px; padding: 18px; }}
    .metric strong {{ display: block; font-size: 28px; color: #0f172a; }}
    .metric span {{ color: #64748b; font-size: 13px; }}
    .layout {{ display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; vertical-align: top; }}
    th {{ color: #475569; font-size: 12px; text-transform: uppercase; }}
    @media (max-width: 820px) {{ .grid, .layout {{ grid-template-columns: 1fr; }} main {{ padding: 18px; }} }}
  </style>
</head>
<body>
  <header>
    <h1>Compliance Evidence Automation POC</h1>
    <p>Control registry, evidence freshness, exceptions, checksums, audit packages, and readiness status.</p>
  </header>
  <main>
    <div class="grid">
      <div class="metric"><strong>{snapshot['control_count']}</strong><span>controls</span></div>
      <div class="metric"><strong>{snapshot['evidence_count']}</strong><span>evidence records</span></div>
      <div class="metric"><strong>{failing}</strong><span>fail or missing</span></div>
      <div class="metric"><strong>{snapshot['open_exception_count']}</strong><span>open exceptions</span></div>
    </div>
    <div class="layout">
      <section>
        <h2>Controls</h2>
        <table><thead><tr><th>Control</th><th>Framework</th><th>Status</th><th>Owner</th></tr></thead><tbody>{control_rows}</tbody></table>
      </section>
      <section>
        <h2>Exceptions</h2>
        <table><thead><tr><th>Exception</th><th>Control</th><th>Status</th><th>Owner</th></tr></thead><tbody>{exception_rows}</tbody></table>
      </section>
    </div>
  </main>
</body>
</html>"""


def run_demo(db_path: Path) -> None:
    store = ComplianceEvidence(db_path)
    try:
        store.seed_if_empty()
        assessment = store.assess_all(actor="demo")
        package = store.generate_package("GDPR", actor="demo")
        print(json.dumps({"assessment": assessment, "package": package, "snapshot": store.snapshot()}, indent=2, sort_keys=True))
    finally:
        store.close()


def serve(db_path: Path, host: str, port: int) -> None:
    store = ComplianceEvidence(db_path)
    store.seed_if_empty()
    ComplianceHandler.store = store
    server = HTTPServer((host, port), ComplianceHandler)
    print(f"Serving compliance evidence automation POC on http://{host}:{port}")
    try:
        server.serve_forever()
    finally:
        store.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Compliance evidence automation POC")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("demo")
    serve_parser = subparsers.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8173)
    args = parser.parse_args()
    if args.command == "demo":
        run_demo(args.db_path)
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
