#!/usr/bin/env python3
"""Incident management and on-call routing POC.

This app models the human operations layer behind production systems: alert
intake, fingerprint deduplication, service ownership, escalation policies,
incident lifecycle, timelines, SLO breach tracking, and postmortem action
items. It uses SQLite and the Python standard library so it runs locally
without external services.
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
DEFAULT_DB_PATH = RUNTIME_DIR / "incidents.db"
SEVERITIES = {"SEV1", "SEV2", "SEV3", "SEV4"}
INCIDENT_STATUSES = {"OPEN", "ACKNOWLEDGED", "MITIGATED", "RESOLVED"}
ACTION_STATUSES = {"OPEN", "DONE"}


def now_ts() -> int:
    return int(time.time())


def encode_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def decode_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)


def slug(value: Any, field: str, max_len: int = 140) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    if not re.fullmatch(r"[A-Za-z0-9._:/@-]+", result):
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, slash, at, or dash")
    return result


def text(value: Any, field: str, max_len: int = 500) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    return result


def optional_text(value: Any, max_len: int = 500) -> str:
    if value is None:
        return ""
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"value must be at most {max_len} characters")
    return result


def severity(value: Any) -> str:
    result = str(value or "SEV3").upper().strip()
    if result not in SEVERITIES:
        raise ValueError("severity must be SEV1, SEV2, SEV3, or SEV4")
    return result


def metadata(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("metadata must be an object")
    return value


class IncidentManager:
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
                service_name TEXT PRIMARY KEY,
                owner_team TEXT NOT NULL,
                escalation_policy TEXT NOT NULL,
                slo_minutes INTEGER NOT NULL,
                metadata_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS escalation_policies (
                policy_id TEXT PRIMARY KEY,
                levels_json TEXT NOT NULL,
                page_after_minutes INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS alerts (
                alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
                fingerprint TEXT NOT NULL UNIQUE,
                service_name TEXT NOT NULL,
                severity TEXT NOT NULL,
                summary TEXT NOT NULL,
                status TEXT NOT NULL,
                occurrence_count INTEGER NOT NULL,
                first_seen INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                incident_id INTEGER,
                labels_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS incidents (
                incident_id INTEGER PRIMARY KEY AUTOINCREMENT,
                fingerprint TEXT NOT NULL,
                service_name TEXT NOT NULL,
                severity TEXT NOT NULL,
                summary TEXT NOT NULL,
                status TEXT NOT NULL,
                owner_team TEXT NOT NULL,
                current_responder TEXT NOT NULL,
                escalation_level INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                acknowledged_at INTEGER,
                mitigated_at INTEGER,
                resolved_at INTEGER,
                breach_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS timeline_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                message TEXT NOT NULL,
                actor TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS action_items (
                action_id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                owner TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                completed_at INTEGER
            );
            """
        )
        self.conn.commit()

    def seed_if_empty(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) AS count FROM services").fetchone()["count"]
        if count:
            return
        self.upsert_escalation_policy(
            {
                "policy_id": "payments-primary",
                "levels": ["alice@company.test", "bob@company.test", "payments-director@company.test"],
                "page_after_minutes": 10,
            }
        )
        self.upsert_escalation_policy(
            {
                "policy_id": "platform-primary",
                "levels": ["nora@company.test", "sam@company.test", "platform-director@company.test"],
                "page_after_minutes": 15,
            }
        )
        self.upsert_service(
            {
                "service_name": "payments-api",
                "owner_team": "payments",
                "escalation_policy": "payments-primary",
                "slo_minutes": 30,
                "metadata": {"tier": "critical", "runbook": "runbooks/payments-api"},
            }
        )
        self.upsert_service(
            {
                "service_name": "checkout-api",
                "owner_team": "platform",
                "escalation_policy": "platform-primary",
                "slo_minutes": 45,
                "metadata": {"tier": "critical", "runbook": "runbooks/checkout-api"},
            }
        )

    def upsert_escalation_policy(self, payload: dict[str, Any]) -> dict[str, Any]:
        policy_id = slug(payload.get("policy_id"), "policy_id")
        levels = payload.get("levels")
        if not isinstance(levels, list) or not levels:
            raise ValueError("levels must be a non-empty list")
        normalized = [slug(item, "level", 180) for item in levels]
        page_after = int(payload.get("page_after_minutes", 10))
        if page_after < 1 or page_after > 1440:
            raise ValueError("page_after_minutes must be between 1 and 1440")
        self.conn.execute(
            """
            INSERT INTO escalation_policies(policy_id, levels_json, page_after_minutes, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(policy_id) DO UPDATE SET
                levels_json = excluded.levels_json,
                page_after_minutes = excluded.page_after_minutes,
                updated_at = excluded.updated_at
            """,
            (policy_id, encode_json(normalized), page_after, now_ts()),
        )
        self.conn.commit()
        return self.get_escalation_policy(policy_id)

    def upsert_service(self, payload: dict[str, Any]) -> dict[str, Any]:
        service_name = slug(payload.get("service_name"), "service_name")
        owner_team = slug(payload.get("owner_team"), "owner_team")
        escalation_policy = slug(payload.get("escalation_policy"), "escalation_policy")
        self.get_escalation_policy(escalation_policy)
        slo_minutes = int(payload.get("slo_minutes", 30))
        if slo_minutes < 1 or slo_minutes > 10080:
            raise ValueError("slo_minutes must be between 1 and 10080")
        self.conn.execute(
            """
            INSERT INTO services(service_name, owner_team, escalation_policy, slo_minutes, metadata_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(service_name) DO UPDATE SET
                owner_team = excluded.owner_team,
                escalation_policy = excluded.escalation_policy,
                slo_minutes = excluded.slo_minutes,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            """,
            (service_name, owner_team, escalation_policy, slo_minutes, encode_json(metadata(payload.get("metadata"))), now_ts()),
        )
        self.conn.commit()
        return self.get_service(service_name)

    def ingest_alert(self, payload: dict[str, Any]) -> dict[str, Any]:
        service_name = slug(payload.get("service_name"), "service_name")
        service = self.get_service(service_name)
        sev = severity(payload.get("severity"))
        summary = text(payload.get("summary"), "summary")
        labels = metadata(payload.get("labels"))
        fingerprint = payload.get("fingerprint") or stable_fingerprint(service_name, payload.get("alert_key", summary), labels)
        fingerprint = slug(fingerprint, "fingerprint", 180)
        timestamp = now_ts()

        existing = self.conn.execute("SELECT * FROM alerts WHERE fingerprint = ?", (fingerprint,)).fetchone()
        if existing and existing["status"] != "RESOLVED":
            self.conn.execute(
                """
                UPDATE alerts
                SET occurrence_count = occurrence_count + 1,
                    last_seen = ?,
                    severity = ?,
                    summary = ?,
                    labels_json = ?
                WHERE fingerprint = ?
                """,
                (timestamp, sev, summary, encode_json(labels), fingerprint),
            )
            self.conn.commit()
            incident = self.incident_for_alert(existing["incident_id"])
            if incident:
                self.add_timeline(
                    incident["incident_id"],
                    "AlertDeduplicated",
                    f"Alert fingerprint {fingerprint} repeated.",
                    "alert-router",
                )
                incident = self.get_incident(incident["incident_id"])
            return {"alert": self.get_alert_by_fingerprint(fingerprint), "incident": incident, "deduplicated": True}

        policy = self.get_escalation_policy(service["escalation_policy"])
        responder = policy["levels"][0]
        breach_at = timestamp + service["slo_minutes"] * 60
        cursor = self.conn.execute(
            """
            INSERT INTO incidents(
                fingerprint, service_name, severity, summary, status, owner_team,
                current_responder, escalation_level, created_at, updated_at,
                acknowledged_at, mitigated_at, resolved_at, breach_at
            )
            VALUES (?, ?, ?, ?, 'OPEN', ?, ?, 0, ?, ?, NULL, NULL, NULL, ?)
            """,
            (fingerprint, service_name, sev, summary, service["owner_team"], responder, timestamp, timestamp, breach_at),
        )
        incident_id = int(cursor.lastrowid)
        if existing and existing["status"] == "RESOLVED":
            self.conn.execute(
                """
                UPDATE alerts
                SET service_name = ?,
                    severity = ?,
                    summary = ?,
                    status = 'OPEN',
                    occurrence_count = occurrence_count + 1,
                    last_seen = ?,
                    incident_id = ?,
                    labels_json = ?
                WHERE fingerprint = ?
                """,
                (service_name, sev, summary, timestamp, incident_id, encode_json(labels), fingerprint),
            )
        else:
            self.conn.execute(
                """
                INSERT INTO alerts(
                    fingerprint, service_name, severity, summary, status, occurrence_count,
                    first_seen, last_seen, incident_id, labels_json
                )
                VALUES (?, ?, ?, ?, 'OPEN', 1, ?, ?, ?, ?)
                """,
                (fingerprint, service_name, sev, summary, timestamp, timestamp, incident_id, encode_json(labels)),
            )
        self.conn.commit()
        self.add_timeline(incident_id, "IncidentCreated", f"Created from {sev} alert: {summary}", "alert-router")
        self.add_timeline(incident_id, "ResponderPaged", f"Paged {responder}.", "oncall-router")
        return {"alert": self.get_alert_by_fingerprint(fingerprint), "incident": self.get_incident(incident_id), "deduplicated": False}

    def acknowledge(self, incident_id: int, actor: str, note: str = "") -> dict[str, Any]:
        return self.transition(incident_id, "ACKNOWLEDGED", actor, note or "Incident acknowledged.")

    def mitigate(self, incident_id: int, actor: str, note: str = "") -> dict[str, Any]:
        return self.transition(incident_id, "MITIGATED", actor, note or "Mitigation applied.")

    def resolve(self, incident_id: int, actor: str, note: str = "") -> dict[str, Any]:
        incident = self.transition(incident_id, "RESOLVED", actor, note or "Incident resolved.")
        self.conn.execute("UPDATE alerts SET status = 'RESOLVED' WHERE incident_id = ?", (incident_id,))
        self.conn.commit()
        return self.get_incident(incident_id)

    def transition(self, incident_id: int, status: str, actor: str, note: str) -> dict[str, Any]:
        incident = self.get_incident(incident_id)
        status = status.upper()
        if status not in INCIDENT_STATUSES:
            raise ValueError("invalid incident status")
        actor = slug(actor, "actor", 180)
        note = text(note, "note")
        field = {"ACKNOWLEDGED": "acknowledged_at", "MITIGATED": "mitigated_at", "RESOLVED": "resolved_at"}.get(status)
        if field:
            self.conn.execute(
                f"UPDATE incidents SET status = ?, {field} = COALESCE({field}, ?), updated_at = ? WHERE incident_id = ?",
                (status, now_ts(), now_ts(), incident_id),
            )
        else:
            self.conn.execute("UPDATE incidents SET status = ?, updated_at = ? WHERE incident_id = ?", (status, now_ts(), incident_id))
        self.conn.commit()
        self.add_timeline(incident_id, status.title(), note, actor)
        return self.get_incident(incident["incident_id"])

    def add_note(self, incident_id: int, actor: str, note: str) -> dict[str, Any]:
        self.get_incident(incident_id)
        self.add_timeline(incident_id, "Note", text(note, "note"), slug(actor, "actor", 180))
        return self.get_incident(incident_id)

    def add_action_item(self, incident_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        self.get_incident(incident_id)
        cursor = self.conn.execute(
            """
            INSERT INTO action_items(incident_id, description, owner, status, created_at, completed_at)
            VALUES (?, ?, ?, 'OPEN', ?, NULL)
            """,
            (
                incident_id,
                text(payload.get("description"), "description"),
                slug(payload.get("owner"), "owner", 180),
                now_ts(),
            ),
        )
        self.conn.commit()
        action_id = int(cursor.lastrowid)
        self.add_timeline(incident_id, "ActionItemCreated", f"Created action item #{action_id}.", "postmortem-bot")
        return self.get_action_item(action_id)

    def complete_action_item(self, action_id: int) -> dict[str, Any]:
        item = self.get_action_item(action_id)
        self.conn.execute(
            "UPDATE action_items SET status = 'DONE', completed_at = ? WHERE action_id = ?",
            (now_ts(), action_id),
        )
        self.conn.commit()
        self.add_timeline(item["incident_id"], "ActionItemCompleted", f"Completed action item #{action_id}.", item["owner"])
        return self.get_action_item(action_id)

    def check_escalations(self) -> dict[str, Any]:
        escalated: list[dict[str, Any]] = []
        rows = self.conn.execute(
            "SELECT * FROM incidents WHERE status = 'OPEN' ORDER BY created_at"
        ).fetchall()
        timestamp = now_ts()
        for row in rows:
            incident = incident_from_row(row)
            service = self.get_service(incident["service_name"])
            policy = self.get_escalation_policy(service["escalation_policy"])
            next_level = incident["escalation_level"] + 1
            due_at = incident["created_at"] + policy["page_after_minutes"] * 60 * next_level
            if next_level < len(policy["levels"]) and timestamp >= due_at:
                responder = policy["levels"][next_level]
                self.conn.execute(
                    """
                    UPDATE incidents
                    SET escalation_level = ?, current_responder = ?, updated_at = ?
                    WHERE incident_id = ?
                    """,
                    (next_level, responder, timestamp, incident["incident_id"]),
                )
                self.conn.commit()
                self.add_timeline(incident["incident_id"], "Escalated", f"Escalated to {responder}.", "oncall-router")
                escalated.append(self.get_incident(incident["incident_id"]))
        return {"escalated_count": len(escalated), "incidents": escalated}

    def add_timeline(self, incident_id: int, event_type: str, message: str, actor: str) -> None:
        self.conn.execute(
            """
            INSERT INTO timeline_events(incident_id, created_at, event_type, message, actor)
            VALUES (?, ?, ?, ?, ?)
            """,
            (incident_id, now_ts(), slug(event_type, "event_type", 80), text(message, "message"), slug(actor, "actor", 180)),
        )
        self.conn.commit()

    def get_service(self, service_name: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM services WHERE service_name = ?", (service_name,)).fetchone()
        if not row:
            raise ValueError(f"unknown service: {service_name}")
        return service_from_row(row)

    def get_escalation_policy(self, policy_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM escalation_policies WHERE policy_id = ?", (policy_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown escalation policy: {policy_id}")
        return policy_from_row(row)

    def get_alert_by_fingerprint(self, fingerprint: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM alerts WHERE fingerprint = ?", (fingerprint,)).fetchone()
        if not row:
            raise ValueError(f"unknown alert fingerprint: {fingerprint}")
        return alert_from_row(row)

    def get_incident(self, incident_id: int) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM incidents WHERE incident_id = ?", (int(incident_id),)).fetchone()
        if not row:
            raise ValueError(f"unknown incident: {incident_id}")
        incident = incident_from_row(row)
        incident["timeline"] = self.timeline_for(incident["incident_id"])
        incident["action_items"] = self.action_items_for(incident["incident_id"])
        incident["slo_breached"] = incident["status"] != "RESOLVED" and now_ts() > incident["breach_at"]
        return incident

    def incident_for_alert(self, incident_id: Any) -> dict[str, Any] | None:
        if incident_id is None:
            return None
        return self.get_incident(int(incident_id))

    def get_action_item(self, action_id: int) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM action_items WHERE action_id = ?", (int(action_id),)).fetchone()
        if not row:
            raise ValueError(f"unknown action item: {action_id}")
        return action_item_from_row(row)

    def list_services(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM services ORDER BY service_name").fetchall()
        return [service_from_row(row) for row in rows]

    def list_policies(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM escalation_policies ORDER BY policy_id").fetchall()
        return [policy_from_row(row) for row in rows]

    def list_alerts(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM alerts ORDER BY last_seen DESC, alert_id DESC").fetchall()
        return [alert_from_row(row) for row in rows]

    def list_incidents(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM incidents ORDER BY created_at DESC, incident_id DESC").fetchall()
        return [self.get_incident(row["incident_id"]) for row in rows]

    def timeline_for(self, incident_id: int) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM timeline_events WHERE incident_id = ? ORDER BY event_id",
            (incident_id,),
        ).fetchall()
        return [timeline_from_row(row) for row in rows]

    def action_items_for(self, incident_id: int) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM action_items WHERE incident_id = ? ORDER BY action_id",
            (incident_id,),
        ).fetchall()
        return [action_item_from_row(row) for row in rows]

    def snapshot(self) -> dict[str, Any]:
        incidents = self.list_incidents()
        alerts = self.list_alerts()
        open_incidents = [item for item in incidents if item["status"] != "RESOLVED"]
        return {
            "service_count": len(self.list_services()),
            "alert_count": len(alerts),
            "open_incident_count": len(open_incidents),
            "slo_breach_count": len([item for item in open_incidents if item["slo_breached"]]),
            "services": self.list_services(),
            "escalation_policies": self.list_policies(),
            "alerts": alerts,
            "incidents": incidents,
        }


def stable_fingerprint(service_name: str, alert_key: Any, labels: dict[str, Any]) -> str:
    raw = encode_json({"service": service_name, "alert_key": alert_key, "labels": labels})
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def service_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "service_name": row["service_name"],
        "owner_team": row["owner_team"],
        "escalation_policy": row["escalation_policy"],
        "slo_minutes": row["slo_minutes"],
        "metadata": decode_json(row["metadata_json"], {}),
        "updated_at": row["updated_at"],
    }


def policy_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "policy_id": row["policy_id"],
        "levels": decode_json(row["levels_json"], []),
        "page_after_minutes": row["page_after_minutes"],
        "updated_at": row["updated_at"],
    }


def alert_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "alert_id": row["alert_id"],
        "fingerprint": row["fingerprint"],
        "service_name": row["service_name"],
        "severity": row["severity"],
        "summary": row["summary"],
        "status": row["status"],
        "occurrence_count": row["occurrence_count"],
        "first_seen": row["first_seen"],
        "last_seen": row["last_seen"],
        "incident_id": row["incident_id"],
        "labels": decode_json(row["labels_json"], {}),
    }


def incident_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "incident_id": row["incident_id"],
        "fingerprint": row["fingerprint"],
        "service_name": row["service_name"],
        "severity": row["severity"],
        "summary": row["summary"],
        "status": row["status"],
        "owner_team": row["owner_team"],
        "current_responder": row["current_responder"],
        "escalation_level": row["escalation_level"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "acknowledged_at": row["acknowledged_at"],
        "mitigated_at": row["mitigated_at"],
        "resolved_at": row["resolved_at"],
        "breach_at": row["breach_at"],
    }


def timeline_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "event_id": row["event_id"],
        "incident_id": row["incident_id"],
        "created_at": row["created_at"],
        "event_type": row["event_type"],
        "message": row["message"],
        "actor": row["actor"],
    }


def action_item_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "action_id": row["action_id"],
        "incident_id": row["incident_id"],
        "description": row["description"],
        "owner": row["owner"],
        "status": row["status"],
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
    }


