"""Optional PostgreSQL and Redis infrastructure adapters."""

from __future__ import annotations

import json
import os
from typing import Any


class Infrastructure:
    def __init__(self) -> None:
        self.mode = "memory"
        self.postgres: Any = None
        self.redis: Any = None

    def connect(self) -> "Infrastructure":
        database_url = os.getenv("SAFETY_DATABASE_URL", "memory://")
        redis_url = os.getenv("SAFETY_REDIS_URL", "memory://")
        if "memory://" in {database_url, redis_url}:
            return self
        try:
            import psycopg
            import redis

            self.postgres = psycopg.connect(database_url, autocommit=True)
            self.postgres.execute(
                """
                CREATE TABLE IF NOT EXISTS family_safety_snapshots (
                    id TEXT PRIMARY KEY,
                    state JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            self.redis = redis.Redis.from_url(redis_url, decode_responses=True)
            self.redis.ping()
            self.mode = "postgres+redis"
        except Exception as exc:
            print(f"Infrastructure unavailable ({exc}); using memory mode")
            self.close()
        return self

    def save(self, state: dict[str, Any]) -> None:
        if self.mode == "memory":
            return
        payload = json.dumps(state)
        self.postgres.execute(
            """
            INSERT INTO family_safety_snapshots (id, state, updated_at)
            VALUES (%s, %s::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
            """,
            ("demo", payload),
        )
        self.redis.setex("family-safety:snapshot", 300, payload)

    def mirror_jobs(self, jobs: list[dict[str, Any]]) -> None:
        if self.mode == "memory":
            return
        key = "family-safety:notification-jobs"
        self.redis.delete(key)
        for job in jobs:
            if job["status"] in {"READY", "RETRY"}:
                self.redis.rpush(key, json.dumps(job))

    def publish(self, event: dict[str, Any]) -> None:
        if self.mode != "memory":
            self.redis.publish("family-safety:events", json.dumps(event))

    def close(self) -> None:
        for connection in (self.redis, self.postgres):
            try:
                if connection:
                    connection.close()
            except Exception:
                pass
        self.postgres = self.redis = None
        self.mode = "memory"
