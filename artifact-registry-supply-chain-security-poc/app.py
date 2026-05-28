#!/usr/bin/env python3
"""Artifact registry and supply-chain security POC.

This app models build artifact trust: immutable digests, provenance, SBOMs,
signatures, vulnerability scan gates, environment promotion, deployment
admission checks, and audit history. It uses SQLite and Python's standard
library so it runs locally without external services.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
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
DEFAULT_DB_PATH = RUNTIME_DIR / "artifact_registry.db"
ENVIRONMENTS = {"dev", "staging", "prod"}
SCAN_STATUSES = {"PASS", "FAIL"}


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


def text(value: Any, field: str, max_len: int = 4000) -> str:
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


def list_of_dicts(value: Any, field: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ValueError(f"{field} must be a list of objects")
    return value


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sign_digest(digest: str, signer: str) -> str:
    key = hashlib.sha256(f"signing-key:{signer}".encode("utf-8")).digest()
    return hmac.new(key, digest.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_signature(digest: str, signer: str, signature: str) -> bool:
    return hmac.compare_digest(sign_digest(digest, signer), signature)


class ArtifactRegistry:
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
            CREATE TABLE IF NOT EXISTS artifacts (
                artifact_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                digest TEXT NOT NULL UNIQUE,
                artifact_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_by TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                metadata_json TEXT NOT NULL,
                UNIQUE(name, version)
            );

            CREATE TABLE IF NOT EXISTS provenance (
                digest TEXT PRIMARY KEY,
                builder TEXT NOT NULL,
                source_repo TEXT NOT NULL,
                commit_sha TEXT NOT NULL,
                workflow_id TEXT NOT NULL,
                build_started_at INTEGER NOT NULL,
                build_finished_at INTEGER NOT NULL,
                materials_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sboms (
                digest TEXT PRIMARY KEY,
                format TEXT NOT NULL,
                dependencies_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS signatures (
                signature_id INTEGER PRIMARY KEY AUTOINCREMENT,
                digest TEXT NOT NULL,
                signer TEXT NOT NULL,
                signature TEXT NOT NULL,
                verified INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(digest, signer)
            );

            CREATE TABLE IF NOT EXISTS scans (
                scan_id INTEGER PRIMARY KEY AUTOINCREMENT,
                digest TEXT NOT NULL,
                scanner TEXT NOT NULL,
                status TEXT NOT NULL,
                critical_count INTEGER NOT NULL,
                high_count INTEGER NOT NULL,
                medium_count INTEGER NOT NULL,
                findings_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS promotions (
                promotion_id INTEGER PRIMARY KEY AUTOINCREMENT,
                digest TEXT NOT NULL,
                environment TEXT NOT NULL,
                promoted_by TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(digest, environment)
            );

            CREATE TABLE IF NOT EXISTS admission_policies (
                environment TEXT PRIMARY KEY,
                require_signature INTEGER NOT NULL,
                require_provenance INTEGER NOT NULL,
                require_sbom INTEGER NOT NULL,
                require_passing_scan INTEGER NOT NULL,
                max_critical INTEGER NOT NULL,
                max_high INTEGER NOT NULL,
                required_promoted_from TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS admission_decisions (
                decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
                digest TEXT NOT NULL,
                environment TEXT NOT NULL,
                allowed INTEGER NOT NULL,
                reasons_json TEXT NOT NULL,
                requested_by TEXT NOT NULL,
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
        count = self.conn.execute("SELECT COUNT(*) AS count FROM artifacts").fetchone()["count"]
        if count:
            return
        self.upsert_admission_policy(
            {
                "environment": "dev",
                "require_signature": False,
                "require_provenance": True,
                "require_sbom": False,
                "require_passing_scan": False,
                "max_critical": 999,
                "max_high": 999,
                "required_promoted_from": "",
            }
        )
        self.upsert_admission_policy(
            {
                "environment": "staging",
                "require_signature": True,
                "require_provenance": True,
                "require_sbom": True,
                "require_passing_scan": True,
                "max_critical": 0,
                "max_high": 5,
                "required_promoted_from": "dev",
            }
        )
        self.upsert_admission_policy(
            {
                "environment": "prod",
                "require_signature": True,
                "require_provenance": True,
                "require_sbom": True,
                "require_passing_scan": True,
                "max_critical": 0,
                "max_high": 0,
                "required_promoted_from": "staging",
            }
        )
        artifact = self.publish_artifact(
            {
                "name": "checkout-api",
                "version": "1.0.0",
                "artifact_type": "container",
                "content": "checkout-api-image-v1",
                "created_by": "ci:checkout-main",
                "metadata": {"team": "orders", "image": "ghcr.io/acme/checkout-api:1.0.0"},
                "provenance": {
                    "builder": "github-actions",
                    "source_repo": "github.com/acme/checkout-api",
                    "commit_sha": "abc1234",
                    "workflow_id": "build-1001",
                    "materials": [{"name": "base-image", "digest": "sha256:base111"}],
                },
                "sbom": {
                    "format": "spdx-json",
                    "dependencies": [
                        {"name": "fastapi", "version": "0.115.0"},
                        {"name": "uvicorn", "version": "0.30.0"},
                    ],
                },
            }
        )
        self.sign_artifact(artifact["digest"], "ci:checkout-main")
        self.record_scan(
            {
                "digest": artifact["digest"],
                "scanner": "trivy",
                "status": "PASS",
                "critical_count": 0,
                "high_count": 0,
                "medium_count": 2,
                "findings": [{"severity": "MEDIUM", "package": "openssl", "cve": "CVE-demo"}],
            }
        )
        self.promote_artifact(artifact["digest"], "dev", "ci:checkout-main")
        self.promote_artifact(artifact["digest"], "staging", "release-manager")

    def publish_artifact(self, payload: dict[str, Any]) -> dict[str, Any]:
        name = token(payload.get("name"), "name")
        version = token(payload.get("version"), "version")
        artifact_type = token(payload.get("artifact_type", "container"), "artifact_type")
        content = text(payload.get("content"), "content")
        created_by = token(payload.get("created_by", "unknown"), "created_by")
        digest = "sha256:" + sha256_hex(encode_json({"name": name, "version": version, "content": content}))
        existing = self.conn.execute("SELECT * FROM artifacts WHERE name = ? AND version = ?", (name, version)).fetchone()
        if existing:
            if existing["digest"] != digest:
                self.audit(created_by, "publish_rejected", f"{name}:{version}", "Artifact version is immutable.")
                raise ValueError("artifact version already exists with a different digest")
            return self.get_artifact(digest)
        timestamp = now_ts()
        self.conn.execute(
            """
            INSERT INTO artifacts(name, version, digest, artifact_type, size_bytes, created_by, created_at, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (name, version, digest, artifact_type, len(content.encode("utf-8")), created_by, timestamp, encode_json(metadata(payload.get("metadata")))),
        )
        if payload.get("provenance"):
            self.attach_provenance(digest, payload["provenance"])
        if payload.get("sbom"):
            self.attach_sbom(digest, payload["sbom"])
        self.conn.commit()
        self.audit(created_by, "publish_artifact", digest, f"Published {name}:{version}.")
        return self.get_artifact(digest)

    def attach_provenance(self, digest: str, payload: dict[str, Any]) -> dict[str, Any]:
        digest = token(digest, "digest")
        self.require_artifact(digest)
        timestamp = now_ts()
        started = int(payload.get("build_started_at", timestamp - 30))
        finished = int(payload.get("build_finished_at", timestamp))
        self.conn.execute(
            """
            INSERT INTO provenance(
                digest, builder, source_repo, commit_sha, workflow_id,
                build_started_at, build_finished_at, materials_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(digest) DO UPDATE SET
                builder = excluded.builder,
                source_repo = excluded.source_repo,
                commit_sha = excluded.commit_sha,
                workflow_id = excluded.workflow_id,
                build_started_at = excluded.build_started_at,
                build_finished_at = excluded.build_finished_at,
                materials_json = excluded.materials_json
            """,
            (
                digest,
                token(payload.get("builder"), "builder"),
                token(payload.get("source_repo"), "source_repo", 220),
                token(payload.get("commit_sha"), "commit_sha", 80),
                token(payload.get("workflow_id"), "workflow_id"),
                started,
                finished,
                encode_json(list_of_dicts(payload.get("materials"), "materials")),
            ),
        )
        self.conn.commit()
        self.audit("provenance-writer", "attach_provenance", digest, "Attached build provenance.")
        return self.get_artifact(digest)["provenance"]

    def attach_sbom(self, digest: str, payload: dict[str, Any]) -> dict[str, Any]:
        digest = token(digest, "digest")
        self.require_artifact(digest)
        self.conn.execute(
            """
            INSERT INTO sboms(digest, format, dependencies_json, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(digest) DO UPDATE SET
                format = excluded.format,
                dependencies_json = excluded.dependencies_json,
                created_at = excluded.created_at
            """,
            (
                digest,
                token(payload.get("format", "spdx-json"), "format"),
                encode_json(list_of_dicts(payload.get("dependencies"), "dependencies")),
                now_ts(),
            ),
        )
        self.conn.commit()
        self.audit("sbom-writer", "attach_sbom", digest, "Attached SBOM.")
        return self.get_artifact(digest)["sbom"]

    def sign_artifact(self, digest: str, signer: str, signature: str | None = None) -> dict[str, Any]:
        digest = token(digest, "digest")
        signer = token(signer, "signer")
        self.require_artifact(digest)
        signature = signature or sign_digest(digest, signer)
        verified = verify_signature(digest, signer, signature)
        self.conn.execute(
            """
            INSERT INTO signatures(digest, signer, signature, verified, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(digest, signer) DO UPDATE SET
                signature = excluded.signature,
                verified = excluded.verified,
                created_at = excluded.created_at
            """,
            (digest, signer, signature, int(verified), now_ts()),
        )
        self.conn.commit()
        self.audit(signer, "sign_artifact", digest, f"Signature verification {'passed' if verified else 'failed'}.")
        return self.get_artifact(digest)["signatures"][-1]

    def record_scan(self, payload: dict[str, Any]) -> dict[str, Any]:
        digest = token(payload.get("digest"), "digest")
        self.require_artifact(digest)
        critical = int(payload.get("critical_count", 0))
        high = int(payload.get("high_count", 0))
        medium = int(payload.get("medium_count", 0))
        if critical < 0 or high < 0 or medium < 0:
            raise ValueError("scan counts cannot be negative")
        status = str(payload.get("status", "PASS")).upper()
        if status not in SCAN_STATUSES:
            raise ValueError("scan status must be PASS or FAIL")
        cursor = self.conn.execute(
            """
            INSERT INTO scans(digest, scanner, status, critical_count, high_count, medium_count, findings_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                digest,
                token(payload.get("scanner", "scanner"), "scanner"),
                status,
                critical,
                high,
                medium,
                encode_json(list_of_dicts(payload.get("findings"), "findings")),
                now_ts(),
            ),
        )
        self.conn.commit()
        self.audit("scanner", "record_scan", digest, f"Recorded {status} scan #{cursor.lastrowid}.")
        return self.get_scan(int(cursor.lastrowid))

    def promote_artifact(self, digest: str, environment: str, actor: str) -> dict[str, Any]:
        digest = token(digest, "digest")
        environment = normalize_environment(environment)
        actor = token(actor, "actor")
        self.require_artifact(digest)
        if environment != "dev":
            decision = self.admit_deployment({"digest": digest, "environment": environment, "requested_by": actor, "dry_run": True})
            if not decision["allowed"]:
                self.audit(actor, "promote_rejected", digest, f"Rejected promotion to {environment}: {'; '.join(decision['reasons'])}")
                raise ValueError("promotion rejected: " + "; ".join(decision["reasons"]))
        self.conn.execute(
            """
            INSERT INTO promotions(digest, environment, promoted_by, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(digest, environment) DO UPDATE SET
                promoted_by = excluded.promoted_by,
                created_at = excluded.created_at
            """,
            (digest, environment, actor, now_ts()),
        )
        self.conn.commit()
        self.audit(actor, "promote_artifact", digest, f"Promoted to {environment}.")
        return self.get_artifact(digest)

    def admit_deployment(self, payload: dict[str, Any]) -> dict[str, Any]:
        digest = token(payload.get("digest"), "digest")
        environment = normalize_environment(payload.get("environment"))
        requested_by = token(payload.get("requested_by", "unknown"), "requested_by")
        dry_run = bool(payload.get("dry_run", False))
        artifact = self.get_artifact(digest)
        policy = self.get_admission_policy(environment)
        reasons: list[str] = []
        if policy["require_signature"] and not any(sig["verified"] for sig in artifact["signatures"]):
            reasons.append("verified signature required")
        if policy["require_provenance"] and not artifact["provenance"]:
            reasons.append("build provenance required")
        if policy["require_sbom"] and not artifact["sbom"]:
            reasons.append("SBOM required")
        latest_scan = artifact["latest_scan"]
        if policy["require_passing_scan"] and not latest_scan:
            reasons.append("passing vulnerability scan required")
        if latest_scan:
            if policy["require_passing_scan"] and latest_scan["status"] != "PASS":
                reasons.append("latest vulnerability scan failed")
            if latest_scan["critical_count"] > policy["max_critical"]:
                reasons.append(f"critical vulnerabilities exceed limit {policy['max_critical']}")
            if latest_scan["high_count"] > policy["max_high"]:
                reasons.append(f"high vulnerabilities exceed limit {policy['max_high']}")
        if policy["required_promoted_from"] and not self.has_promotion(digest, policy["required_promoted_from"]):
            reasons.append(f"artifact must be promoted from {policy['required_promoted_from']}")
        allowed = not reasons
        decision = {
            "digest": digest,
            "environment": environment,
            "allowed": allowed,
            "reasons": reasons or ["policy checks passed"],
            "requested_by": requested_by,
            "dry_run": dry_run,
        }
        if not dry_run:
            self.conn.execute(
                """
                INSERT INTO admission_decisions(digest, environment, allowed, reasons_json, requested_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (digest, environment, int(allowed), encode_json(decision["reasons"]), requested_by, now_ts()),
            )
            self.conn.commit()
            self.audit(requested_by, "admission_check", digest, f"{'Allowed' if allowed else 'Rejected'} deploy to {environment}.")
        return decision

    def upsert_admission_policy(self, payload: dict[str, Any]) -> dict[str, Any]:
        environment = normalize_environment(payload.get("environment"))
        required_from = str(payload.get("required_promoted_from", "")).strip()
        if required_from:
            required_from = normalize_environment(required_from)
        self.conn.execute(
            """
            INSERT INTO admission_policies(
                environment, require_signature, require_provenance, require_sbom,
                require_passing_scan, max_critical, max_high, required_promoted_from, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(environment) DO UPDATE SET
                require_signature = excluded.require_signature,
                require_provenance = excluded.require_provenance,
                require_sbom = excluded.require_sbom,
                require_passing_scan = excluded.require_passing_scan,
                max_critical = excluded.max_critical,
                max_high = excluded.max_high,
                required_promoted_from = excluded.required_promoted_from,
                updated_at = excluded.updated_at
            """,
            (
                environment,
                int(bool(payload.get("require_signature", True))),
                int(bool(payload.get("require_provenance", True))),
                int(bool(payload.get("require_sbom", True))),
                int(bool(payload.get("require_passing_scan", True))),
                int(payload.get("max_critical", 0)),
                int(payload.get("max_high", 0)),
                required_from,
                now_ts(),
            ),
        )
        self.conn.commit()
        self.audit("policy-admin", "upsert_admission_policy", environment, "Updated admission policy.")
        return self.get_admission_policy(environment)

    def has_promotion(self, digest: str, environment: str) -> bool:
        return self.conn.execute(
            "SELECT 1 FROM promotions WHERE digest = ? AND environment = ?",
            (digest, environment),
        ).fetchone() is not None

    def require_artifact(self, digest: str) -> sqlite3.Row:
        row = self.conn.execute("SELECT * FROM artifacts WHERE digest = ?", (digest,)).fetchone()
        if not row:
            raise ValueError(f"unknown artifact digest: {digest}")
        return row

    def get_artifact(self, digest: str) -> dict[str, Any]:
        artifact = artifact_from_row(self.require_artifact(digest))
        artifact["provenance"] = self.get_provenance(digest)
        artifact["sbom"] = self.get_sbom(digest)
        artifact["signatures"] = self.list_signatures(digest)
        artifact["scans"] = self.list_scans(digest)
        artifact["latest_scan"] = artifact["scans"][0] if artifact["scans"] else None
        artifact["promotions"] = self.list_promotions(digest)
        return artifact

    def get_scan(self, scan_id: int) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM scans WHERE scan_id = ?", (scan_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown scan: {scan_id}")
        return scan_from_row(row)

    def get_provenance(self, digest: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM provenance WHERE digest = ?", (digest,)).fetchone()
        return provenance_from_row(row) if row else None

    def get_sbom(self, digest: str) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM sboms WHERE digest = ?", (digest,)).fetchone()
        return sbom_from_row(row) if row else None

    def list_signatures(self, digest: str) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM signatures WHERE digest = ? ORDER BY created_at DESC", (digest,)).fetchall()
        return [signature_from_row(row) for row in rows]

    def list_scans(self, digest: str) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM scans WHERE digest = ? ORDER BY created_at DESC, scan_id DESC", (digest,)).fetchall()
        return [scan_from_row(row) for row in rows]

    def list_promotions(self, digest: str) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM promotions WHERE digest = ? ORDER BY created_at", (digest,)).fetchall()
        return [promotion_from_row(row) for row in rows]

    def list_artifacts(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM artifacts ORDER BY created_at DESC, artifact_id DESC").fetchall()
        return [self.get_artifact(row["digest"]) for row in rows]

    def get_admission_policy(self, environment: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM admission_policies WHERE environment = ?", (environment,)).fetchone()
        if not row:
            raise ValueError(f"missing admission policy for {environment}")
        return admission_policy_from_row(row)

    def list_admission_policies(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM admission_policies ORDER BY environment").fetchall()
        return [admission_policy_from_row(row) for row in rows]

    def list_decisions(self, limit: int = 25) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM admission_decisions ORDER BY decision_id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [decision_from_row(row) for row in rows]

    def audit(self, actor: str, action: str, resource: str, message: str) -> None:
        self.conn.execute(
            "INSERT INTO audit_events(created_at, actor, action, resource, message) VALUES (?, ?, ?, ?, ?)",
            (now_ts(), actor, action, resource, message),
        )
        self.conn.commit()

    def list_audits(self, limit: int = 30) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM audit_events ORDER BY audit_id DESC LIMIT ?", (limit,)).fetchall()
        return [audit_from_row(row) for row in rows]

    def snapshot(self) -> dict[str, Any]:
        artifacts = self.list_artifacts()
        signed = [item for item in artifacts if any(sig["verified"] for sig in item["signatures"])]
        passing = [item for item in artifacts if item["latest_scan"] and item["latest_scan"]["status"] == "PASS"]
        return {
            "artifact_count": len(artifacts),
            "signed_artifact_count": len(signed),
            "passing_scan_count": len(passing),
            "policy_count": len(self.list_admission_policies()),
            "artifacts": artifacts,
            "admission_policies": self.list_admission_policies(),
            "admission_decisions": self.list_decisions(),
            "audit_events": self.list_audits(),
        }


def normalize_environment(value: Any) -> str:
    environment = token(value, "environment").lower()
    if environment not in ENVIRONMENTS:
        raise ValueError("environment must be dev, staging, or prod")
    return environment


def artifact_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "artifact_id": row["artifact_id"],
        "name": row["name"],
        "version": row["version"],
        "digest": row["digest"],
        "artifact_type": row["artifact_type"],
        "size_bytes": row["size_bytes"],
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "metadata": decode_json(row["metadata_json"], {}),
    }


def provenance_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "digest": row["digest"],
        "builder": row["builder"],
        "source_repo": row["source_repo"],
        "commit_sha": row["commit_sha"],
        "workflow_id": row["workflow_id"],
        "build_started_at": row["build_started_at"],
        "build_finished_at": row["build_finished_at"],
        "materials": decode_json(row["materials_json"], []),
    }


def sbom_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "digest": row["digest"],
        "format": row["format"],
        "dependencies": decode_json(row["dependencies_json"], []),
        "created_at": row["created_at"],
    }


def signature_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "signature_id": row["signature_id"],
        "digest": row["digest"],
        "signer": row["signer"],
        "signature": row["signature"],
        "verified": bool(row["verified"]),
        "created_at": row["created_at"],
    }


def scan_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "scan_id": row["scan_id"],
        "digest": row["digest"],
        "scanner": row["scanner"],
        "status": row["status"],
        "critical_count": row["critical_count"],
        "high_count": row["high_count"],
        "medium_count": row["medium_count"],
        "findings": decode_json(row["findings_json"], []),
        "created_at": row["created_at"],
    }