def build_manager(db_path: Path | str) -> IncidentManager:
    manager = IncidentManager(db_path)
    manager.seed_if_empty()
    return manager


def demo(db_path: Path | str = ":memory:") -> dict[str, Any]:
    manager = build_manager(db_path)
    try:
        first = manager.ingest_alert(
            {
                "service_name": "payments-api",
                "severity": "SEV1",
                "summary": "Payment authorization failures above threshold",
                "alert_key": "payment-auth-failures",
                "labels": {"region": "us-east-1", "runbook": "payments-auth"},
            }
        )
        duplicate = manager.ingest_alert(
            {
                "service_name": "payments-api",
                "severity": "SEV1",
                "summary": "Payment authorization failures above threshold",
                "alert_key": "payment-auth-failures",
                "labels": {"region": "us-east-1", "runbook": "payments-auth"},
            }
        )
        incident_id = first["incident"]["incident_id"]
        manager.acknowledge(incident_id, "alice@company.test", "Investigating failed authorizations.")
        manager.mitigate(incident_id, "alice@company.test", "Rolled back gateway config.")
        action = manager.add_action_item(
            incident_id,
            {"description": "Add config validation for gateway rollout.", "owner": "payments-platform"},
        )
        return {
            "first_alert": first,
            "duplicate_alert": duplicate,
            "action_item": action,
            "snapshot": manager.snapshot(),
        }
    finally:
        manager.close()


