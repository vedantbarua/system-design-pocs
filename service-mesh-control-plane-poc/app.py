#!/usr/bin/env python3
"""Service mesh control plane POC.

This app models the control-plane decisions behind east-west service traffic:
sidecar registration, mTLS identity checks, traffic splitting, retries,
timeouts, circuit breakers, outlier ejection, and request traces. It uses
SQLite and the Python standard library so it can run locally without services.
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
DEFAULT_DB_PATH = RUNTIME_DIR / "service_mesh.db"
INSTANCE_STATUSES = {"UP", "DRAINING", "DOWN"}


def now_ts() -> int:
    return int(time.time())


def encode_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def decode_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)


def token(value: Any, field: str, max_len: int = 120) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    if not re.fullmatch(r"[A-Za-z0-9._:/-]+", result):
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, slash, or dash")
    return result


def metadata(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("metadata must be an object")
    return value


def clamp_int(value: Any, field: str, minimum: int, maximum: int) -> int:
    result = int(value)
    if result < minimum or result > maximum:
        raise ValueError(f"{field} must be between {minimum} and {maximum}")
    return result


class ServiceMeshControlPlane:
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
            CREATE TABLE IF NOT EXISTS sidecars (
                instance_id TEXT PRIMARY KEY,
                service TEXT NOT NULL,
                version TEXT NOT NULL,
                zone TEXT NOT NULL,
                identity TEXT NOT NULL,
                status TEXT NOT NULL,
                weight INTEGER NOT NULL,
                metadata_json TEXT NOT NULL,
                consecutive_failures INTEGER NOT NULL,
                ejected_until INTEGER NOT NULL,
                last_heartbeat INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS traffic_policies (
                policy_id TEXT PRIMARY KEY,
                source_service TEXT NOT NULL,
                destination_service TEXT NOT NULL,
                mtls_required INTEGER NOT NULL,
                allowed_identities_json TEXT NOT NULL,
                timeout_ms INTEGER NOT NULL,
                max_retries INTEGER NOT NULL,
                retry_budget INTEGER NOT NULL,
                retry_budget_used INTEGER NOT NULL,
                circuit_failure_threshold INTEGER NOT NULL,
                circuit_open_until INTEGER NOT NULL,
                outlier_failure_threshold INTEGER NOT NULL,
                ejection_seconds INTEGER NOT NULL,
                traffic_split_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS request_traces (
                trace_id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                source_service TEXT NOT NULL,
                destination_service TEXT NOT NULL,
                identity TEXT NOT NULL,
                decision TEXT NOT NULL,
                final_instance_id TEXT NOT NULL,
                attempts_json TEXT NOT NULL,
                reason TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def seed_if_empty(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) AS count FROM sidecars").fetchone()["count"]
        if count:
            return
        self.register_sidecar(
            {
                "instance_id": "checkout-v1-a",
                "service": "checkout",
                "version": "v1",
                "zone": "us-east-1a",
                "identity": "spiffe://mesh/checkout",
                "weight": 100,
                "metadata": {"owner": "orders", "build": "2026.05.21"},
            }
        )
        self.register_sidecar(
            {
                "instance_id": "checkout-v1-b",
                "service": "checkout",
                "version": "v1",
                "zone": "us-east-1b",
                "identity": "spiffe://mesh/checkout",
                "weight": 100,
                "metadata": {"owner": "orders", "build": "2026.05.21"},
            }
        )
        self.register_sidecar(
            {
                "instance_id": "checkout-v2-canary",
                "service": "checkout",
                "version": "v2",
                "zone": "us-east-1a",
                "identity": "spiffe://mesh/checkout",
                "weight": 100,
                "metadata": {"owner": "orders", "stage": "canary"},
            }
        )
        self.register_sidecar(
            {
                "instance_id": "payments-v1-a",
                "service": "payments",
                "version": "v1",
                "zone": "us-east-1a",
                "identity": "spiffe://mesh/payments",
                "weight": 100,
                "metadata": {"owner": "billing"},
            }
        )
        self.upsert_policy(
            {
                "policy_id": "frontend-to-checkout",
                "source_service": "frontend",
                "destination_service": "checkout",
                "mtls_required": True,
                "allowed_identities": ["spiffe://mesh/frontend"],
                "timeout_ms": 200,
                "max_retries": 2,
                "retry_budget": 5,
                "circuit_failure_threshold": 3,
                "outlier_failure_threshold": 2,
                "ejection_seconds": 15,
                "traffic_split": {"v1": 90, "v2": 10},
            }
        )
        self.upsert_policy(
            {
                "policy_id": "checkout-to-payments",
                "source_service": "checkout",
                "destination_service": "payments",
                "mtls_required": True,
                "allowed_identities": ["spiffe://mesh/checkout"],
                "timeout_ms": 150,
                "max_retries": 1,
                "retry_budget": 3,
                "circuit_failure_threshold": 2,
                "outlier_failure_threshold": 2,
                "ejection_seconds": 20,
                "traffic_split": {"v1": 100},
            }
        )

    def register_sidecar(self, payload: dict[str, Any]) -> dict[str, Any]:
        sidecar = {
            "instance_id": token(payload.get("instance_id"), "instance_id"),
            "service": token(payload.get("service"), "service"),
            "version": token(payload.get("version", "v1"), "version", 40),
            "zone": token(payload.get("zone", "default"), "zone", 80),
            "identity": token(payload.get("identity"), "identity", 160),
            "status": token(payload.get("status", "UP"), "status", 20).upper(),
            "weight": clamp_int(payload.get("weight", 100), "weight", 1, 1000),
            "metadata": metadata(payload.get("metadata")),
        }
        if sidecar["status"] not in INSTANCE_STATUSES:
            raise ValueError("status must be UP, DRAINING, or DOWN")
        timestamp = now_ts()
        self.conn.execute(
            """
            INSERT INTO sidecars(
                instance_id, service, version, zone, identity, status, weight,
                metadata_json, consecutive_failures, ejected_until, last_heartbeat, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
            ON CONFLICT(instance_id) DO UPDATE SET
                service = excluded.service,
                version = excluded.version,
                zone = excluded.zone,
                identity = excluded.identity,
                status = excluded.status,
                weight = excluded.weight,
                metadata_json = excluded.metadata_json,
                last_heartbeat = excluded.last_heartbeat,
                updated_at = excluded.updated_at
            """,
            (
                sidecar["instance_id"],
                sidecar["service"],
                sidecar["version"],
                sidecar["zone"],
                sidecar["identity"],
                sidecar["status"],
                sidecar["weight"],
                encode_json(sidecar["metadata"]),
                timestamp,
                timestamp,
            ),
        )
        self.conn.commit()
        return self.get_sidecar(sidecar["instance_id"])

    def heartbeat(self, instance_id: str) -> dict[str, Any]:
        instance_id = token(instance_id, "instance_id")
        self.require_sidecar(instance_id)
        self.conn.execute(
            "UPDATE sidecars SET last_heartbeat = ?, updated_at = ? WHERE instance_id = ?",
            (now_ts(), now_ts(), instance_id),
        )
        self.conn.commit()
        return self.get_sidecar(instance_id)

    def set_sidecar_status(self, instance_id: str, status: str) -> dict[str, Any]:
        instance_id = token(instance_id, "instance_id")
        status = token(status, "status", 20).upper()
        if status not in INSTANCE_STATUSES:
            raise ValueError("status must be UP, DRAINING, or DOWN")
        self.require_sidecar(instance_id)
        self.conn.execute(
            "UPDATE sidecars SET status = ?, updated_at = ? WHERE instance_id = ?",
            (status, now_ts(), instance_id),
        )
        self.conn.commit()
        return self.get_sidecar(instance_id)

    def upsert_policy(self, payload: dict[str, Any]) -> dict[str, Any]:
        traffic_split = normalize_traffic_split(payload.get("traffic_split", {"v1": 100}))
        allowed = payload.get("allowed_identities", ["*"])
        if not isinstance(allowed, list) or not allowed:
            raise ValueError("allowed_identities must be a non-empty list")
        policy = {
            "policy_id": token(payload.get("policy_id"), "policy_id"),
            "source_service": token(payload.get("source_service"), "source_service"),
            "destination_service": token(payload.get("destination_service"), "destination_service"),
            "mtls_required": bool(payload.get("mtls_required", True)),
            "allowed_identities": [token(item, "allowed_identity", 160) if item != "*" else "*" for item in allowed],
            "timeout_ms": clamp_int(payload.get("timeout_ms", 200), "timeout_ms", 1, 60000),
            "max_retries": clamp_int(payload.get("max_retries", 1), "max_retries", 0, 10),
            "retry_budget": clamp_int(payload.get("retry_budget", 10), "retry_budget", 0, 10000),
            "circuit_failure_threshold": clamp_int(
                payload.get("circuit_failure_threshold", 3), "circuit_failure_threshold", 1, 100
            ),
            "outlier_failure_threshold": clamp_int(
                payload.get("outlier_failure_threshold", 2), "outlier_failure_threshold", 1, 100
            ),
            "ejection_seconds": clamp_int(payload.get("ejection_seconds", 30), "ejection_seconds", 1, 3600),
            "traffic_split": traffic_split,
        }
        current = self.conn.execute(
            "SELECT retry_budget_used, circuit_open_until FROM traffic_policies WHERE policy_id = ?",
            (policy["policy_id"],),
        ).fetchone()
        retry_budget_used = int(current["retry_budget_used"]) if current else 0
        circuit_open_until = int(current["circuit_open_until"]) if current else 0
        self.conn.execute(
            """
            INSERT INTO traffic_policies(
                policy_id, source_service, destination_service, mtls_required,
                allowed_identities_json, timeout_ms, max_retries, retry_budget,
                retry_budget_used, circuit_failure_threshold, circuit_open_until,
                outlier_failure_threshold, ejection_seconds, traffic_split_json, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(policy_id) DO UPDATE SET
                source_service = excluded.source_service,
                destination_service = excluded.destination_service,
                mtls_required = excluded.mtls_required,
                allowed_identities_json = excluded.allowed_identities_json,
                timeout_ms = excluded.timeout_ms,
                max_retries = excluded.max_retries,
                retry_budget = excluded.retry_budget,
                retry_budget_used = MIN(excluded.retry_budget, traffic_policies.retry_budget_used),
                circuit_failure_threshold = excluded.circuit_failure_threshold,
                outlier_failure_threshold = excluded.outlier_failure_threshold,
                ejection_seconds = excluded.ejection_seconds,
                traffic_split_json = excluded.traffic_split_json,
                updated_at = excluded.updated_at
            """,
            (
                policy["policy_id"],
                policy["source_service"],
                policy["destination_service"],
                int(policy["mtls_required"]),
                encode_json(policy["allowed_identities"]),
                policy["timeout_ms"],
                policy["max_retries"],
                policy["retry_budget"],
                retry_budget_used,
                policy["circuit_failure_threshold"],
                circuit_open_until,
                policy["outlier_failure_threshold"],
                policy["ejection_seconds"],
                encode_json(policy["traffic_split"]),
                now_ts(),
            ),
        )
        self.conn.commit()
        return self.get_policy(policy["policy_id"])

    def route_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        source_service = token(payload.get("source_service"), "source_service")
        destination_service = token(payload.get("destination_service"), "destination_service")
        identity = token(payload.get("identity"), "identity", 160)
        request_id = token(payload.get("request_id", f"request:{now_ts()}"), "request_id", 160)
        force_failures = set(payload.get("force_failures", []))
        if not all(isinstance(item, str) for item in force_failures):
            raise ValueError("force_failures must be a list of instance ids")

        policy = self.policy_for(source_service, destination_service)
        trace_id = stable_id(f"{request_id}:{source_service}:{destination_service}:{time.time_ns()}")
        if policy["mtls_required"] and not identity:
            return self.record_trace(trace_id, source_service, destination_service, identity, "deny", "", [], "mTLS identity is required")
        if "*" not in policy["allowed_identities"] and identity not in policy["allowed_identities"]:
            return self.record_trace(trace_id, source_service, destination_service, identity, "deny", "", [], "identity is not allowed by policy")
        if policy["circuit_open_until"] > now_ts():
            return self.record_trace(trace_id, source_service, destination_service, identity, "unavailable", "", [], "circuit breaker is open")

        attempts: list[dict[str, Any]] = []
        max_attempts = 1 + min(policy["max_retries"], max(0, policy["retry_budget"] - policy["retry_budget_used"]))
        excluded: set[str] = set()
        selected_final = ""
        final_decision = "unavailable"
        reason = "no healthy upstream instance"

        for attempt_number in range(1, max_attempts + 1):
            if attempt_number > 1:
                self.consume_retry_budget(policy["policy_id"])
            candidate = self.select_instance(policy, request_id, excluded)
            if candidate is None:
                reason = "no eligible upstream instance"
                break
            excluded.add(candidate["instance_id"])
            simulated = simulate_upstream(candidate, policy, force_failures)
            attempt = {
                "attempt": attempt_number,
                "instance_id": candidate["instance_id"],
                "version": candidate["version"],
                "zone": candidate["zone"],
                "outcome": simulated["outcome"],
                "latency_ms": simulated["latency_ms"],
                "reason": simulated["reason"],
            }
            attempts.append(attempt)
            if simulated["success"]:
                self.record_instance_result(candidate["instance_id"], True, policy)
                selected_final = candidate["instance_id"]
                final_decision = "allow"
                reason = f"routed to {candidate['instance_id']}"
                break
            self.record_instance_result(candidate["instance_id"], False, policy)

        if final_decision != "allow":
            self.record_policy_failure(policy)
        else:
            self.reset_circuit(policy["policy_id"])

        return self.record_trace(
            trace_id,
            source_service,
            destination_service,
            identity,
            final_decision,
            selected_final,
            attempts,
            reason,
        )

    def select_instance(self, policy: dict[str, Any], request_id: str, excluded: set[str]) -> dict[str, Any] | None:
        target_version = choose_version(policy["traffic_split"], request_id)
        candidates = self.eligible_sidecars(policy["destination_service"], target_version, excluded)
        if not candidates:
            candidates = self.eligible_sidecars(policy["destination_service"], None, excluded)
        if not candidates:
            return None
        return max(candidates, key=lambda item: weighted_score(request_id, item))

    def eligible_sidecars(self, service: str, version: str | None, excluded: set[str]) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT * FROM sidecars
            WHERE service = ?
            ORDER BY instance_id
            """,
            (service,),
        ).fetchall()
        timestamp = now_ts()
        result = []
        for row in rows:
            item = sidecar_from_row(row)
            if item["instance_id"] in excluded:
                continue
            if item["status"] != "UP":
                continue
            if item["ejected_until"] > timestamp:
                continue
            if version is not None and item["version"] != version:
                continue
            result.append(item)
        return result

    def record_instance_result(self, instance_id: str, success: bool, policy: dict[str, Any]) -> dict[str, Any]:
        sidecar = self.require_sidecar(instance_id)
        if success:
            failures = 0
            ejected_until = sidecar["ejected_until"]
        else:
            failures = sidecar["consecutive_failures"] + 1
            ejected_until = (
                now_ts() + policy["ejection_seconds"]
                if failures >= policy["outlier_failure_threshold"]
                else sidecar["ejected_until"]
            )
        self.conn.execute(
            """
            UPDATE sidecars
            SET consecutive_failures = ?, ejected_until = ?, updated_at = ?
            WHERE instance_id = ?
            """,
            (failures, ejected_until, now_ts(), instance_id),
        )
        self.conn.commit()
        return self.get_sidecar(instance_id)

    def consume_retry_budget(self, policy_id: str) -> None:
        self.conn.execute(
            """
            UPDATE traffic_policies
            SET retry_budget_used = MIN(retry_budget, retry_budget_used + 1), updated_at = ?
            WHERE policy_id = ?
            """,
            (now_ts(), policy_id),
        )
        self.conn.commit()

    def record_policy_failure(self, policy: dict[str, Any]) -> None:
        failures = self.destination_failure_count(policy["destination_service"])
        if failures >= policy["circuit_failure_threshold"]:
            self.conn.execute(
                """
                UPDATE traffic_policies
                SET circuit_open_until = ?, updated_at = ?
                WHERE policy_id = ?
                """,
                (now_ts() + policy["ejection_seconds"], now_ts(), policy["policy_id"]),
            )
            self.conn.commit()

    def reset_circuit(self, policy_id: str) -> None:
        self.conn.execute(
            "UPDATE traffic_policies SET circuit_open_until = 0, updated_at = ? WHERE policy_id = ?",
            (now_ts(), policy_id),
        )
        self.conn.commit()

    def destination_failure_count(self, service: str) -> int:
        row = self.conn.execute(
            "SELECT COALESCE(SUM(consecutive_failures), 0) AS failures FROM sidecars WHERE service = ?",
            (service,),
        ).fetchone()
        return int(row["failures"])

    def record_trace(
        self,
        trace_id: str,
        source_service: str,
        destination_service: str,
        identity: str,
        decision: str,
        final_instance_id: str,
        attempts: list[dict[str, Any]],
        reason: str,
    ) -> dict[str, Any]:
        self.conn.execute(
            """
            INSERT INTO request_traces(
                trace_id, created_at, source_service, destination_service, identity,
                decision, final_instance_id, attempts_json, reason
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                trace_id,
                now_ts(),
                source_service,
                destination_service,
                identity,
                decision,
                final_instance_id,
                encode_json(attempts),
                reason,
            ),
        )
        self.conn.commit()
        return {
            "trace_id": trace_id,
            "source_service": source_service,
            "destination_service": destination_service,
            "identity": identity,
            "decision": decision,
            "final_instance_id": final_instance_id,
            "attempts": attempts,
            "reason": reason,
        }

    def policy_for(self, source_service: str, destination_service: str) -> dict[str, Any]:
        row = self.conn.execute(
            """
            SELECT * FROM traffic_policies
            WHERE source_service = ? AND destination_service = ?
            ORDER BY policy_id
            LIMIT 1
            """,
            (source_service, destination_service),
        ).fetchone()
        if not row:
            raise ValueError(f"no policy for {source_service} -> {destination_service}")
        return policy_from_row(row)

    def get_policy(self, policy_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM traffic_policies WHERE policy_id = ?", (policy_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown policy: {policy_id}")
        return policy_from_row(row)

    def get_sidecar(self, instance_id: str) -> dict[str, Any]:
        return sidecar_from_row(self.require_sidecar(instance_id))

    def require_sidecar(self, instance_id: str) -> sqlite3.Row:
        row = self.conn.execute("SELECT * FROM sidecars WHERE instance_id = ?", (instance_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown sidecar: {instance_id}")
        return row

    def list_sidecars(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM sidecars ORDER BY service, instance_id").fetchall()
        return [sidecar_from_row(row) for row in rows]

    def list_policies(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM traffic_policies ORDER BY source_service, destination_service").fetchall()
        return [policy_from_row(row) for row in rows]

    def recent_traces(self, limit: int = 12) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT * FROM request_traces
            ORDER BY created_at DESC, trace_id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [trace_from_row(row) for row in rows]

    def snapshot(self) -> dict[str, Any]:
        sidecars = self.list_sidecars()
        policies = self.list_policies()
        services = sorted({item["service"] for item in sidecars})
        return {
            "service_count": len(services),
            "sidecar_count": len(sidecars),
            "policy_count": len(policies),
            "ejected_count": len([item for item in sidecars if item["ejected_until"] > now_ts()]),
            "services": services,
            "sidecars": sidecars,
            "policies": policies,
            "recent_traces": self.recent_traces(),
        }


def normalize_traffic_split(value: Any) -> dict[str, int]:
    if not isinstance(value, dict) or not value:
        raise ValueError("traffic_split must be a non-empty object")
    result = {token(version, "traffic_split version", 40): int(weight) for version, weight in value.items()}
    if any(weight < 0 for weight in result.values()):
        raise ValueError("traffic split weights must be non-negative")
    total = sum(result.values())
    if total <= 0:
        raise ValueError("traffic split total weight must be positive")
    return result


def choose_version(split: dict[str, int], key: str) -> str:
    total = sum(split.values())
    bucket = stable_int(key) % total
    cursor = 0
    for version, weight in sorted(split.items()):
        cursor += weight
        if bucket < cursor:
            return version
    return sorted(split)[-1]


def weighted_score(request_id: str, sidecar: dict[str, Any]) -> float:
    score = stable_int(f"{request_id}:{sidecar['instance_id']}") / float(2**256)
    return score * sidecar["weight"]


def stable_int(value: str) -> int:
    return int(hashlib.sha256(value.encode("utf-8")).hexdigest(), 16)


def stable_id(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def simulate_upstream(candidate: dict[str, Any], policy: dict[str, Any], force_failures: set[str]) -> dict[str, Any]:
    if candidate["instance_id"] in force_failures:
        return {"success": False, "outcome": "failure", "latency_ms": policy["timeout_ms"], "reason": "forced failure"}
    latency_ms = 20 + stable_int(candidate["instance_id"]) % max(1, policy["timeout_ms"] // 2)
    return {"success": True, "outcome": "success", "latency_ms": latency_ms, "reason": "upstream returned 200"}


def sidecar_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "instance_id": row["instance_id"],
        "service": row["service"],
        "version": row["version"],
        "zone": row["zone"],
        "identity": row["identity"],
        "status": row["status"],
        "weight": row["weight"],
        "metadata": decode_json(row["metadata_json"], {}),
        "consecutive_failures": row["consecutive_failures"],
        "ejected_until": row["ejected_until"],
        "last_heartbeat": row["last_heartbeat"],
        "updated_at": row["updated_at"],
    }


def policy_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "policy_id": row["policy_id"],
        "source_service": row["source_service"],
        "destination_service": row["destination_service"],
        "mtls_required": bool(row["mtls_required"]),
        "allowed_identities": decode_json(row["allowed_identities_json"], []),
        "timeout_ms": row["timeout_ms"],
        "max_retries": row["max_retries"],
        "retry_budget": row["retry_budget"],
        "retry_budget_used": row["retry_budget_used"],
        "circuit_failure_threshold": row["circuit_failure_threshold"],
        "circuit_open_until": row["circuit_open_until"],
        "outlier_failure_threshold": row["outlier_failure_threshold"],
        "ejection_seconds": row["ejection_seconds"],
        "traffic_split": decode_json(row["traffic_split_json"], {}),
        "updated_at": row["updated_at"],
    }


def trace_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "trace_id": row["trace_id"],
        "created_at": row["created_at"],
        "source_service": row["source_service"],
        "destination_service": row["destination_service"],
        "identity": row["identity"],
        "decision": row["decision"],
        "final_instance_id": row["final_instance_id"],
        "attempts": decode_json(row["attempts_json"], []),
        "reason": row["reason"],
    }


def build_plane(db_path: Path | str) -> ServiceMeshControlPlane:
    plane = ServiceMeshControlPlane(db_path)
    plane.seed_if_empty()
    return plane


def demo(db_path: Path | str = ":memory:") -> dict[str, Any]:
    plane = build_plane(db_path)
    try:
        allowed = plane.route_request(
            {
                "source_service": "frontend",
                "destination_service": "checkout",
                "identity": "spiffe://mesh/frontend",
                "request_id": "cart-1001",
            }
        )
        denied = plane.route_request(
            {
                "source_service": "frontend",
                "destination_service": "checkout",
                "identity": "spiffe://mesh/unknown",
                "request_id": "cart-1002",
            }
        )
        retry = plane.route_request(
            {
                "source_service": "frontend",
                "destination_service": "checkout",
                "identity": "spiffe://mesh/frontend",
                "request_id": "cart-1003",
                "force_failures": [allowed["final_instance_id"]],
            }
        )
        return {"allowed": allowed, "denied": denied, "retry": retry, "snapshot": plane.snapshot()}
    finally:
        plane.close()


class ApiHandler(BaseHTTPRequestHandler):
    plane: ServiceMeshControlPlane

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.html(render_home(self.plane.snapshot()))
        elif parsed.path == "/health":
            self.json({"status": "ok"})
        elif parsed.path == "/snapshot":
            self.json(self.plane.snapshot())
        elif parsed.path == "/sidecars":
            self.json({"sidecars": self.plane.list_sidecars()})
        elif parsed.path == "/policies":
            self.json({"policies": self.plane.list_policies()})
        elif parsed.path == "/traces":
            self.json({"traces": self.plane.recent_traces(25)})
        else:
            self.error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        try:
            payload = self.read_json()
            if parsed.path == "/route":
                self.json(self.plane.route_request(payload))
            elif parsed.path == "/sidecars":
                self.json(self.plane.register_sidecar(payload), HTTPStatus.CREATED)
            elif parsed.path == "/policies":
                self.json(self.plane.upsert_policy(payload), HTTPStatus.CREATED)
            elif parsed.path.startswith("/sidecars/") and parsed.path.endswith("/heartbeat"):
                instance_id = urllib.parse.unquote(parsed.path.split("/")[2])
                self.json(self.plane.heartbeat(instance_id))
            elif parsed.path.startswith("/sidecars/") and parsed.path.endswith("/status"):
                instance_id = urllib.parse.unquote(parsed.path.split("/")[2])
                self.json(self.plane.set_sidecar_status(instance_id, payload.get("status", "")))
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
    sidecar_rows = "\n".join(
        f"""
        <tr>
          <td>{item['instance_id']}</td>
          <td>{item['service']}</td>
          <td>{item['version']}</td>
          <td>{item['zone']}</td>
          <td><span class="{item['status'].lower()}">{item['status']}</span></td>
          <td>{item['consecutive_failures']}</td>
        </tr>
        """
        for item in snapshot["sidecars"]
    )
    policy_rows = "\n".join(
        f"""
        <tr>
          <td>{item['policy_id']}</td>
          <td>{item['source_service']} -> {item['destination_service']}</td>
          <td>{item['timeout_ms']}ms</td>
          <td>{item['max_retries']}</td>
          <td>{item['retry_budget_used']} / {item['retry_budget']}</td>
          <td>{item['traffic_split']}</td>
        </tr>
        """
        for item in snapshot["policies"]
    )
    trace_rows = "\n".join(
        f"""
        <tr>
          <td>{item['trace_id']}</td>
          <td>{item['source_service']} -> {item['destination_service']}</td>
          <td><span class="{item['decision']}">{item['decision']}</span></td>
          <td>{item['final_instance_id'] or '-'}</td>
          <td>{len(item['attempts'])}</td>
          <td>{item['reason']}</td>
        </tr>
        """
        for item in snapshot["recent_traces"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Service Mesh Control Plane POC</title>
  <style>
    body {{ margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; background: #f5f7fa; }}
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
    .up, .allow {{ color: #047857; font-weight: 700; }}
    .draining, .unavailable {{ color: #b45309; font-weight: 700; }}
    .down, .deny {{ color: #b42318; font-weight: 700; }}
    @media (max-width: 760px) {{ .metrics {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
  </style>
</head>
<body>
  <header>
    <h1>Service Mesh Control Plane</h1>
    <p>Sidecar registry, mTLS policy, canary splits, retries, circuit breakers, outlier ejection, and request traces.</p>
  </header>
  <main>
    <div class="metrics">
      <div class="metric"><strong>{snapshot['service_count']}</strong><span>services</span></div>
      <div class="metric"><strong>{snapshot['sidecar_count']}</strong><span>sidecars</span></div>
      <div class="metric"><strong>{snapshot['policy_count']}</strong><span>traffic policies</span></div>
      <div class="metric"><strong>{snapshot['ejected_count']}</strong><span>ejected instances</span></div>
    </div>
    <h2>Sidecars</h2>
    <section><table><thead><tr><th>Instance</th><th>Service</th><th>Version</th><th>Zone</th><th>Status</th><th>Failures</th></tr></thead><tbody>{sidecar_rows}</tbody></table></section>
    <h2>Traffic Policies</h2>
    <section><table><thead><tr><th>Policy</th><th>Route</th><th>Timeout</th><th>Retries</th><th>Retry Budget</th><th>Split</th></tr></thead><tbody>{policy_rows}</tbody></table></section>
    <h2>Recent Traces</h2>
    <section><table><thead><tr><th>Trace</th><th>Route</th><th>Decision</th><th>Instance</th><th>Attempts</th><th>Reason</th></tr></thead><tbody>{trace_rows or '<tr><td colspan="6">No requests routed yet.</td></tr>'}</tbody></table></section>
  </main>
</body>
</html>"""


def serve(db_path: Path | str, host: str, port: int) -> None:
    plane = build_plane(db_path)
    ApiHandler.plane = plane
    server = HTTPServer((host, port), ApiHandler)
    print(f"Service Mesh Control Plane POC running at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        plane.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Service mesh control plane POC")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("demo", help="Run a local demo flow")
    serve_parser = subcommands.add_parser("serve", help="Start HTTP server")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8164)
    args = parser.parse_args()

    if args.command == "demo":
        print(json.dumps(demo(args.db_path), indent=2, sort_keys=True))
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