def promotion_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "promotion_id": row["promotion_id"],
        "digest": row["digest"],
        "environment": row["environment"],
        "promoted_by": row["promoted_by"],
        "created_at": row["created_at"],
    }


def admission_policy_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "environment": row["environment"],
        "require_signature": bool(row["require_signature"]),
        "require_provenance": bool(row["require_provenance"]),
        "require_sbom": bool(row["require_sbom"]),
        "require_passing_scan": bool(row["require_passing_scan"]),
        "max_critical": row["max_critical"],
        "max_high": row["max_high"],
        "required_promoted_from": row["required_promoted_from"],
        "updated_at": row["updated_at"],
    }


def decision_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "decision_id": row["decision_id"],
        "digest": row["digest"],
        "environment": row["environment"],
        "allowed": bool(row["allowed"]),
        "reasons": decode_json(row["reasons_json"], []),
        "requested_by": row["requested_by"],
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


def build_registry(db_path: Path | str) -> ArtifactRegistry:
    registry = ArtifactRegistry(db_path)
    registry.seed_if_empty()
    return registry


def demo(db_path: Path | str = ":memory:") -> dict[str, Any]:
    registry = build_registry(db_path)
    seeded = registry.list_artifacts()[0]
    seeded_prod_allowed = registry.admit_deployment(
        {"digest": seeded["digest"], "environment": "prod", "requested_by": "deploy-bot"}
    )
    candidate = registry.publish_artifact(
        {
            "name": "checkout-api",
            "version": "1.1.0",
            "artifact_type": "container",
            "content": "checkout-api-image-v1.1",
            "created_by": "ci:checkout-main",
            "provenance": {
                "builder": "github-actions",
                "source_repo": "github.com/acme/checkout-api",
                "commit_sha": "def5678",
                "workflow_id": "build-1002",
                "materials": [],
            },
            "sbom": {"format": "spdx-json", "dependencies": [{"name": "fastapi", "version": "0.115.0"}]},
        }
    )
    registry.sign_artifact(candidate["digest"], "ci:checkout-main")
    registry.record_scan(
        {
            "digest": candidate["digest"],
            "scanner": "trivy",
            "status": "PASS",
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 1,
            "findings": [],
        }
    )
    registry.promote_artifact(candidate["digest"], "dev", "release-manager")
    prod_denied_missing_staging = registry.admit_deployment(
        {"digest": candidate["digest"], "environment": "prod", "requested_by": "deploy-bot"}
    )
    registry.promote_artifact(candidate["digest"], "staging", "release-manager")
    prod_allowed_after_staging = registry.admit_deployment(
        {"digest": candidate["digest"], "environment": "prod", "requested_by": "deploy-bot"}
    )
    unsigned = registry.publish_artifact(
        {
            "name": "checkout-api",
            "version": "1.2.0",
            "artifact_type": "container",
            "content": "checkout-api-image-v1.2",
            "created_by": "ci:checkout-main",
            "provenance": {
                "builder": "github-actions",
                "source_repo": "github.com/acme/checkout-api",
                "commit_sha": "ghi9012",
                "workflow_id": "build-1003",
                "materials": [],
            },
        }
    )
    unsigned_denied = registry.admit_deployment(
        {"digest": unsigned["digest"], "environment": "staging", "requested_by": "deploy-bot"}
    )
    return {
        "seeded_prod_allowed": seeded_prod_allowed,
        "prod_denied_missing_staging": prod_denied_missing_staging,
        "prod_allowed_after_staging": prod_allowed_after_staging,
        "unsigned_denied": unsigned_denied,
        "snapshot": registry.snapshot(),
    }