class ApiHandler(BaseHTTPRequestHandler):
    manager: IncidentManager

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.html(render_home(self.manager.snapshot()))
        elif parsed.path == "/health":
            self.json({"status": "ok"})
        elif parsed.path == "/snapshot":
            self.json(self.manager.snapshot())
        elif parsed.path == "/services":
            self.json({"services": self.manager.list_services()})
        elif parsed.path == "/alerts":
            self.json({"alerts": self.manager.list_alerts()})
        elif parsed.path == "/incidents":
            self.json({"incidents": self.manager.list_incidents()})
        elif parsed.path == "/escalation-policies":
            self.json({"escalation_policies": self.manager.list_policies()})
        else:
            self.error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        try:
            payload = self.read_json()
            if parsed.path == "/alerts":
                self.json(self.manager.ingest_alert(payload), HTTPStatus.CREATED)
            elif parsed.path == "/services":
                self.json(self.manager.upsert_service(payload), HTTPStatus.CREATED)
            elif parsed.path == "/escalation-policies":
                self.json(self.manager.upsert_escalation_policy(payload), HTTPStatus.CREATED)
            elif parsed.path == "/escalations/check":
                self.json(self.manager.check_escalations())
            elif parsed.path.startswith("/incidents/"):
                self.handle_incident_action(parsed.path, payload)
            elif parsed.path.startswith("/action-items/") and parsed.path.endswith("/complete"):
                action_id = int(parsed.path.split("/")[2])
                self.json(self.manager.complete_action_item(action_id))
            else:
                self.error(HTTPStatus.NOT_FOUND, "not found")
        except (json.JSONDecodeError, ValueError) as exc:
            self.error(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_incident_action(self, path: str, payload: dict[str, Any]) -> None:
        parts = path.strip("/").split("/")
        if len(parts) < 3:
            self.error(HTTPStatus.NOT_FOUND, "not found")
            return
        incident_id = int(parts[1])
        action = parts[2]
        actor = payload.get("actor", "operator")
        note = optional_text(payload.get("note"))
        if action == "ack":
            self.json(self.manager.acknowledge(incident_id, actor, note))
        elif action == "mitigate":
            self.json(self.manager.mitigate(incident_id, actor, note))
        elif action == "resolve":
            self.json(self.manager.resolve(incident_id, actor, note))
        elif action == "notes":
            self.json(self.manager.add_note(incident_id, actor, payload.get("note", "")))
        elif action == "action-items":
            self.json(self.manager.add_action_item(incident_id, payload), HTTPStatus.CREATED)
        else:
            self.error(HTTPStatus.NOT_FOUND, "not found")

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0"))
        if length == 0:
            return {}
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        return payload

    def json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def html(self, body: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = body.encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def error(self, status: HTTPStatus, message: str) -> None:
        self.json({"error": message}, status)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        return


def render_home(snapshot: dict[str, Any]) -> str:
    incident_rows = "\n".join(
        f"""
        <tr>
          <td>#{item['incident_id']}</td>
          <td>{item['service_name']}</td>
          <td><span class="{item['severity'].lower()}">{item['severity']}</span></td>
          <td><span class="{item['status'].lower()}">{item['status']}</span></td>
          <td>{item['current_responder']}</td>
          <td>{item['summary']}</td>
        </tr>
        """
        for item in snapshot["incidents"]
    )
    alert_rows = "\n".join(
        f"""
        <tr>
          <td>{item['service_name']}</td>
          <td>{item['severity']}</td>
          <td>{item['occurrence_count']}</td>
          <td>{item['status']}</td>
          <td>{item['summary']}</td>
        </tr>
        """
        for item in snapshot["alerts"]
    )
    service_rows = "\n".join(
        f"""
        <tr>
          <td>{item['service_name']}</td>
          <td>{item['owner_team']}</td>
          <td>{item['escalation_policy']}</td>
          <td>{item['slo_minutes']}m</td>
        </tr>
        """
        for item in snapshot["services"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Incident Management On-Call POC</title>
  <style>
    body {{ margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; background: #f7f8fb; }}
    header {{ background: #102033; color: white; padding: 28px 32px; }}
    main {{ max-width: 1220px; margin: 0 auto; padding: 28px 24px 48px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; }}
    h2 {{ font-size: 18px; margin: 28px 0 12px; }}
    p {{ margin: 0; color: #d8e0eb; }}
    .metrics {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }}
    .metric, section {{ background: white; border: 1px solid #d8dee8; border-radius: 8px; }}
    .metric {{ padding: 16px; }}
    .metric strong {{ display: block; font-size: 28px; }}
    .metric span {{ color: #5d6675; font-size: 13px; }}
    section {{ padding: 18px; overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ border-bottom: 1px solid #ecf0f5; padding: 10px; text-align: left; vertical-align: top; }}
    th {{ color: #4b5563; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }}
    .sev1, .open {{ color: #b42318; font-weight: 700; }}
    .sev2, .acknowledged {{ color: #b45309; font-weight: 700; }}
    .mitigated {{ color: #2563eb; font-weight: 700; }}
    .resolved {{ color: #047857; font-weight: 700; }}
    @media (max-width: 760px) {{ .metrics {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
  </style>
</head>
<body>
  <header>
    <h1>Incident Management On-Call</h1>
    <p>Alert deduplication, on-call routing, escalation, incident timelines, SLO breaches, and postmortem action items.</p>
  </header>
  <main>
    <div class="metrics">
      <div class="metric"><strong>{snapshot['service_count']}</strong><span>services</span></div>
      <div class="metric"><strong>{snapshot['alert_count']}</strong><span>alerts</span></div>
      <div class="metric"><strong>{snapshot['open_incident_count']}</strong><span>open incidents</span></div>
      <div class="metric"><strong>{snapshot['slo_breach_count']}</strong><span>SLO breaches</span></div>
    </div>
    <h2>Incidents</h2>
    <section><table><thead><tr><th>ID</th><th>Service</th><th>Severity</th><th>Status</th><th>Responder</th><th>Summary</th></tr></thead><tbody>{incident_rows or '<tr><td colspan="6">No incidents yet.</td></tr>'}</tbody></table></section>
    <h2>Alerts</h2>
    <section><table><thead><tr><th>Service</th><th>Severity</th><th>Count</th><th>Status</th><th>Summary</th></tr></thead><tbody>{alert_rows or '<tr><td colspan="5">No alerts yet.</td></tr>'}</tbody></table></section>
    <h2>Services</h2>
    <section><table><thead><tr><th>Service</th><th>Owner</th><th>Policy</th><th>SLO</th></tr></thead><tbody>{service_rows}</tbody></table></section>
  </main>
</body>
</html>"""


def serve(db_path: Path | str, host: str, port: int) -> None:
    manager = build_manager(db_path)
    ApiHandler.manager = manager
    server = HTTPServer((host, port), ApiHandler)
    print(f"Incident Management On-Call POC running at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        manager.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Incident management and on-call POC")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("demo", help="Run a local demo flow")
    serve_parser = subcommands.add_parser("serve", help="Start HTTP server")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8166)
    args = parser.parse_args()

    if args.command == "demo":
        print(json.dumps(demo(args.db_path), indent=2, sort_keys=True))
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
