#!/usr/bin/env python3
"""Data lineage and governance POC.

This app models a compact data governance plane: dataset ownership,
classification, column-level PII metadata, transformation lineage, data quality,
freshness SLAs, policy gates, downstream impact analysis, and audit logging.
It uses SQLite and Python's standard library so it runs locally without
external services.
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
DEFAULT_DB_PATH = RUNTIME_DIR / "lineage.db"
CLASSIFICATIONS = {"PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"}
ZONES = {"raw", "warehouse", "ml", "external"}
QUALITY_STATUSES = {"PASS", "WARN", "FAIL"}


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


def normalize_classification(value: Any) -> str:
    result = str(value or "INTERNAL").upper().strip()
    if result not in CLASSIFICATIONS:
        raise ValueError("classification must be PUBLIC, INTERNAL, CONFIDENTIAL, or RESTRICTED")
    return result


def normalize_zone(value: Any) -> str:
    result = str(value or "warehouse").lower().strip()
    if result not in ZONES:
        raise ValueError("zone must be raw, warehouse, ml, or external")
    return result


class DataGovernance:
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
            CREATE TABLE IF NOT EXISTS datasets (
                dataset_id TEXT PRIMARY KEY,
                owner_team TEXT NOT NULL,
                classification TEXT NOT NULL,
                zone TEXT NOT NULL,
                freshness_sla_minutes INTEGER NOT NULL,
                last_updated INTEGER NOT NULL,
                description TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS columns (
                dataset_id TEXT NOT NULL,
                column_name TEXT NOT NULL,
                data_type TEXT NOT NULL,
                pii INTEGER NOT NULL,
                tags_json TEXT NOT NULL,
                PRIMARY KEY(dataset_id, column_name)
            );

            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                owner_team TEXT NOT NULL,
                code_version TEXT NOT NULL,
                schedule TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS job_inputs (
                job_id TEXT NOT NULL,
                dataset_id TEXT NOT NULL,
                PRIMARY KEY(job_id, dataset_id)
            );

            CREATE TABLE IF NOT EXISTS job_outputs (
                job_id TEXT NOT NULL,
                dataset_id TEXT NOT NULL,
                PRIMARY KEY(job_id, dataset_id)
            );

            CREATE TABLE IF NOT EXISTS quality_checks (
                check_id INTEGER PRIMARY KEY AUTOINCREMENT,
                dataset_id TEXT NOT NULL,
                check_name TEXT NOT NULL,
                status TEXT NOT NULL,
                metric_value REAL NOT NULL,
                threshold REAL NOT NULL,
                message TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS policy_decisions (
                decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                allowed INTEGER NOT NULL,
                reasons_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
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
        count = self.conn.execute("SELECT COUNT(*) AS count FROM datasets").fetchone()["count"]
        if count:
            return
        self.register_dataset(
            {
                "dataset_id": "raw.customers",
                "owner_team": "growth-data",
                "classification": "RESTRICTED",
                "zone": "raw",
                "freshness_sla_minutes": 60,
                "description": "Customer records from signup and profile systems.",
                "columns": [
                    {"name": "customer_id", "type": "string", "pii": False, "tags": ["identifier"]},
                    {"name": "email", "type": "string", "pii": True, "tags": ["email"]},
                    {"name": "country", "type": "string", "pii": False, "tags": ["geo"]},
                ],
            },
            actor="seed",
        )
        self.register_dataset(
            {
                "dataset_id": "raw.orders",
                "owner_team": "commerce-data",
                "classification": "CONFIDENTIAL",
                "zone": "raw",
                "freshness_sla_minutes": 30,
                "description": "Raw order facts from checkout.",
                "columns": [
                    {"name": "order_id", "type": "string", "pii": False, "tags": []},
                    {"name": "customer_id", "type": "string", "pii": False, "tags": ["identifier"]},
                    {"name": "amount", "type": "number", "pii": False, "tags": ["financial"]},
                ],
            },
            actor="seed",
        )
        self.register_dataset(
            {
                "dataset_id": "warehouse.customer_ltv",
                "owner_team": "growth-data",
                "classification": "CONFIDENTIAL",
                "zone": "warehouse",
                "freshness_sla_minutes": 120,
                "description": "Derived lifetime value by customer.",
                "columns": [
                    {"name": "customer_id", "type": "string", "pii": False, "tags": ["identifier"]},
                    {"name": "ltv", "type": "number", "pii": False, "tags": ["financial"]},
                    {"name": "country", "type": "string", "pii": False, "tags": ["geo"]},
                ],
            },
            actor="seed",
        )
        self.register_job(
            {
                "job_id": "job.customer-ltv",
                "owner_team": "growth-data",
                "code_version": "git:abc123",
                "schedule": "hourly",
                "description": "Build customer LTV from orders and customer profile metadata.",
                "inputs": ["raw.customers", "raw.orders"],
                "outputs": ["warehouse.customer_ltv"],
            },
            actor="seed",
        )
        self.record_quality_check(
            {
                "dataset_id": "warehouse.customer_ltv",
                "check_name": "not_null_customer_id",
                "status": "PASS",
                "metric_value": 0.0,
                "threshold": 0.0,
                "message": "No null customer identifiers.",
            },
            actor="seed",
        )

    def register_dataset(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        dataset_id = token(payload.get("dataset_id"), "dataset_id")
        owner_team = token(payload.get("owner_team"), "owner_team")
        classification = normalize_classification(payload.get("classification"))
        zone = normalize_zone(payload.get("zone"))
        freshness = int(payload.get("freshness_sla_minutes", 60))
        if freshness < 1 or freshness > 10080:
            raise ValueError("freshness_sla_minutes must be between 1 and 10080")
        timestamp = int(payload.get("last_updated", now_ts()))
        self.conn.execute(
            """
            INSERT INTO datasets(
                dataset_id, owner_team, classification, zone, freshness_sla_minutes,
                last_updated, description, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(dataset_id) DO UPDATE SET
                owner_team = excluded.owner_team,
                classification = excluded.classification,
                zone = excluded.zone,
                freshness_sla_minutes = excluded.freshness_sla_minutes,
                last_updated = excluded.last_updated,
                description = excluded.description,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            """,
            (
                dataset_id,
                owner_team,
                classification,
                zone,
                freshness,
                timestamp,
                optional_text(payload.get("description")),
                encode_json(metadata(payload.get("metadata"))),
                now_ts(),
                now_ts(),
            ),
        )
        self.conn.execute("DELETE FROM columns WHERE dataset_id = ?", (dataset_id,))
        for column in payload.get("columns", []):
            self.add_column(dataset_id, column)
        self.conn.commit()
        self.audit(actor, "register_dataset", dataset_id, f"Registered {classification} dataset in {zone}.")
        return self.get_dataset(dataset_id)

    def add_column(self, dataset_id: str, payload: dict[str, Any]) -> None:
        self.conn.execute(
            """
            INSERT INTO columns(dataset_id, column_name, data_type, pii, tags_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                dataset_id,
                token(payload.get("name") or payload.get("column_name"), "column_name"),
                token(payload.get("type") or payload.get("data_type", "string"), "data_type"),
                int(bool(payload.get("pii", False))),
                encode_json(payload.get("tags", [])),
            ),
        )

    def register_job(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        job_id = token(payload.get("job_id"), "job_id")
        inputs = [token(item, "input") for item in payload.get("inputs", [])]
        outputs = [token(item, "output") for item in payload.get("outputs", [])]
        if not inputs or not outputs:
            raise ValueError("job requires at least one input and output")
        for dataset_id in inputs + outputs:
            self.get_dataset(dataset_id)
        self.conn.execute(
            """
            INSERT INTO jobs(job_id, owner_team, code_version, schedule, description, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                owner_team = excluded.owner_team,
                code_version = excluded.code_version,
                schedule = excluded.schedule,
                description = excluded.description
            """,
            (
                job_id,
                token(payload.get("owner_team"), "owner_team"),
                token(payload.get("code_version"), "code_version"),
                token(payload.get("schedule", "manual"), "schedule"),
                optional_text(payload.get("description")),
                now_ts(),
            ),
        )
        self.conn.execute("DELETE FROM job_inputs WHERE job_id = ?", (job_id,))
        self.conn.execute("DELETE FROM job_outputs WHERE job_id = ?", (job_id,))
        for dataset_id in inputs:
            self.conn.execute("INSERT INTO job_inputs(job_id, dataset_id) VALUES (?, ?)", (job_id, dataset_id))
        for dataset_id in outputs:
            self.conn.execute("INSERT INTO job_outputs(job_id, dataset_id) VALUES (?, ?)", (job_id, dataset_id))
        self.conn.commit()
        decision = self.evaluate_job_policy(job_id)
        self.audit(actor, "register_job", job_id, f"Registered lineage job; policy allowed={decision['allowed']}.")
        return self.get_job(job_id)

    def evaluate_job_policy(self, job_id: str) -> dict[str, Any]:
        job = self.get_job(job_id, include_policy=False)
        inputs = [self.get_dataset(item) for item in job["inputs"]]
        outputs = [self.get_dataset(item) for item in job["outputs"]]
        input_classes = {item["classification"] for item in inputs}
        input_has_pii = any(item["pii_column_count"] > 0 for item in inputs)
        reasons: list[str] = []
        for output in outputs:
            if "RESTRICTED" in input_classes and output["zone"] == "external":
                reasons.append(f"{output['dataset_id']} cannot receive restricted data in external zone")
            if input_has_pii and output["classification"] == "PUBLIC":
                reasons.append(f"{output['dataset_id']} cannot be PUBLIC because upstream contains PII")
            if "RESTRICTED" in input_classes and output["classification"] not in {"RESTRICTED", "CONFIDENTIAL"}:
                reasons.append(f"{output['dataset_id']} classification is too low for restricted upstream data")
        allowed = not reasons
        self.conn.execute(
            "INSERT INTO policy_decisions(job_id, allowed, reasons_json, created_at) VALUES (?, ?, ?, ?)",
            (job_id, int(allowed), encode_json(reasons or ["policy checks passed"]), now_ts()),
        )
        self.conn.commit()
        return {"job_id": job_id, "allowed": allowed, "reasons": reasons or ["policy checks passed"]}

    def record_quality_check(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        dataset_id = token(payload.get("dataset_id"), "dataset_id")
        self.get_dataset(dataset_id)
        status = str(payload.get("status", "PASS")).upper()
        if status not in QUALITY_STATUSES:
            raise ValueError("status must be PASS, WARN, or FAIL")
        cursor = self.conn.execute(
            """
            INSERT INTO quality_checks(dataset_id, check_name, status, metric_value, threshold, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                dataset_id,
                token(payload.get("check_name"), "check_name"),
                status,
                float(payload.get("metric_value", 0)),
                float(payload.get("threshold", 0)),
                optional_text(payload.get("message")),
                now_ts(),
            ),
        )
        self.conn.commit()
        self.audit(actor, "record_quality", dataset_id, f"Recorded {status} quality check.")
        return self.get_quality_check(int(cursor.lastrowid))

    def update_freshness(self, dataset_id: str, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        dataset_id = token(dataset_id, "dataset_id")
        self.get_dataset(dataset_id)
        ts = int(timestamp or now_ts())
        self.conn.execute(
            "UPDATE datasets SET last_updated = ?, updated_at = ? WHERE dataset_id = ?",
            (ts, now_ts(), dataset_id),
        )
        self.conn.commit()
        self.audit(actor, "update_freshness", dataset_id, f"Updated last_updated to {ts}.")
        return self.get_dataset(dataset_id)

    def impact_analysis(self, dataset_id: str, actor: str = "api") -> dict[str, Any]:
        dataset_id = token(dataset_id, "dataset_id")
        self.get_dataset(dataset_id)
        visited: set[str] = set()
        edges: list[dict[str, str]] = []
        queue = [dataset_id]
        while queue:
            current = queue.pop(0)
            rows = self.conn.execute(
                """
                SELECT jo.dataset_id AS downstream, ji.job_id AS job_id
                FROM job_inputs ji
                JOIN job_outputs jo ON jo.job_id = ji.job_id
                WHERE ji.dataset_id = ?
                ORDER BY jo.dataset_id
                """,
                (current,),
            ).fetchall()
            for row in rows:
                downstream = row["downstream"]
                edges.append({"from": current, "to": downstream, "job_id": row["job_id"]})
                if downstream not in visited:
                    visited.add(downstream)
                    queue.append(downstream)
        impacted = sorted(visited)
        self.audit(actor, "impact_analysis", dataset_id, f"Found {len(impacted)} downstream datasets.")
        return {"dataset_id": dataset_id, "impacted_datasets": impacted, "edges": edges}

    def lineage_for(self, dataset_id: str, actor: str = "api") -> dict[str, Any]:
        dataset_id = token(dataset_id, "dataset_id")
        dataset = self.get_dataset(dataset_id)
        upstream_jobs = self.conn.execute(
            "SELECT job_id FROM job_outputs WHERE dataset_id = ? ORDER BY job_id",
            (dataset_id,),
        ).fetchall()
        downstream_jobs = self.conn.execute(
            "SELECT job_id FROM job_inputs WHERE dataset_id = ? ORDER BY job_id",
            (dataset_id,),
        ).fetchall()
        result = {
            "dataset": dataset,
            "upstream_jobs": [self.get_job(row["job_id"]) for row in upstream_jobs],
            "downstream_jobs": [self.get_job(row["job_id"]) for row in downstream_jobs],
        }
        self.audit(actor, "lineage_query", dataset_id, "Read dataset lineage.")
        return result

    def get_dataset(self, dataset_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM datasets WHERE dataset_id = ?", (dataset_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown dataset: {dataset_id}")
        dataset = dataset_from_row(row)
        dataset["columns"] = self.columns_for(dataset_id)
        dataset["pii_column_count"] = len([column for column in dataset["columns"] if column["pii"]])
        dataset["freshness"] = freshness_status(dataset)
        dataset["latest_quality"] = self.latest_quality(dataset_id)
        return dataset

    def get_job(self, job_id: str, include_policy: bool = True) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown job: {job_id}")
        job = job_from_row(row)
        job["inputs"] = [
            item["dataset_id"]
            for item in self.conn.execute("SELECT dataset_id FROM job_inputs WHERE job_id = ? ORDER BY dataset_id", (job_id,)).fetchall()
        ]
        job["outputs"] = [
            item["dataset_id"]
            for item in self.conn.execute("SELECT dataset_id FROM job_outputs WHERE job_id = ? ORDER BY dataset_id", (job_id,)).fetchall()
        ]
        if include_policy:
            job["latest_policy_decision"] = self.latest_policy_decision(job_id)
        return job

    def get_quality_check(self, check_id: int) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM quality_checks WHERE check_id = ?", (check_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown quality check: {check_id}")
        return quality_from_row(row)

    def columns_for(self, dataset_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM columns WHERE dataset_id = ? ORDER BY column_name", (dataset_id,)).fetchall()
        return [column_from_row(row) for row in rows]

    def latest_quality(self, dataset_id: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT * FROM quality_checks WHERE dataset_id = ? ORDER BY created_at DESC, check_id DESC LIMIT 1",
            (dataset_id,),
        ).fetchone()
        return quality_from_row(row) if row else None

    def latest_policy_decision(self, job_id: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT * FROM policy_decisions WHERE job_id = ? ORDER BY created_at DESC, decision_id DESC LIMIT 1",
            (job_id,),
        ).fetchone()
        return decision_from_row(row) if row else None

    def list_datasets(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT dataset_id FROM datasets ORDER BY dataset_id").fetchall()
        return [self.get_dataset(row["dataset_id"]) for row in rows]

    def list_jobs(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT job_id FROM jobs ORDER BY job_id").fetchall()
        return [self.get_job(row["job_id"]) for row in rows]

    def list_quality(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM quality_checks ORDER BY created_at DESC, check_id DESC").fetchall()
        return [quality_from_row(row) for row in rows]

    def list_policy_decisions(self, limit: int = 30) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM policy_decisions ORDER BY decision_id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [decision_from_row(row) for row in rows]

    def audit(self, actor: str, action: str, resource: str, message: str) -> None:
        self.conn.execute(
            "INSERT INTO audit_events(created_at, actor, action, resource, message) VALUES (?, ?, ?, ?, ?)",
            (now_ts(), token(actor, "actor"), token(action, "action"), resource, message),
        )
        self.conn.commit()

    def list_audits(self, limit: int = 30) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM audit_events ORDER BY audit_id DESC LIMIT ?", (limit,)).fetchall()
        return [audit_from_row(row) for row in rows]

    def snapshot(self) -> dict[str, Any]:
        datasets = self.list_datasets()
        jobs = self.list_jobs()
        stale = [item for item in datasets if item["freshness"]["status"] == "STALE"]
        violations = [job for job in jobs if job["latest_policy_decision"] and not job["latest_policy_decision"]["allowed"]]
        return {
            "dataset_count": len(datasets),
            "job_count": len(jobs),
            "pii_dataset_count": len([item for item in datasets if item["pii_column_count"] > 0]),
            "policy_violation_count": len(violations),
            "stale_dataset_count": len(stale),
            "datasets": datasets,
            "jobs": jobs,
            "quality_checks": self.list_quality(),
            "policy_decisions": self.list_policy_decisions(),
            "audit_events": self.list_audits(),
        }


def freshness_status(dataset: dict[str, Any]) -> dict[str, Any]:
    age_seconds = max(0, now_ts() - dataset["last_updated"])
    threshold = dataset["freshness_sla_minutes"] * 60
    return {
        "age_seconds": age_seconds,
        "sla_seconds": threshold,
        "status": "FRESH" if age_seconds <= threshold else "STALE",
    }


def dataset_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "dataset_id": row["dataset_id"],
        "owner_team": row["owner_team"],
        "classification": row["classification"],
        "zone": row["zone"],
        "freshness_sla_minutes": row["freshness_sla_minutes"],
        "last_updated": row["last_updated"],
        "description": row["description"],
        "metadata": decode_json(row["metadata_json"], {}),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def column_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "dataset_id": row["dataset_id"],
        "column_name": row["column_name"],
        "data_type": row["data_type"],
        "pii": bool(row["pii"]),
        "tags": decode_json(row["tags_json"], []),
    }


def job_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "job_id": row["job_id"],
        "owner_team": row["owner_team"],
        "code_version": row["code_version"],
        "schedule": row["schedule"],
        "description": row["description"],
        "created_at": row["created_at"],
    }


def quality_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "check_id": row["check_id"],
        "dataset_id": row["dataset_id"],
        "check_name": row["check_name"],
        "status": row["status"],
        "metric_value": row["metric_value"],
        "threshold": row["threshold"],
        "message": row["message"],
        "created_at": row["created_at"],
    }


def decision_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "decision_id": row["decision_id"],
        "job_id": row["job_id"],
        "allowed": bool(row["allowed"]),
        "reasons": decode_json(row["reasons_json"], []),
        "created_at": row["created_at"],
    }


def audit_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "audit_id": row["audit_id"],
        "created_at": row["created_at"],
        "actor": row["actor"],
        "action": row["action"],
        "resource": row["resource"],
        "message": row["message"],
    }


def build_governance(db_path: Path | str) -> DataGovernance:
    governance = DataGovernance(db_path)
    governance.seed_if_empty()
    return governance


def demo(db_path: Path | str = ":memory:") -> dict[str, Any]:
    governance = build_governance(db_path)
    governance.register_dataset(
        {
            "dataset_id": "external.marketing_export",
            "owner_team": "marketing",
            "classification": "PUBLIC",
            "zone": "external",
            "freshness_sla_minutes": 1440,
            "description": "Outbound marketing export.",
            "columns": [{"name": "email", "type": "string", "pii": True, "tags": ["email"]}],
        },
        actor="demo",
    )
    risky_job = governance.register_job(
        {
            "job_id": "job.marketing-export",
            "owner_team": "marketing",
            "code_version": "git:def456",
            "schedule": "daily",
            "description": "Unsafe export of customer emails.",
            "inputs": ["raw.customers"],
            "outputs": ["external.marketing_export"],
        },
        actor="demo",
    )
    impact = governance.impact_analysis("raw.customers", actor="demo")
    stale = governance.update_freshness("raw.orders", actor="demo", timestamp=now_ts() - 7200)
    quality = governance.record_quality_check(
        {
            "dataset_id": "external.marketing_export",
            "check_name": "pii_policy_review",
            "status": "FAIL",
            "metric_value": 1,
            "threshold": 0,
            "message": "PII present in public external dataset.",
        },
        actor="demo",
    )
    return {"risky_job": risky_job, "impact": impact, "stale_dataset": stale, "quality": quality, "snapshot": governance.snapshot()}


class ApiHandler(BaseHTTPRequestHandler):
    governance: DataGovernance

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.html(render_home(self.governance.snapshot()))
        elif parsed.path == "/health":
            self.json({"status": "ok"})
        elif parsed.path == "/snapshot":
            self.json(self.governance.snapshot())
        elif parsed.path == "/datasets":
            self.json({"datasets": self.governance.list_datasets()})
        elif parsed.path == "/jobs":
            self.json({"jobs": self.governance.list_jobs()})
        elif parsed.path == "/quality":
            self.json({"quality_checks": self.governance.list_quality()})
        elif parsed.path == "/policies/decisions":
            self.json({"policy_decisions": self.governance.list_policy_decisions(100)})
        elif parsed.path == "/audit":
            self.json({"audit_events": self.governance.list_audits(100)})
        elif parsed.path.startswith("/lineage/"):
            dataset_id = urllib.parse.unquote(parsed.path.removeprefix("/lineage/"))
            self.json(self.governance.lineage_for(dataset_id, actor="api"))
        elif parsed.path.startswith("/impact/"):
            dataset_id = urllib.parse.unquote(parsed.path.removeprefix("/impact/"))
            self.json(self.governance.impact_analysis(dataset_id, actor="api"))
        else:
            self.error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        try:
            payload = self.read_json()
            actor = payload.get("actor", "api")
            if parsed.path == "/datasets":
                self.json(self.governance.register_dataset(payload, actor=actor), HTTPStatus.CREATED)
            elif parsed.path == "/jobs":
                self.json(self.governance.register_job(payload, actor=actor), HTTPStatus.CREATED)
            elif parsed.path == "/quality":
                self.json(self.governance.record_quality_check(payload, actor=actor), HTTPStatus.CREATED)
            elif parsed.path.startswith("/datasets/") and parsed.path.endswith("/freshness"):
                dataset_id = urllib.parse.unquote(parsed.path.removeprefix("/datasets/").removesuffix("/freshness"))
                self.json(self.governance.update_freshness(dataset_id, actor=actor, timestamp=payload.get("last_updated")))
            else:
                self.error(HTTPStatus.NOT_FOUND, "not found")
        except (json.JSONDecodeError, ValueError) as exc:
            self.error(HTTPStatus.BAD_REQUEST, str(exc))

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
    dataset_rows = "\n".join(
        f"""
        <tr>
          <td>{item['dataset_id']}</td>
          <td>{item['owner_team']}</td>
          <td>{item['classification']}</td>
          <td>{item['zone']}</td>
          <td>{item['pii_column_count']}</td>
          <td><span class="{item['freshness']['status'].lower()}">{item['freshness']['status']}</span></td>
        </tr>
        """
        for item in snapshot["datasets"]
    )
    job_rows = "\n".join(
        f"""
        <tr>
          <td>{item['job_id']}</td>
          <td>{', '.join(item['inputs'])}</td>
          <td>{', '.join(item['outputs'])}</td>
          <td><span class="{'allowed' if item['latest_policy_decision']['allowed'] else 'blocked'}">{'allowed' if item['latest_policy_decision']['allowed'] else 'blocked'}</span></td>
          <td>{'; '.join(item['latest_policy_decision']['reasons'])}</td>
        </tr>
        """
        for item in snapshot["jobs"]
    )
    audit_rows = "\n".join(
        f"""
        <tr>
          <td>#{item['audit_id']}</td>
          <td>{item['actor']}</td>
          <td>{item['action']}</td>
          <td>{item['resource']}</td>
          <td>{item['message']}</td>
        </tr>
        """
        for item in snapshot["audit_events"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Data Lineage Governance POC</title>
  <style>
    body {{ margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; background: #f7f8fb; }}
    header {{ background: #102033; color: white; padding: 28px 32px; }}
    main {{ max-width: 1220px; margin: 0 auto; padding: 28px 24px 48px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; }}
    h2 {{ font-size: 18px; margin: 28px 0 12px; }}
    p {{ margin: 0; color: #d8e0eb; }}
    .metrics {{ display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }}
    .metric, section {{ background: white; border: 1px solid #d8dee8; border-radius: 8px; }}
    .metric {{ padding: 16px; }}
    .metric strong {{ display: block; font-size: 28px; }}
    .metric span {{ color: #5d6675; font-size: 13px; }}
    section {{ padding: 18px; overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ border-bottom: 1px solid #ecf0f5; padding: 10px; text-align: left; vertical-align: top; }}
    th {{ color: #4b5563; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }}
    .fresh, .allowed {{ color: #047857; font-weight: 700; }}
    .stale, .blocked {{ color: #b42318; font-weight: 700; }}
    @media (max-width: 900px) {{ .metrics {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
  </style>
</head>
<body>
  <header>
    <h1>Data Lineage Governance</h1>
    <p>Dataset ownership, classification, PII columns, transformation lineage, quality checks, freshness SLAs, policy gates, and impact analysis.</p>
  </header>
  <main>
    <div class="metrics">
      <div class="metric"><strong>{snapshot['dataset_count']}</strong><span>datasets</span></div>
      <div class="metric"><strong>{snapshot['job_count']}</strong><span>jobs</span></div>
      <div class="metric"><strong>{snapshot['pii_dataset_count']}</strong><span>PII datasets</span></div>
      <div class="metric"><strong>{snapshot['policy_violation_count']}</strong><span>policy violations</span></div>
      <div class="metric"><strong>{snapshot['stale_dataset_count']}</strong><span>stale datasets</span></div>
    </div>
    <h2>Datasets</h2>
    <section><table><thead><tr><th>Dataset</th><th>Owner</th><th>Class</th><th>Zone</th><th>PII Cols</th><th>Freshness</th></tr></thead><tbody>{dataset_rows}</tbody></table></section>
    <h2>Jobs</h2>
    <section><table><thead><tr><th>Job</th><th>Inputs</th><th>Outputs</th><th>Policy</th><th>Reason</th></tr></thead><tbody>{job_rows}</tbody></table></section>
    <h2>Audit</h2>
    <section><table><thead><tr><th>ID</th><th>Actor</th><th>Action</th><th>Resource</th><th>Message</th></tr></thead><tbody>{audit_rows}</tbody></table></section>
  </main>
</body>
</html>"""


def serve(db_path: Path | str, host: str, port: int) -> None:
    governance = build_governance(db_path)
    ApiHandler.governance = governance
    server = HTTPServer((host, port), ApiHandler)
    print(f"Data Lineage Governance POC running at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        governance.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Data lineage governance POC")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("demo", help="Run a local demo flow")
    serve_parser = subcommands.add_parser("serve", help="Start HTTP server")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8169)
    args = parser.parse_args()

    if args.command == "demo":
        print(json.dumps(demo(args.db_path), indent=2, sort_keys=True))
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