class ApiHandler(BaseHTTPRequestHandler):
    registry: ArtifactRegistry

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.html(render_home(self.registry.snapshot()))
        elif parsed.path == "/health":
            self.json({"status": "ok"})
        elif parsed.path == "/snapshot":
            self.json(self.registry.snapshot())
        elif parsed.path == "/artifacts":
            self.json({"artifacts": self.registry.list_artifacts()})
        elif parsed.path == "/policies":
            self.json({"admission_policies": self.registry.list_admission_policies()})
        elif parsed.path == "/decisions":
            self.json({"admission_decisions": self.registry.list_decisions(100)})
        elif parsed.path == "/audit":
            self.json({"audit_events": self.registry.list_audits(100)})
        else:
            self.error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        try:
            payload = self.read_json()
            if parsed.path == "/artifacts":
                self.json(self.registry.publish_artifact(payload), HTTPStatus.CREATED)
            elif parsed.path == "/signatures":
                self.json(self.registry.sign_artifact(payload.get("digest"), payload.get("signer"), payload.get("signature")), HTTPStatus.CREATED)
            elif parsed.path == "/scans":
                self.json(self.registry.record_scan(payload), HTTPStatus.CREATED)
            elif parsed.path == "/admission/check":
                self.json(self.registry.admit_deployment(payload))
            elif parsed.path == "/policies":
                self.json(self.registry.upsert_admission_policy(payload), HTTPStatus.CREATED)
            elif parsed.path.startswith("/artifacts/") and "/promote/" in parsed.path:
                remainder = parsed.path.removeprefix("/artifacts/")
                digest, environment = remainder.split("/promote/", 1)
                self.json(self.registry.promote_artifact(urllib.parse.unquote(digest), urllib.parse.unquote(environment), payload.get("actor", "api")))
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
    artifact_rows = "\n".join(
        f"""
        <tr>
          <td>{item['name']}:{item['version']}</td>
          <td>{item['digest'][:24]}...</td>
          <td>{'yes' if item['signatures'] and any(sig['verified'] for sig in item['signatures']) else 'no'}</td>
          <td>{item['latest_scan']['status'] if item['latest_scan'] else 'none'}</td>
          <td>{', '.join(promo['environment'] for promo in item['promotions']) or '-'}</td>
        </tr>
        """
        for item in snapshot["artifacts"]
    )
    decision_rows = "\n".join(
        f"""
        <tr>
          <td>#{item['decision_id']}</td>
          <td>{item['environment']}</td>
          <td><span class="{'allow' if item['allowed'] else 'deny'}">{'allow' if item['allowed'] else 'deny'}</span></td>
          <td>{'; '.join(item['reasons'])}</td>
          <td>{item['requested_by']}</td>
        </tr>
        """
        for item in snapshot["admission_decisions"]
    )
    audit_rows = "\n".join(
        f"""
        <tr>
          <td>#{item['audit_id']}</td>
          <td>{item['actor']}</td>
          <td>{item['action']}</td>
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
  <title>Artifact Registry Supply Chain Security POC</title>
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
    .allow {{ color: #047857; font-weight: 700; }}
    .deny {{ color: #b42318; font-weight: 700; }}
    @media (max-width: 760px) {{ .metrics {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
  </style>
</head>
<body>
  <header>
    <h1>Artifact Registry Supply Chain Security</h1>
    <p>Immutable artifacts, provenance, SBOMs, signatures, vulnerability scans, promotions, admission gates, and audits.</p>
  </header>
  <main>
    <div class="metrics">
      <div class="metric"><strong>{snapshot['artifact_count']}</strong><span>artifacts</span></div>
      <div class="metric"><strong>{snapshot['signed_artifact_count']}</strong><span>signed</span></div>
      <div class="metric"><strong>{snapshot['passing_scan_count']}</strong><span>passing scans</span></div>
      <div class="metric"><strong>{snapshot['policy_count']}</strong><span>policies</span></div>
    </div>
    <h2>Artifacts</h2>
    <section><table><thead><tr><th>Artifact</th><th>Digest</th><th>Signed</th><th>Scan</th><th>Promotions</th></tr></thead><tbody>{artifact_rows}</tbody></table></section>
    <h2>Admission Decisions</h2>
    <section><table><thead><tr><th>ID</th><th>Env</th><th>Decision</th><th>Reasons</th><th>Requested By</th></tr></thead><tbody>{decision_rows or '<tr><td colspan="5">No deploy checks yet.</td></tr>'}</tbody></table></section>
    <h2>Audit</h2>
    <section><table><thead><tr><th>ID</th><th>Actor</th><th>Action</th><th>Message</th></tr></thead><tbody>{audit_rows}</tbody></table></section>
  </main>
</body>
</html>"""


def serve(db_path: Path | str, host: str, port: int) -> None:
    registry = build_registry(db_path)
    ApiHandler.registry = registry
    server = HTTPServer((host, port), ApiHandler)
    print(f"Artifact Registry Supply Chain Security POC running at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        registry.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Artifact registry supply-chain security POC")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("demo", help="Run a local demo flow")
    serve_parser = subcommands.add_parser("serve", help="Start HTTP server")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8168)
    args = parser.parse_args()

    if args.command == "demo":
        print(json.dumps(demo(args.db_path), indent=2, sort_keys=True))
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
