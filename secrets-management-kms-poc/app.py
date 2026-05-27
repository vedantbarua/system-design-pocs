#!/usr/bin/env python3
"""Secrets management and KMS POC.

This app models a small secrets platform: master keys, envelope-encrypted
secret versions, key rotation, policy-based access, lease-based reads,
revocation, break-glass approvals, and audit logging. It uses only SQLite and
the Python standard library, so it can run locally without external services.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
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
DEFAULT_DB_PATH = RUNTIME_DIR / "secrets.db"
ACTIONS = {"read", "write", "rotate", "admin"}
SECRET_STATUSES = {"ACTIVE", "REVOKED"}
BREAK_GLASS_STATUSES = {"REQUESTED", "APPROVED", "DENIED", "USED"}


def now_ts() -> int:
    return int(time.time())


def encode_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def decode_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)


def token(value: Any, field: str, max_len: int = 160) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    if not re.fullmatch(r"[A-Za-z0-9._:/@-]+", result):
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, slash, at, or dash")
    return result


def text(value: Any, field: str, max_len: int = 2000) -> str:
    if value is None or str(value) == "":
        raise ValueError(f"{field} is required")
    result = str(value)
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    return result


def metadata(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("metadata must be an object")
    return value


def string_list(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"{field} must be a non-empty list")
    return sorted(set(token(item, field) if item != "*" else "*" for item in value))


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii")


def unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data.encode("ascii"))


def random_key() -> str:
    return b64(os.urandom(32))


def xor_stream(data: bytes, key: bytes, aad: str) -> bytes:
    output = bytearray()
    counter = 0
    while len(output) < len(data):
        block = hashlib.sha256(key + aad.encode("utf-8") + counter.to_bytes(4, "big")).digest()
        output.extend(block)
        counter += 1
    return bytes(left ^ right for left, right in zip(data, output))


def encrypt_value(plaintext: str, key_b64: str, aad: str) -> str:
    key = unb64(key_b64)
    plain = plaintext.encode("utf-8")
    cipher = xor_stream(plain, key, aad)
    tag = hmac.new(key, aad.encode("utf-8") + cipher, hashlib.sha256).digest()
    return b64(tag + cipher)


def decrypt_value(ciphertext_b64: str, key_b64: str, aad: str) -> str:
    key = unb64(key_b64)
    raw = unb64(ciphertext_b64)
    tag, cipher = raw[:32], raw[32:]
    expected = hmac.new(key, aad.encode("utf-8") + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("ciphertext authentication failed")
    return xor_stream(cipher, key, aad).decode("utf-8")


class SecretsKMS:
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
            CREATE TABLE IF NOT EXISTS master_keys (
                key_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                material TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(key_id, version)
            );

            CREATE TABLE IF NOT EXISTS key_heads (
                key_id TEXT PRIMARY KEY,
                active_version INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS secrets (
                secret_name TEXT PRIMARY KEY,
                owner_team TEXT NOT NULL,
                key_id TEXT NOT NULL,
                latest_version INTEGER NOT NULL,
                status TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS secret_versions (
                secret_name TEXT NOT NULL,
                version INTEGER NOT NULL,
                key_id TEXT NOT NULL,
                key_version INTEGER NOT NULL,
                encrypted_data_key TEXT NOT NULL,
                ciphertext TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(secret_name, version)
            );

            CREATE TABLE IF NOT EXISTS access_policies (
                policy_id TEXT PRIMARY KEY,
                secret_name TEXT NOT NULL,
                identities_json TEXT NOT NULL,
                actions_json TEXT NOT NULL,
                max_lease_seconds INTEGER NOT NULL,
                enabled INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS leases (
                lease_id TEXT PRIMARY KEY,
                secret_name TEXT NOT NULL,
                version INTEGER NOT NULL,
                identity TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS break_glass_requests (
                request_id TEXT PRIMARY KEY,
                secret_name TEXT NOT NULL,
                identity TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL,
                approver TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                resource TEXT NOT NULL,
                allowed INTEGER NOT NULL,
                message TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def seed_if_empty(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) AS count FROM master_keys").fetchone()["count"]
        if count:
            return
        self.create_master_key("platform-prod")
        self.put_secret(
            {
                "secret_name": "payments/stripe-api-key",
                "owner_team": "payments",
                "key_id": "platform-prod",
                "value": "sk_live_example_initial",
                "created_by": "service:secrets-admin",
                "metadata": {"env": "prod", "rotation": "30d"},
            }
        )
        self.upsert_policy(
            {
                "policy_id": "payments-read-stripe",
                "secret_name": "payments/stripe-api-key",
                "identities": ["service:payments-api"],
                "actions": ["read"],
                "max_lease_seconds": 300,
            }
        )
        self.upsert_policy(
            {
                "policy_id": "payments-admin-stripe",
                "secret_name": "payments/stripe-api-key",
                "identities": ["service:secrets-admin"],
                "actions": ["read", "write", "rotate", "admin"],
                "max_lease_seconds": 900,
            }
        )

    def create_master_key(self, key_id: str, actor: str = "system") -> dict[str, Any]:
        key_id = token(key_id, "key_id")
        existing = self.conn.execute("SELECT active_version FROM key_heads WHERE key_id = ?", (key_id,)).fetchone()
        version = 1 if existing is None else int(existing["active_version"]) + 1
        self.conn.execute(
            "INSERT INTO master_keys(key_id, version, material, status, created_at) VALUES (?, ?, ?, 'ACTIVE', ?)",
            (key_id, version, random_key(), now_ts()),
        )
        self.conn.execute(
            """
            INSERT INTO key_heads(key_id, active_version)
            VALUES (?, ?)
            ON CONFLICT(key_id) DO UPDATE SET active_version = excluded.active_version
            """,
            (key_id, version),
        )
        self.conn.commit()
        self.audit(actor, "create_key", key_id, True, f"Created master key {key_id} v{version}.")
        return self.get_master_key(key_id, version)

    def rotate_master_key(self, key_id: str, actor: str = "system") -> dict[str, Any]:
        key_id = token(key_id, "key_id")
        self.get_active_key(key_id)
        new_key = self.create_master_key(key_id, actor)
        rewrapped = 0
        rows = self.conn.execute("SELECT * FROM secret_versions WHERE key_id = ?", (key_id,)).fetchall()
        for row in rows:
            old_key = self.get_master_key_material(row["key_id"], row["key_version"])
            data_key = decrypt_value(row["encrypted_data_key"], old_key, f"data-key:{row['secret_name']}:{row['version']}")
            encrypted_data_key = encrypt_value(data_key, new_key["material"], f"data-key:{row['secret_name']}:{row['version']}")
            self.conn.execute(
                """
                UPDATE secret_versions
                SET key_version = ?, encrypted_data_key = ?
                WHERE secret_name = ? AND version = ?
                """,
                (new_key["version"], encrypted_data_key, row["secret_name"], row["version"]),
            )
            rewrapped += 1
        self.conn.commit()
        self.audit(actor, "rotate_key", key_id, True, f"Rotated {key_id} to v{new_key['version']} and rewrapped {rewrapped} data keys.")
        return {"key": self.get_master_key(key_id, new_key["version"]), "rewrapped_versions": rewrapped}

    def put_secret(self, payload: dict[str, Any]) -> dict[str, Any]:
        secret_name = token(payload.get("secret_name"), "secret_name")
        actor = token(payload.get("created_by", "unknown"), "created_by")
        if self.secret_exists(secret_name):
            self.require_allowed(actor, secret_name, "write")
        owner_team = token(payload.get("owner_team", "platform"), "owner_team")
        key_id = token(payload.get("key_id", "platform-prod"), "key_id")
        active_key = self.get_active_key(key_id)
        value = text(payload.get("value"), "value")
        version = self.next_secret_version(secret_name)
        data_key = random_key()
        encrypted_data_key = encrypt_value(data_key, active_key["material"], f"data-key:{secret_name}:{version}")
        ciphertext = encrypt_value(value, data_key, f"secret:{secret_name}:{version}")
        timestamp = now_ts()
        if version == 1:
            self.conn.execute(
                """
                INSERT INTO secrets(
                    secret_name, owner_team, key_id, latest_version, status,
                    metadata_json, created_at, updated_at
                )
                VALUES (?, ?, ?, 1, 'ACTIVE', ?, ?, ?)
                """,
                (secret_name, owner_team, key_id, encode_json(metadata(payload.get("metadata"))), timestamp, timestamp),
            )
        else:
            self.conn.execute(
                """
                UPDATE secrets
                SET latest_version = ?, status = 'ACTIVE', metadata_json = ?, updated_at = ?
                WHERE secret_name = ?
                """,
                (version, encode_json(metadata(payload.get("metadata", self.get_secret(secret_name)["metadata"]))), timestamp, secret_name),
            )
        self.conn.execute(
            """
            INSERT INTO secret_versions(
                secret_name, version, key_id, key_version, encrypted_data_key,
                ciphertext, created_by, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (secret_name, version, key_id, active_key["version"], encrypted_data_key, ciphertext, actor, timestamp),
        )
        self.conn.commit()
        self.audit(actor, "write_secret", secret_name, True, f"Wrote {secret_name} v{version}.")
        return self.get_secret(secret_name)

    def read_secret(self, payload: dict[str, Any]) -> dict[str, Any]:
        identity = token(payload.get("identity"), "identity")
        secret_name = token(payload.get("secret_name"), "secret_name")
        version = payload.get("version")
        lease_seconds = int(payload.get("lease_seconds", 60))
        break_glass_request = payload.get("break_glass_request")
        allowed = False
        reason = "policy allowed"
        max_lease = 0
        try:
            max_lease = self.require_allowed(identity, secret_name, "read")
            allowed = True
        except ValueError as exc:
            if break_glass_request:
                self.consume_break_glass(str(break_glass_request), secret_name, identity)
                allowed = True
                max_lease = min(lease_seconds, 60)
                reason = "break-glass approved"
            else:
                self.audit(identity, "read_secret", secret_name, False, str(exc))
                raise
        secret = self.get_secret(secret_name)
        if secret["status"] == "REVOKED":
            self.audit(identity, "read_secret", secret_name, False, "secret is revoked")
            raise ValueError("secret is revoked")
        if lease_seconds < 1:
            raise ValueError("lease_seconds must be positive")
        lease_seconds = min(lease_seconds, max_lease)
        secret_version = self.get_secret_version(secret_name, int(version or secret["latest_version"]))
        value = self.decrypt_secret_version(secret_version)
        lease_id = hashlib.sha256(f"{identity}:{secret_name}:{secret_version['version']}:{time.time_ns()}".encode()).hexdigest()[:20]
        self.conn.execute(
            """
            INSERT INTO leases(lease_id, secret_name, version, identity, expires_at, revoked, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            """,
            (lease_id, secret_name, secret_version["version"], identity, now_ts() + lease_seconds, now_ts()),
        )
        self.conn.commit()
        self.audit(identity, "read_secret", secret_name, True, f"Issued lease {lease_id} for {lease_seconds}s via {reason}.")
        return {
            "secret_name": secret_name,
            "version": secret_version["version"],
            "value": value,
            "lease": self.get_lease(lease_id),
            "access": reason,
        }

    def revoke_secret(self, secret_name: str, actor: str) -> dict[str, Any]:
        secret_name = token(secret_name, "secret_name")
        actor = token(actor, "actor")
        self.require_allowed(actor, secret_name, "admin")
        self.conn.execute("UPDATE secrets SET status = 'REVOKED', updated_at = ? WHERE secret_name = ?", (now_ts(), secret_name))
        self.conn.execute("UPDATE leases SET revoked = 1 WHERE secret_name = ?", (secret_name,))
        self.conn.commit()
        self.audit(actor, "revoke_secret", secret_name, True, "Revoked secret and active leases.")
        return self.get_secret(secret_name)

    def upsert_policy(self, payload: dict[str, Any]) -> dict[str, Any]:
        policy_id = token(payload.get("policy_id"), "policy_id")
        secret_name = token(payload.get("secret_name"), "secret_name")
        self.get_secret(secret_name)
        identities = string_list(payload.get("identities"), "identities")
        actions = set(string_list(payload.get("actions"), "actions"))
        if not actions.issubset(ACTIONS):
            raise ValueError("actions must be read, write, rotate, or admin")
        max_lease = int(payload.get("max_lease_seconds", 60))
        if max_lease < 1 or max_lease > 86400:
            raise ValueError("max_lease_seconds must be between 1 and 86400")
        self.conn.execute(
            """
            INSERT INTO access_policies(policy_id, secret_name, identities_json, actions_json, max_lease_seconds, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(policy_id) DO UPDATE SET
                secret_name = excluded.secret_name,
                identities_json = excluded.identities_json,
                actions_json = excluded.actions_json,
                max_lease_seconds = excluded.max_lease_seconds,
                enabled = 1
            """,
            (policy_id, secret_name, encode_json(identities), encode_json(sorted(actions)), max_lease, now_ts()),
        )
        self.conn.commit()
        self.audit("policy-admin", "upsert_policy", secret_name, True, f"Upserted policy {policy_id}.")
        return self.get_policy(policy_id)

    def request_break_glass(self, payload: dict[str, Any]) -> dict[str, Any]:
        secret_name = token(payload.get("secret_name"), "secret_name")
        identity = token(payload.get("identity"), "identity")
        reason = text(payload.get("reason"), "reason", 500)
        self.get_secret(secret_name)
        request_id = hashlib.sha256(f"{secret_name}:{identity}:{time.time_ns()}".encode()).hexdigest()[:20]
        timestamp = now_ts()
        self.conn.execute(
            """
            INSERT INTO break_glass_requests(
                request_id, secret_name, identity, reason, status, approver, expires_at, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 'REQUESTED', '', 0, ?, ?)
            """,
            (request_id, secret_name, identity, reason, timestamp, timestamp),
        )
        self.conn.commit()
        self.audit(identity, "request_break_glass", secret_name, True, f"Requested break-glass access {request_id}.")
        return self.get_break_glass(request_id)

    def approve_break_glass(self, request_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        request_id = token(request_id, "request_id")
        approver = token(payload.get("approver"), "approver")
        ttl_seconds = int(payload.get("ttl_seconds", 300))
        if ttl_seconds < 1 or ttl_seconds > 3600:
            raise ValueError("ttl_seconds must be between 1 and 3600")
        request = self.get_break_glass(request_id)
        if request["status"] != "REQUESTED":
            raise ValueError("break-glass request is not requestable")
        self.conn.execute(
            """
            UPDATE break_glass_requests
            SET status = 'APPROVED', approver = ?, expires_at = ?, updated_at = ?
            WHERE request_id = ?
            """,
            (approver, now_ts() + ttl_seconds, now_ts(), request_id),
        )
        self.conn.commit()
        self.audit(approver, "approve_break_glass", request["secret_name"], True, f"Approved request {request_id}.")
        return self.get_break_glass(request_id)

    def consume_break_glass(self, request_id: str, secret_name: str, identity: str) -> None:
        request = self.get_break_glass(token(request_id, "request_id"))
        if request["secret_name"] != secret_name or request["identity"] != identity:
            raise ValueError("break-glass request does not match read request")
        if request["status"] != "APPROVED":
            raise ValueError("break-glass request is not approved")
        if request["expires_at"] < now_ts():
            raise ValueError("break-glass request expired")
        self.conn.execute(
            "UPDATE break_glass_requests SET status = 'USED', updated_at = ? WHERE request_id = ?",
            (now_ts(), request_id),
        )
        self.conn.commit()

    def require_allowed(self, identity: str, secret_name: str, action: str) -> int:
        identity = token(identity, "identity")
        secret_name = token(secret_name, "secret_name")
        action = token(action, "action")
        rows = self.conn.execute(
            "SELECT * FROM access_policies WHERE secret_name = ? AND enabled = 1",
            (secret_name,),
        ).fetchall()
        for row in rows:
            policy = policy_from_row(row)
            if ("*" in policy["identities"] or identity in policy["identities"]) and (
                action in policy["actions"] or "admin" in policy["actions"]
            ):
                return policy["max_lease_seconds"]
        raise ValueError(f"{identity} is not allowed to {action} {secret_name}")

    def decrypt_secret_version(self, version: dict[str, Any]) -> str:
        master = self.get_master_key_material(version["key_id"], version["key_version"])
        data_key = decrypt_value(version["encrypted_data_key"], master, f"data-key:{version['secret_name']}:{version['version']}")
        return decrypt_value(version["ciphertext"], data_key, f"secret:{version['secret_name']}:{version['version']}")

    def secret_exists(self, secret_name: str) -> bool:
        return self.conn.execute("SELECT 1 FROM secrets WHERE secret_name = ?", (secret_name,)).fetchone() is not None

    def next_secret_version(self, secret_name: str) -> int:
        row = self.conn.execute("SELECT latest_version FROM secrets WHERE secret_name = ?", (secret_name,)).fetchone()
        return 1 if row is None else int(row["latest_version"]) + 1

    def get_active_key(self, key_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT active_version FROM key_heads WHERE key_id = ?", (key_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown key: {key_id}")
        return self.get_master_key(key_id, row["active_version"])

    def get_master_key(self, key_id: str, version: int) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM master_keys WHERE key_id = ? AND version = ?", (key_id, int(version))).fetchone()
        if not row:
            raise ValueError(f"unknown key version: {key_id} v{version}")
        return key_from_row(row)

    def get_master_key_material(self, key_id: str, version: int) -> str:
        return self.get_master_key(key_id, version)["material"]

    def get_secret(self, secret_name: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM secrets WHERE secret_name = ?", (secret_name,)).fetchone()
        if not row:
            raise ValueError(f"unknown secret: {secret_name}")
        secret = secret_from_row(row)
        secret["versions"] = self.list_secret_versions(secret_name)
        return secret

    def get_secret_version(self, secret_name: str, version: int) -> dict[str, Any]:
        row = self.conn.execute(
            "SELECT * FROM secret_versions WHERE secret_name = ? AND version = ?",
            (secret_name, int(version)),
        ).fetchone()
        if not row:
            raise ValueError(f"unknown secret version: {secret_name} v{version}")
        return secret_version_from_row(row)

    def get_policy(self, policy_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM access_policies WHERE policy_id = ?", (policy_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown policy: {policy_id}")
        return policy_from_row(row)

    def get_lease(self, lease_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM leases WHERE lease_id = ?", (lease_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown lease: {lease_id}")
        return lease_from_row(row)

    def get_break_glass(self, request_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM break_glass_requests WHERE request_id = ?", (request_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown break-glass request: {request_id}")
        return break_glass_from_row(row)

    def list_keys(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM master_keys ORDER BY key_id, version").fetchall()
        return [redact_key(key_from_row(row)) for row in rows]

    def list_secrets(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM secrets ORDER BY secret_name").fetchall()
        return [self.get_secret(row["secret_name"]) for row in rows]

    def list_secret_versions(self, secret_name: str) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM secret_versions WHERE secret_name = ? ORDER BY version",
            (secret_name,),
        ).fetchall()
        versions = [secret_version_from_row(row) for row in rows]
        for item in versions:
            item.pop("encrypted_data_key", None)
            item.pop("ciphertext", None)
        return versions

    def list_policies(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM access_policies ORDER BY policy_id").fetchall()
        return [policy_from_row(row) for row in rows]

    def list_leases(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM leases ORDER BY created_at DESC, lease_id DESC").fetchall()
        return [lease_from_row(row) for row in rows]

    def list_break_glass(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM break_glass_requests ORDER BY created_at DESC").fetchall()
        return [break_glass_from_row(row) for row in rows]

    def audit(self, actor: str, action: str, resource: str, allowed: bool, message: str) -> None:
        self.conn.execute(
            "INSERT INTO audit_events(created_at, actor, action, resource, allowed, message) VALUES (?, ?, ?, ?, ?, ?)",
            (now_ts(), actor, action, resource, int(allowed), message),
        )
        self.conn.commit()

    def list_audits(self, limit: int = 30) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM audit_events ORDER BY audit_id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [audit_from_row(row) for row in rows]

    def snapshot(self) -> dict[str, Any]:
        secrets = self.list_secrets()
        leases = self.list_leases()
        active_leases = [lease for lease in leases if not lease["revoked"] and lease["expires_at"] > now_ts()]
        return {
            "key_count": len(self.list_keys()),
            "secret_count": len(secrets),
            "policy_count": len(self.list_policies()),
            "active_lease_count": len(active_leases),
            "keys": self.list_keys(),
            "secrets": secrets,
            "policies": self.list_policies(),
            "leases": leases,
            "break_glass_requests": self.list_break_glass(),
            "audit_events": self.list_audits(),
        }


def key_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "key_id": row["key_id"],
        "version": row["version"],
        "material": row["material"],
        "status": row["status"],
        "created_at": row["created_at"],
    }


def redact_key(key: dict[str, Any]) -> dict[str, Any]:
    item = dict(key)
    item["material"] = "redacted"
    return item


def secret_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "secret_name": row["secret_name"],
        "owner_team": row["owner_team"],
        "key_id": row["key_id"],
        "latest_version": row["latest_version"],
        "status": row["status"],
        "metadata": decode_json(row["metadata_json"], {}),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def secret_version_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "secret_name": row["secret_name"],
        "version": row["version"],
        "key_id": row["key_id"],
        "key_version": row["key_version"],
        "encrypted_data_key": row["encrypted_data_key"],
        "ciphertext": row["ciphertext"],
        "created_by": row["created_by"],
        "created_at": row["created_at"],
    }


def policy_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "policy_id": row["policy_id"],
        "secret_name": row["secret_name"],
        "identities": decode_json(row["identities_json"], []),
        "actions": decode_json(row["actions_json"], []),
        "max_lease_seconds": row["max_lease_seconds"],
        "enabled": bool(row["enabled"]),
        "created_at": row["created_at"],
    }


def lease_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "lease_id": row["lease_id"],
        "secret_name": row["secret_name"],
        "version": row["version"],
        "identity": row["identity"],
        "expires_at": row["expires_at"],
        "revoked": bool(row["revoked"]),
        "created_at": row["created_at"],
    }


def break_glass_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "request_id": row["request_id"],
        "secret_name": row["secret_name"],
        "identity": row["identity"],
        "reason": row["reason"],
        "status": row["status"],
        "approver": row["approver"],
        "expires_at": row["expires_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def audit_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "audit_id": row["audit_id"],
        "created_at": row["created_at"],
        "actor": row["actor"],
        "action": row["action"],
        "resource": row["resource"],
        "allowed": bool(row["allowed"]),
        "message": row["message"],
    }


def build_kms(db_path: Path | str) -> SecretsKMS:
    kms = SecretsKMS(db_path)
    kms.seed_if_empty()
    return kms


def demo(db_path: Path | str = ":memory:") -> dict[str, Any]:
    kms = build_kms(db_path)
    try:
        read = kms.read_secret(
            {
                "identity": "service:payments-api",
                "secret_name": "payments/stripe-api-key",
                "lease_seconds": 120,
            }
        )
        kms.put_secret(
            {
                "secret_name": "payments/stripe-api-key",
                "value": "sk_live_example_rotated",
                "created_by": "service:secrets-admin",
                "metadata": {"env": "prod", "rotation": "30d"},
            }
        )
        rotation = kms.rotate_master_key("platform-prod", "service:secrets-admin")
        denied = None
        try:
            kms.read_secret({"identity": "service:analytics", "secret_name": "payments/stripe-api-key"})
        except ValueError as exc:
            denied = str(exc)
        request = kms.request_break_glass(
            {
                "identity": "service:analytics",
                "secret_name": "payments/stripe-api-key",
                "reason": "Emergency payment reconciliation.",
            }
        )
        approved = kms.approve_break_glass(request["request_id"], {"approver": "security-admin", "ttl_seconds": 300})
        emergency = kms.read_secret(
            {
                "identity": "service:analytics",
                "secret_name": "payments/stripe-api-key",
                "break_glass_request": approved["request_id"],
            }
        )
        emergency["value"] = "redacted"
        read["value"] = "redacted"
        rotation["key"] = redact_key(rotation["key"])
        return {"read": read, "rotation": rotation, "denied": denied, "break_glass_read": emergency, "snapshot": kms.snapshot()}
    finally:
        kms.close()


class ApiHandler(BaseHTTPRequestHandler):
    kms: SecretsKMS

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.html(render_home(self.kms.snapshot()))
        elif parsed.path == "/health":
            self.json({"status": "ok"})
        elif parsed.path == "/snapshot":
            self.json(self.kms.snapshot())
        elif parsed.path == "/keys":
            self.json({"keys": self.kms.list_keys()})
        elif parsed.path == "/secrets":
            self.json({"secrets": self.kms.list_secrets()})
        elif parsed.path == "/policies":
            self.json({"policies": self.kms.list_policies()})
        elif parsed.path == "/leases":
            self.json({"leases": self.kms.list_leases()})
        elif parsed.path == "/audit":
            self.json({"audit_events": self.kms.list_audits(100)})
        elif parsed.path == "/break-glass":
            self.json({"break_glass_requests": self.kms.list_break_glass()})
        else:
            self.error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        try:
            payload = self.read_json()
            if parsed.path == "/keys":
                self.json(redact_key(self.kms.create_master_key(payload.get("key_id"), payload.get("actor", "api"))), HTTPStatus.CREATED)
            elif parsed.path.startswith("/keys/") and parsed.path.endswith("/rotate"):
                key_id = urllib.parse.unquote(parsed.path.split("/")[2])
                result = self.kms.rotate_master_key(key_id, payload.get("actor", "api"))
                result["key"] = redact_key(result["key"])
                self.json(result)
            elif parsed.path == "/secrets":
                self.json(self.kms.put_secret(payload), HTTPStatus.CREATED)
            elif parsed.path == "/secrets/read":
                result = self.kms.read_secret(payload)
                if not payload.get("reveal", False):
                    result["value"] = "redacted"
                self.json(result)
            elif parsed.path.startswith("/secrets/") and parsed.path.endswith("/revoke"):
                secret_name = urllib.parse.unquote(parsed.path.removeprefix("/secrets/").removesuffix("/revoke"))
                self.json(self.kms.revoke_secret(secret_name, payload.get("actor", "")))
            elif parsed.path == "/policies":
                self.json(self.kms.upsert_policy(payload), HTTPStatus.CREATED)
            elif parsed.path == "/break-glass":
                self.json(self.kms.request_break_glass(payload), HTTPStatus.CREATED)
            elif parsed.path.startswith("/break-glass/") and parsed.path.endswith("/approve"):
                request_id = urllib.parse.unquote(parsed.path.split("/")[2])
                self.json(self.kms.approve_break_glass(request_id, payload))
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
    secret_rows = "\n".join(
        f"""
        <tr>
          <td>{item['secret_name']}</td>
          <td>{item['owner_team']}</td>
          <td>{item['key_id']}</td>
          <td>{item['latest_version']}</td>
          <td><span class="{item['status'].lower()}">{item['status']}</span></td>
        </tr>
        """
        for item in snapshot["secrets"]
    )
    policy_rows = "\n".join(
        f"""
        <tr>
          <td>{item['policy_id']}</td>
          <td>{item['secret_name']}</td>
          <td>{', '.join(item['identities'])}</td>
          <td>{', '.join(item['actions'])}</td>
          <td>{item['max_lease_seconds']}s</td>
        </tr>
        """
        for item in snapshot["policies"]
    )
    audit_rows = "\n".join(
        f"""
        <tr>
          <td>#{item['audit_id']}</td>
          <td>{item['actor']}</td>
          <td>{item['action']}</td>
          <td>{item['resource']}</td>
          <td><span class="{'active' if item['allowed'] else 'revoked'}">{'allowed' if item['allowed'] else 'denied'}</span></td>
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
  <title>Secrets Management KMS POC</title>
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
    .active {{ color: #047857; font-weight: 700; }}
    .revoked {{ color: #b42318; font-weight: 700; }}
    @media (max-width: 760px) {{ .metrics {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
  </style>
</head>
<body>
  <header>
    <h1>Secrets Management KMS</h1>
    <p>Envelope encryption, key rotation, access policies, leases, revocation, break-glass access, and audit logs.</p>
  </header>
  <main>
    <div class="metrics">
      <div class="metric"><strong>{snapshot['key_count']}</strong><span>key versions</span></div>
      <div class="metric"><strong>{snapshot['secret_count']}</strong><span>secrets</span></div>
      <div class="metric"><strong>{snapshot['policy_count']}</strong><span>policies</span></div>
      <div class="metric"><strong>{snapshot['active_lease_count']}</strong><span>active leases</span></div>
    </div>
    <h2>Secrets</h2>
    <section><table><thead><tr><th>Name</th><th>Owner</th><th>Key</th><th>Version</th><th>Status</th></tr></thead><tbody>{secret_rows}</tbody></table></section>
    <h2>Access Policies</h2>
    <section><table><thead><tr><th>Policy</th><th>Secret</th><th>Identities</th><th>Actions</th><th>Max Lease</th></tr></thead><tbody>{policy_rows}</tbody></table></section>
    <h2>Audit Events</h2>
    <section><table><thead><tr><th>ID</th><th>Actor</th><th>Action</th><th>Resource</th><th>Result</th><th>Message</th></tr></thead><tbody>{audit_rows}</tbody></table></section>
  </main>
</body>
</html>"""


def serve(db_path: Path | str, host: str, port: int) -> None:
    kms = build_kms(db_path)
    ApiHandler.kms = kms
    server = HTTPServer((host, port), ApiHandler)
    print(f"Secrets Management KMS POC running at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        kms.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Secrets management and KMS POC")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("demo", help="Run a local demo flow")
    serve_parser = subcommands.add_parser("serve", help="Start HTTP server")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8167)
    args = parser.parse_args()

    if args.command == "demo":
        print(json.dumps(demo(args.db_path), indent=2, sort_keys=True))
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
