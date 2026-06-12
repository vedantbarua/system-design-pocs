"""Optional PostgreSQL, Redis, and MinIO infrastructure adapters."""

from __future__ import annotations

import json
import os
from io import BytesIO
from typing import Any


class Infrastructure:
    def __init__(self) -> None:
        self.mode = "memory"
        self.postgres: Any = None
        self.redis: Any = None
        self.minio: Any = None

    def connect(self) -> "Infrastructure":
        database_url = os.getenv("VAULT_DATABASE_URL", "memory://")
        redis_url = os.getenv("VAULT_REDIS_URL", "memory://")
        minio_endpoint = os.getenv("VAULT_MINIO_ENDPOINT", "memory://")
        if "memory://" in {database_url, redis_url, minio_endpoint}:
            return self
        try:
            import psycopg
            import redis
            from minio import Minio

            self.postgres = psycopg.connect(database_url, autocommit=True)
            self.postgres.execute(
                """
                CREATE TABLE IF NOT EXISTS document_vault_snapshots (
                    id TEXT PRIMARY KEY,
                    state JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            self.redis = redis.Redis.from_url(redis_url, decode_responses=True)
            self.redis.ping()
            self.minio = Minio(
                minio_endpoint,
                access_key=os.getenv("VAULT_MINIO_ACCESS_KEY", "minioadmin"),
                secret_key=os.getenv("VAULT_MINIO_SECRET_KEY", "minioadmin"),
                secure=os.getenv("VAULT_MINIO_SECURE", "false").lower() == "true",
            )
            bucket = os.getenv("VAULT_MINIO_BUCKET", "personal-documents")
            if not self.minio.bucket_exists(bucket):
                self.minio.make_bucket(bucket)
            self.mode = "postgres+redis+minio"
        except Exception as exc:
            print(f"Infrastructure unavailable ({exc}); using memory mode")
            self.close()
        return self

    def load(self) -> dict[str, Any] | None:
        if self.mode == "memory":
            return None
        row = self.postgres.execute(
            "SELECT state FROM document_vault_snapshots WHERE id = %s", ("demo",)
        ).fetchone()
        return row[0] if row else None

    def save(self, state: dict[str, Any]) -> None:
        if self.mode == "memory":
            return
        payload = json.dumps(state)
        self.postgres.execute(
            """
            INSERT INTO document_vault_snapshots (id, state, updated_at)
            VALUES (%s, %s::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
            """,
            ("demo", payload),
        )
        self.redis.setex("document-vault:snapshot", 300, payload)

    def put_object(self, object_key: str, content: bytes, content_type: str) -> None:
        if self.mode == "memory":
            return
        bucket = os.getenv("VAULT_MINIO_BUCKET", "personal-documents")
        self.minio.put_object(
            bucket,
            object_key,
            BytesIO(content),
            length=len(content),
            content_type=content_type,
        )

    def get_object(self, object_key: str) -> bytes | None:
        if self.mode == "memory":
            return None
        bucket = os.getenv("VAULT_MINIO_BUCKET", "personal-documents")
        response = self.minio.get_object(bucket, object_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def mirror_jobs(self, jobs: list[dict[str, Any]]) -> None:
        if self.mode == "memory":
            return
        key = "document-vault:jobs"
        self.redis.delete(key)
        for job in jobs:
            if job["status"] != "COMPLETED":
                self.redis.rpush(key, json.dumps(job))

    def close(self) -> None:
        for connection in (self.redis, self.postgres):
            try:
                if connection:
                    connection.close()
            except Exception:
                pass
        self.postgres = self.redis = self.minio = None
        self.mode = "memory"
