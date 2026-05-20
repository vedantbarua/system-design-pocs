#!/usr/bin/env python3
"""Policy-as-code authorization POC.

This app models a centralized authorization decision service: principals,
resources, versioned policies, deny precedence, attribute-based conditions,
dry-run policy evaluation, and decision audit logging. It uses SQLite and the
Python standard library so the POC runs without external services.
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
DEFAULT_DB_PATH = RUNTIME_DIR / "authorization.db"
EFFECTS = {"allow", "deny"}
OPERATORS = {"eq", "neq", "in", "contains", "exists", "prefix"}


def now_ts() -> int:
    return int(time.time())


def encode_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def decode_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)


def slug(value: Any, field: str, max_len: int = 120) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    if not re.fullmatch(r"[A-Za-z0-9._:/-]+", result):
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, slash, or dash")
    return result


def string_list(value: Any, field: str, allow_any: bool = True) -> list[str]:
    if value is None:
        return ["*"] if allow_any else []
    if not isinstance(value, list):
        raise ValueError(f"{field} must be a list")
    result = []
    for item in value:
        if item == "*" and allow_any:
            result.append("*")
        else:
            result.append(slug(item, field))
    if not result and allow_any:
        return ["*"]
    return sorted(set(result))


def attributes(value: Any, field: str = "attributes") -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    return value


def normalize_principal(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "principal_id": slug(payload.get("principal_id") or payload.get("id"), "principal_id"),
        "principal_type": slug(payload.get("principal_type", "user"), "principal_type", 50),
        "roles": string_list(payload.get("roles", []), "roles", allow_any=False),
        "attributes": attributes(payload.get("attributes")),
    }


def normalize_resource(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "resource_id": slug(payload.get("resource_id") or payload.get("id"), "resource_id"),
        "resource_type": slug(payload.get("resource_type"), "resource_type", 80),
        "owner_id": str(payload.get("owner_id", "")).strip(),
        "attributes": attributes(payload.get("attributes")),
    }


def normalize_policy(payload: dict[str, Any], version: int = 1) -> dict[str, Any]:
    effect = str(payload.get("effect", "allow")).lower().strip()
    if effect not in EFFECTS:
        raise ValueError("effect must be allow or deny")
    priority = int(payload.get("priority", 100))
    if priority < 0 or priority > 10000:
        raise ValueError("priority must be between 0 and 10000")
    conditions = payload.get("conditions", [])
    if not isinstance(conditions, list):
        raise ValueError("conditions must be a list")
    normalized_conditions = [normalize_condition(item) for item in conditions]
    return {
        "policy_id": slug(payload.get("policy_id"), "policy_id"),
        "version": version,
        "description": str(payload.get("description", "")).strip(),
        "effect": effect,
        "priority": priority,
        "actions": string_list(payload.get("actions"), "actions"),
        "principal_roles": string_list(payload.get("principal_roles"), "principal_roles"),
        "resource_types": string_list(payload.get("resource_types"), "resource_types"),
        "conditions": normalized_conditions,
        "enabled": bool(payload.get("enabled", True)),
        "dry_run": bool(payload.get("dry_run", False)),
    }


def normalize_condition(condition: Any) -> dict[str, Any]:
    if not isinstance(condition, dict):
        raise ValueError("condition must be an object")
    left = str(condition.get("left", "")).strip()
    operator = str(condition.get("operator", "eq")).strip()
    if not left:
        raise ValueError("condition.left is required")
    if operator not in OPERATORS:
        raise ValueError(f"unsupported condition operator: {operator}")
    result: dict[str, Any] = {"left": left, "operator": operator}
    if "right" in condition:
        result["right"] = condition["right"]
    if "right_ref" in condition:
        result["right_ref"] = str(condition["right_ref"])
    if "right" not in result and "right_ref" not in result and operator != "exists":
        raise ValueError("condition requires right or right_ref")
    return result


def has_wildcard(values: list[str]) -> bool:
    return "*" in values


class AuthorizationStore:
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
            CREATE TABLE IF NOT EXISTS principals (
                principal_id TEXT PRIMARY KEY,
                principal_type TEXT NOT NULL,
                roles_json TEXT NOT NULL,
                attributes_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS resources (
                resource_id TEXT PRIMARY KEY,
                resource_type TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                attributes_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS policies (
                policy_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                description TEXT NOT NULL,
                effect TEXT NOT NULL,
                priority INTEGER NOT NULL,
                actions_json TEXT NOT NULL,
                principal_roles_json TEXT NOT NULL,
                resource_types_json TEXT NOT NULL,
                conditions_json TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                dry_run INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(policy_id, version)
            );

            CREATE TABLE IF NOT EXISTS policy_heads (
                policy_id TEXT PRIMARY KEY,
                active_version INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS decisions (
                decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                principal_id TEXT NOT NULL,
                action TEXT NOT NULL,
                resource_id TEXT NOT NULL,
                decision TEXT NOT NULL,
                reason TEXT NOT NULL,
                matched_policies_json TEXT NOT NULL,
                dry_run_policies_json TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def seed_if_empty(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) AS count FROM policies").fetchone()["count"]
        if count:
            return
        self.upsert_principal(
            {
                "principal_id": "user:alice",
                "principal_type": "user",
                "roles": ["support_agent"],
                "attributes": {"department": "support", "region": "us"},
            }
        )
        self.upsert_principal(
            {
                "principal_id": "service:billing-api",
                "principal_type": "service",
                "roles": ["billing_service"],
                "attributes": {"tier": "internal"},
            }
        )
        self.upsert_resource(
            {
                "resource_id": "order:1001",
                "resource_type": "order",
                "owner_id": "user:alice",
                "attributes": {"region": "us", "status": "open"},
            }
        )
        self.upsert_resource(
            {
                "resource_id": "payment:9001",
                "resource_type": "payment",
                "owner_id": "user:bob",
                "attributes": {"region": "eu", "amount": 149.99},
            }
        )
        self.create_policy(
            {
                "policy_id": "deny-cross-region-support",
                "description": "Support users cannot access resources outside their assigned region.",
                "effect": "deny",
                "priority": 900,
                "actions": ["orders:read", "payments:read"],
                "principal_roles": ["support_agent"],
                "resource_types": ["order", "payment"],
                "conditions": [
                    {"left": "principal.attributes.region", "operator": "neq", "right_ref": "resource.attributes.region"}
                ],
            }
        )
        self.create_policy(
            {
                "policy_id": "allow-support-read-orders",
                "description": "Support agents can read order records in their region.",
                "effect": "allow",
                "priority": 200,
                "actions": ["orders:read"],
                "principal_roles": ["support_agent"],
                "resource_types": ["order"],
                "conditions": [
                    {"left": "principal.attributes.region", "operator": "eq", "right_ref": "resource.attributes.region"}
                ],
            }
        )
        self.create_policy(
            {
                "policy_id": "allow-billing-read-payments",
                "description": "Billing service can read payment resources.",
                "effect": "allow",
                "priority": 300,
                "actions": ["payments:read"],
                "principal_roles": ["billing_service"],
                "resource_types": ["payment"],
                "conditions": [{"left": "principal.attributes.tier", "operator": "eq", "right": "internal"}],
            }
        )
        self.create_policy(
            {
                "policy_id": "dry-run-support-payment-read",
                "description": "Candidate rule for allowing support agents to read same-region payments.",
                "effect": "allow",
                "priority": 150,
                "actions": ["payments:read"],
                "principal_roles": ["support_agent"],
                "resource_types": ["payment"],
                "conditions": [
                    {"left": "principal.attributes.region", "operator": "eq", "right_ref": "resource.attributes.region"}
                ],
                "dry_run": True,
            }
        )

    def upsert_principal(self, payload: dict[str, Any]) -> dict[str, Any]:
        principal = normalize_principal(payload)
        self.conn.execute(
            """
            INSERT INTO principals(principal_id, principal_type, roles_json, attributes_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(principal_id) DO UPDATE SET
                principal_type = excluded.principal_type,
                roles_json = excluded.roles_json,
                attributes_json = excluded.attributes_json,
                updated_at = excluded.updated_at
            """,
            (
                principal["principal_id"],
                principal["principal_type"],
                encode_json(principal["roles"]),
                encode_json(principal["attributes"]),
                now_ts(),
            ),
        )
        self.conn.commit()
        return principal

    def upsert_resource(self, payload: dict[str, Any]) -> dict[str, Any]:
        resource = normalize_resource(payload)
        self.conn.execute(
            """
            INSERT INTO resources(resource_id, resource_type, owner_id, attributes_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(resource_id) DO UPDATE SET
                resource_type = excluded.resource_type,
                owner_id = excluded.owner_id,
                attributes_json = excluded.attributes_json,
                updated_at = excluded.updated_at
            """,
            (
                resource["resource_id"],
                resource["resource_type"],
                resource["owner_id"],
                encode_json(resource["attributes"]),
                now_ts(),
            ),
        )
        self.conn.commit()
        return resource

    def create_policy(self, payload: dict[str, Any]) -> dict[str, Any]:
        policy_id = slug(payload.get("policy_id"), "policy_id")
        current = self.conn.execute(
            "SELECT active_version FROM policy_heads WHERE policy_id = ?", (policy_id,)
        ).fetchone()
        version = 1 if current is None else int(current["active_version"]) + 1
        policy = normalize_policy(payload | {"policy_id": policy_id}, version)
        self.conn.execute(
            """
            INSERT INTO policies(
                policy_id, version, description, effect, priority, actions_json,
                principal_roles_json, resource_types_json, conditions_json,
                enabled, dry_run, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                policy["policy_id"],
                policy["version"],
                policy["description"],
                policy["effect"],
                policy["priority"],
                encode_json(policy["actions"]),
                encode_json(policy["principal_roles"]),
                encode_json(policy["resource_types"]),
                encode_json(policy["conditions"]),
                int(policy["enabled"]),
                int(policy["dry_run"]),
                now_ts(),
            ),
        )
        self.conn.execute(
            """
            INSERT INTO policy_heads(policy_id, active_version)
            VALUES (?, ?)
            ON CONFLICT(policy_id) DO UPDATE SET active_version = excluded.active_version
            """,
            (policy["policy_id"], policy["version"]),
        )
        self.conn.commit()
        return policy

    def decide(self, payload: dict[str, Any]) -> dict[str, Any]:
        principal = self.resolve_principal(payload.get("principal"))
        resource = self.resolve_resource(payload.get("resource"))
        action = slug(payload.get("action"), "action")
        context = attributes(payload.get("context"), "context")

        request = {"principal": principal, "resource": resource, "action": action, "context": context}
        active_matches: list[dict[str, Any]] = []
        dry_run_matches: list[dict[str, Any]] = []
        for policy in self.active_policies():
            match = match_policy(policy, request)
            if not match["matched"]:
                continue
            entry = {
                "policy_id": policy["policy_id"],
                "version": policy["version"],
                "effect": policy["effect"],
                "priority": policy["priority"],
                "reason": match["reason"],
            }
            if policy["dry_run"]:
                dry_run_matches.append(entry)
            else:
                active_matches.append(entry)

        active_matches.sort(key=lambda item: (-item["priority"], item["policy_id"]))
        dry_run_matches.sort(key=lambda item: (-item["priority"], item["policy_id"]))

        deny = next((item for item in active_matches if item["effect"] == "deny"), None)
        allow = next((item for item in active_matches if item["effect"] == "allow"), None)
        if deny:
            decision = "deny"
            reason = f"Denied by {deny['policy_id']} v{deny['version']}."
        elif allow:
            decision = "allow"
            reason = f"Allowed by {allow['policy_id']} v{allow['version']}."
        else:
            decision = "deny"
            reason = "Default deny: no active allow policy matched."

        decision_id = self.record_decision(principal, action, resource, decision, reason, active_matches, dry_run_matches)
        return {
            "decision_id": decision_id,
            "decision": decision,
            "reason": reason,
            "principal": principal,
            "action": action,
            "resource": resource,
            "matched_policies": active_matches,
            "dry_run_policies": dry_run_matches,
        }

    def resolve_principal(self, payload: Any) -> dict[str, Any]:
        if isinstance(payload, dict) and ("roles" in payload or "attributes" in payload):
            return normalize_principal(payload)
        principal_id = slug(payload if not isinstance(payload, dict) else payload.get("principal_id"), "principal_id")
        row = self.conn.execute("SELECT * FROM principals WHERE principal_id = ?", (principal_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown principal: {principal_id}")
        return {
            "principal_id": row["principal_id"],
            "principal_type": row["principal_type"],
            "roles": decode_json(row["roles_json"], []),
            "attributes": decode_json(row["attributes_json"], {}),
        }

    def resolve_resource(self, payload: Any) -> dict[str, Any]:
        if isinstance(payload, dict) and ("resource_type" in payload or "attributes" in payload):
            return normalize_resource(payload)
        resource_id = slug(payload if not isinstance(payload, dict) else payload.get("resource_id"), "resource_id")
        row = self.conn.execute("SELECT * FROM resources WHERE resource_id = ?", (resource_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown resource: {resource_id}")
        return {
            "resource_id": row["resource_id"],
            "resource_type": row["resource_type"],
            "owner_id": row["owner_id"],
            "attributes": decode_json(row["attributes_json"], {}),
        }

    def active_policies(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT p.*
            FROM policies p
            JOIN policy_heads h ON h.policy_id = p.policy_id AND h.active_version = p.version
            WHERE p.enabled = 1
            ORDER BY p.priority DESC, p.policy_id ASC
            """
        ).fetchall()
        return [policy_from_row(row) for row in rows]

    def list_policies(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT p.*
            FROM policies p
            JOIN policy_heads h ON h.policy_id = p.policy_id AND h.active_version = p.version
            ORDER BY p.priority DESC, p.policy_id ASC
            """
        ).fetchall()
        return [policy_from_row(row) for row in rows]

    def list_principals(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM principals ORDER BY principal_id").fetchall()
        return [
            {
                "principal_id": row["principal_id"],
                "principal_type": row["principal_type"],
                "roles": decode_json(row["roles_json"], []),
                "attributes": decode_json(row["attributes_json"], {}),
            }
            for row in rows
        ]

    def list_resources(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM resources ORDER BY resource_id").fetchall()
        return [
            {
                "resource_id": row["resource_id"],
                "resource_type": row["resource_type"],
                "owner_id": row["owner_id"],
                "attributes": decode_json(row["attributes_json"], {}),
            }
            for row in rows
        ]

    def record_decision(
        self,
        principal: dict[str, Any],
        action: str,
        resource: dict[str, Any],
        decision: str,
        reason: str,
        matched_policies: list[dict[str, Any]],
        dry_run_policies: list[dict[str, Any]],
    ) -> int:
        cursor = self.conn.execute(
            """
            INSERT INTO decisions(
                created_at, principal_id, action, resource_id, decision, reason,
                matched_policies_json, dry_run_policies_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                now_ts(),
                principal["principal_id"],
                action,
                resource["resource_id"],
                decision,
                reason,
                encode_json(matched_policies),
                encode_json(dry_run_policies),
            ),
        )
        self.conn.commit()
        return int(cursor.lastrowid)

    def recent_decisions(self, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT * FROM decisions
            ORDER BY decision_id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [
            {
                "decision_id": row["decision_id"],
                "created_at": row["created_at"],
                "principal_id": row["principal_id"],
                "action": row["action"],
                "resource_id": row["resource_id"],
                "decision": row["decision"],
                "reason": row["reason"],
                "matched_policies": decode_json(row["matched_policies_json"], []),
                "dry_run_policies": decode_json(row["dry_run_policies_json"], []),
            }
            for row in rows
        ]

    def snapshot(self) -> dict[str, Any]:
        policies = self.list_policies()
        decisions = self.recent_decisions()
        return {
            "principal_count": len(self.list_principals()),
            "resource_count": len(self.list_resources()),
            "policy_count": len(policies),
            "dry_run_policy_count": len([policy for policy in policies if policy["dry_run"]]),
            "policies": policies,
            "principals": self.list_principals(),
            "resources": self.list_resources(),
            "recent_decisions": decisions,
        }


def policy_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "policy_id": row["policy_id"],
        "version": row["version"],
        "description": row["description"],
        "effect": row["effect"],
        "priority": row["priority"],
        "actions": decode_json(row["actions_json"], []),
        "principal_roles": decode_json(row["principal_roles_json"], []),
        "resource_types": decode_json(row["resource_types_json"], []),
        "conditions": decode_json(row["conditions_json"], []),
        "enabled": bool(row["enabled"]),
        "dry_run": bool(row["dry_run"]),
        "created_at": row["created_at"],
    }


def match_policy(policy: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    principal = request["principal"]
    resource = request["resource"]
    action = request["action"]
    if not has_wildcard(policy["actions"]) and action not in policy["actions"]:
        return {"matched": False, "reason": "action did not match"}
    if not has_wildcard(policy["resource_types"]) and resource["resource_type"] not in policy["resource_types"]:
        return {"matched": False, "reason": "resource type did not match"}
    if not has_wildcard(policy["principal_roles"]) and not set(principal["roles"]).intersection(policy["principal_roles"]):
        return {"matched": False, "reason": "principal role did not match"}

    failures = []
    for condition in policy["conditions"]:
        passed = evaluate_condition(condition, request)
        if not passed:
            failures.append(render_condition(condition))
    if failures:
        return {"matched": False, "reason": "conditions failed: " + ", ".join(failures)}
    return {"matched": True, "reason": "policy scope and conditions matched"}


def evaluate_condition(condition: dict[str, Any], request: dict[str, Any]) -> bool:
    left = get_ref(request, condition["left"])
    right = get_ref(request, condition["right_ref"]) if "right_ref" in condition else condition.get("right")
    operator = condition["operator"]
    if operator == "exists":
        return left is not None
    if operator == "eq":
        return left == right
    if operator == "neq":
        return left != right
    if operator == "in":
        return isinstance(right, list) and left in right
    if operator == "contains":
        return isinstance(left, list) and right in left
    if operator == "prefix":
        return isinstance(left, str) and isinstance(right, str) and left.startswith(right)
    raise ValueError(f"unsupported operator: {operator}")


def get_ref(request: dict[str, Any], ref: str) -> Any:
    current: Any = request
    for part in ref.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def render_condition(condition: dict[str, Any]) -> str:
    right = condition.get("right_ref", condition.get("right", ""))
    return f"{condition['left']} {condition['operator']} {right}"


def build_store(db_path: Path | str) -> AuthorizationStore:
    store = AuthorizationStore(db_path)
    store.seed_if_empty()
    return store


def demo(db_path: Path | str = ":memory:") -> dict[str, Any]:
    store = build_store(db_path)
    try:
        allow_order = store.decide(
            {"principal": "user:alice", "action": "orders:read", "resource": "order:1001"}
        )
        default_deny = store.decide(
            {"principal": "user:alice", "action": "payments:read", "resource": "payment:9001"}
        )
        service_allow = store.decide(
            {"principal": "service:billing-api", "action": "payments:read", "resource": "payment:9001"}
        )
        return {
            "allow_order": allow_order,
            "default_or_policy_deny": default_deny,
            "service_allow": service_allow,
            "snapshot": store.snapshot(),
        }
    finally:
        store.close()


class ApiHandler(BaseHTTPRequestHandler):
    store: AuthorizationStore

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.html(render_home(self.store.snapshot()))
        elif parsed.path == "/health":
            self.json({"status": "ok"})
        elif parsed.path == "/snapshot":
            self.json(self.store.snapshot())
        elif parsed.path == "/policies":
            self.json({"policies": self.store.list_policies()})
        elif parsed.path == "/principals":
            self.json({"principals": self.store.list_principals()})
        elif parsed.path == "/resources":
            self.json({"resources": self.store.list_resources()})
        elif parsed.path == "/decisions":
            self.json({"decisions": self.store.recent_decisions(25)})
        else:
            self.error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        try:
            payload = self.read_json()
            if parsed.path == "/authorize":
                self.json(self.store.decide(payload))
            elif parsed.path == "/principals":
                self.json(self.store.upsert_principal(payload), HTTPStatus.CREATED)
            elif parsed.path == "/resources":
                self.json(self.store.upsert_resource(payload), HTTPStatus.CREATED)
            elif parsed.path == "/policies":
                self.json(self.store.create_policy(payload), HTTPStatus.CREATED)
            else:
                self.error(HTTPStatus.NOT_FOUND, "not found")
        except (json.JSONDecodeError, ValueError) as exc:
            self.error(HTTPStatus.BAD_REQUEST, str(exc))

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0"))
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        payload = json.loads(raw)
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
    policy_rows = "\n".join(
        f"""
        <tr>
          <td>{policy['policy_id']} v{policy['version']}</td>
          <td><span class="{policy['effect']}">{policy['effect']}</span></td>
          <td>{policy['priority']}</td>
          <td>{'yes' if policy['dry_run'] else 'no'}</td>
          <td>{', '.join(policy['actions'])}</td>
        </tr>
        """
        for policy in snapshot["policies"]
    )
    decision_rows = "\n".join(
        f"""
        <tr>
          <td>#{item['decision_id']}</td>
          <td>{item['principal_id']}</td>
          <td>{item['action']}</td>
          <td>{item['resource_id']}</td>
          <td><span class="{item['decision']}">{item['decision']}</span></td>
          <td>{item['reason']}</td>
        </tr>
        """
        for item in snapshot["recent_decisions"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Policy Authorization POC</title>
  <style>
    body {{ margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #18202a; background: #f6f7f9; }}
    header {{ background: #111827; color: white; padding: 28px 32px; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 28px 24px 48px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; }}
    h2 {{ font-size: 18px; margin: 28px 0 12px; }}
    p {{ margin: 0; color: #d7dde6; }}
    .metrics {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }}
    .metric, section {{ background: white; border: 1px solid #d9dee7; border-radius: 8px; }}
    .metric {{ padding: 16px; }}
    .metric strong {{ display: block; font-size: 28px; }}
    .metric span {{ color: #5d6675; font-size: 13px; }}
    section {{ padding: 18px; overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ border-bottom: 1px solid #edf0f4; padding: 10px; text-align: left; vertical-align: top; }}
    th {{ color: #4b5563; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }}
    .allow {{ color: #047857; font-weight: 700; }}
    .deny {{ color: #b42318; font-weight: 700; }}
    code {{ background: #eef2f7; padding: 2px 5px; border-radius: 4px; }}
    @media (max-width: 760px) {{ .metrics {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
  </style>
</head>
<body>
  <header>
    <h1>Policy-as-Code Authorization</h1>
    <p>Centralized allow/deny decisions with RBAC, ABAC conditions, deny precedence, dry-run policies, and audit history.</p>
  </header>
  <main>
    <div class="metrics">
      <div class="metric"><strong>{snapshot['principal_count']}</strong><span>principals</span></div>
      <div class="metric"><strong>{snapshot['resource_count']}</strong><span>resources</span></div>
      <div class="metric"><strong>{snapshot['policy_count']}</strong><span>active policies</span></div>
      <div class="metric"><strong>{snapshot['dry_run_policy_count']}</strong><span>dry-run policies</span></div>
    </div>
    <h2>Policies</h2>
    <section>
      <table>
        <thead><tr><th>Policy</th><th>Effect</th><th>Priority</th><th>Dry Run</th><th>Actions</th></tr></thead>
        <tbody>{policy_rows}</tbody>
      </table>
    </section>
    <h2>Recent Decisions</h2>
    <section>
      <table>
        <thead><tr><th>ID</th><th>Principal</th><th>Action</th><th>Resource</th><th>Decision</th><th>Reason</th></tr></thead>
        <tbody>{decision_rows or '<tr><td colspan="6">No authorization checks have been made yet.</td></tr>'}</tbody>
      </table>
    </section>
  </main>
</body>
</html>"""


def serve(db_path: Path | str, host: str, port: int) -> None:
    store = build_store(db_path)
    ApiHandler.store = store
    server = HTTPServer((host, port), ApiHandler)
    print(f"Policy Authorization POC running at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        store.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Policy-as-code authorization POC")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("demo", help="Run a local demo flow")
    serve_parser = subcommands.add_parser("serve", help="Start HTTP server")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8163)
    args = parser.parse_args()

    if args.command == "demo":
        print(json.dumps(demo(args.db_path), indent=2, sort_keys=True))
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
