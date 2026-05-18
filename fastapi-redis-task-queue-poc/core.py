"""Core Redis-backed task queue logic for the FastAPI Redis POC.

The service is written against a small Redis protocol so unit tests can use the
in-memory adapter while the FastAPI app uses redis-py against a real Redis.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from fnmatch import fnmatch
from threading import Lock
from typing import Any, Protocol


READY_QUEUE = "queue:ready"
DELAYED_ZSET = "queue:delayed"
PROCESSING_ZSET = "queue:processing"
COMPLETED_ZSET = "queue:completed"
FAILED_ZSET = "queue:failed"
JOB_KEY_PREFIX = "job:"
IDEMPOTENCY_PREFIX = "idempotency:"
RATE_LIMIT_PREFIX = "rate:"
DEFAULT_RATE_LIMIT = 3
DEFAULT_RATE_WINDOW_SECONDS = 60
DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 30
MAX_RECENT_ITEMS = 25


class RedisLike(Protocol):
    def hset(self, name: str, mapping: dict[str, str]) -> int: ...
    def hgetall(self, name: str) -> dict[str, str]: ...
    def get(self, name: str) -> str | None: ...
    def set(self, name: str, value: str, ex: int | None = None, nx: bool = False) -> bool: ...
    def incr(self, name: str) -> int: ...
    def expire(self, name: str, seconds: int) -> bool: ...
    def ttl(self, name: str) -> int: ...
    def delete(self, *names: str) -> int: ...
    def lpush(self, name: str, *values: str) -> int: ...
    def rpush(self, name: str, *values: str) -> int: ...
    def lpop(self, name: str) -> str | None: ...
    def lrange(self, name: str, start: int, end: int) -> list[str]: ...
    def llen(self, name: str) -> int: ...
    def zadd(self, name: str, mapping: dict[str, float]) -> int: ...
    def zrem(self, name: str, *members: str) -> int: ...
    def zrange(self, name: str, start: int, end: int, withscores: bool = False) -> list[Any]: ...
    def zrangebyscore(self, name: str, min_score: float, max_score: float) -> list[str]: ...
    def zcard(self, name: str) -> int: ...
    def keys(self, pattern: str) -> list[str]: ...


class MemoryRedis:
    """Small Redis subset for deterministic tests and no-Redis local demos."""

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}
        self._types: dict[str, str] = {}
        self._expires: dict[str, float] = {}
        self._lock = Lock()

    def _purge(self, name: str) -> None:
        expires_at = self._expires.get(name)
        if expires_at is not None and expires_at <= time.time():
            self._data.pop(name, None)
            self._types.pop(name, None)
            self._expires.pop(name, None)

    def _ensure(self, name: str, kind: str, default: Any) -> Any:
        self._purge(name)
        if name not in self._data:
            self._data[name] = default
            self._types[name] = kind
        if self._types.get(name) != kind:
            raise TypeError(f"{name} is not a {kind}")
        return self._data[name]

    def hset(self, name: str, mapping: dict[str, str]) -> int:
        with self._lock:
            target = self._ensure(name, "hash", {})
            target.update(mapping)
            return len(mapping)

    def hgetall(self, name: str) -> dict[str, str]:
        with self._lock:
            self._purge(name)
            return dict(self._data.get(name, {}))

    def get(self, name: str) -> str | None:
        with self._lock:
            self._purge(name)
            value = self._data.get(name)
            return None if value is None else str(value)

    def set(self, name: str, value: str, ex: int | None = None, nx: bool = False) -> bool:
        with self._lock:
            self._purge(name)
            if nx and name in self._data:
                return False
            self._data[name] = str(value)
            self._types[name] = "string"
            if ex is not None:
                self._expires[name] = time.time() + ex
            return True

    def incr(self, name: str) -> int:
        with self._lock:
            self._purge(name)
            current = int(self._data.get(name, "0")) + 1
            self._data[name] = str(current)
            self._types[name] = "string"
            return current

    def expire(self, name: str, seconds: int) -> bool:
        with self._lock:
            self._purge(name)
            if name not in self._data:
                return False
            self._expires[name] = time.time() + seconds
            return True

    def ttl(self, name: str) -> int:
        with self._lock:
            self._purge(name)
            if name not in self._data:
                return -2
            expires_at = self._expires.get(name)
            if expires_at is None:
                return -1
            return max(0, int(expires_at - time.time()))

    def delete(self, *names: str) -> int:
        removed = 0
        with self._lock:
            for name in names:
                if name in self._data:
                    removed += 1
                self._data.pop(name, None)
                self._types.pop(name, None)
                self._expires.pop(name, None)
        return removed

    def lpush(self, name: str, *values: str) -> int:
        with self._lock:
            target = self._ensure(name, "list", [])
            for value in values:
                target.insert(0, value)
            return len(target)

    def rpush(self, name: str, *values: str) -> int:
        with self._lock:
            target = self._ensure(name, "list", [])
            target.extend(values)
            return len(target)

    def lpop(self, name: str) -> str | None:
        with self._lock:
            target = self._ensure(name, "list", [])
            if not target:
                return None
            return target.pop(0)

    def lrange(self, name: str, start: int, end: int) -> list[str]:
        with self._lock:
            target = self._ensure(name, "list", [])
            resolved_end = None if end == -1 else end + 1
            return list(target[start:resolved_end])

    def llen(self, name: str) -> int:
        with self._lock:
            return len(self._ensure(name, "list", []))

    def zadd(self, name: str, mapping: dict[str, float]) -> int:
        with self._lock:
            target = self._ensure(name, "zset", {})
            added = 0
            for member, score in mapping.items():
                if member not in target:
                    added += 1
                target[member] = float(score)
            return added

    def zrem(self, name: str, *members: str) -> int:
        with self._lock:
            target = self._ensure(name, "zset", {})
            removed = 0
            for member in members:
                if member in target:
                    removed += 1
                    del target[member]
            return removed

    def zrange(self, name: str, start: int, end: int, withscores: bool = False) -> list[Any]:
        with self._lock:
            target = self._ensure(name, "zset", {})
            items = sorted(target.items(), key=lambda item: (item[1], item[0]))
            resolved_end = None if end == -1 else end + 1
            sliced = items[start:resolved_end]
            if withscores:
                return [(member, score) for member, score in sliced]
            return [member for member, _ in sliced]

    def zrangebyscore(self, name: str, min_score: float, max_score: float) -> list[str]:
        with self._lock:
            target = self._ensure(name, "zset", {})
            return [
                member
                for member, score in sorted(target.items(), key=lambda item: (item[1], item[0]))
                if float(min_score) <= score <= float(max_score)
            ]

    def zcard(self, name: str) -> int:
        with self._lock:
            return len(self._ensure(name, "zset", {}))

    def keys(self, pattern: str) -> list[str]:
        with self._lock:
            for name in list(self._data):
                self._purge(name)
            return sorted(name for name in self._data if fnmatch(name, pattern))


class RedisPyAdapter:
    """Adapter around redis-py using decoded string responses."""

    def __init__(self, redis_client: Any) -> None:
        self.client = redis_client

    def hset(self, name: str, mapping: dict[str, str]) -> int:
        return int(self.client.hset(name, mapping=mapping))

    def hgetall(self, name: str) -> dict[str, str]:
        return dict(self.client.hgetall(name))

    def get(self, name: str) -> str | None:
        return self.client.get(name)

    def set(self, name: str, value: str, ex: int | None = None, nx: bool = False) -> bool:
        return bool(self.client.set(name, value, ex=ex, nx=nx))

    def incr(self, name: str) -> int:
        return int(self.client.incr(name))

    def expire(self, name: str, seconds: int) -> bool:
        return bool(self.client.expire(name, seconds))

    def ttl(self, name: str) -> int:
        return int(self.client.ttl(name))

    def delete(self, *names: str) -> int:
        return int(self.client.delete(*names))

    def lpush(self, name: str, *values: str) -> int:
        return int(self.client.lpush(name, *values))

    def rpush(self, name: str, *values: str) -> int:
        return int(self.client.rpush(name, *values))

    def lpop(self, name: str) -> str | None:
        return self.client.lpop(name)

    def lrange(self, name: str, start: int, end: int) -> list[str]:
        return list(self.client.lrange(name, start, end))

    def llen(self, name: str) -> int:
        return int(self.client.llen(name))

    def zadd(self, name: str, mapping: dict[str, float]) -> int:
        return int(self.client.zadd(name, mapping))

    def zrem(self, name: str, *members: str) -> int:
        return int(self.client.zrem(name, *members))

    def zrange(self, name: str, start: int, end: int, withscores: bool = False) -> list[Any]:
        return list(self.client.zrange(name, start, end, withscores=withscores))

    def zrangebyscore(self, name: str, min_score: float, max_score: float) -> list[str]:
        return list(self.client.zrangebyscore(name, min_score, max_score))

    def zcard(self, name: str) -> int:
        return int(self.client.zcard(name))

    def keys(self, pattern: str) -> list[str]:
        return list(self.client.keys(pattern))


@dataclass(frozen=True)
class QueueConfig:
    rate_limit: int = DEFAULT_RATE_LIMIT
    rate_window_seconds: int = DEFAULT_RATE_WINDOW_SECONDS
    visibility_timeout_seconds: int = DEFAULT_VISIBILITY_TIMEOUT_SECONDS
    max_attempts: int = 3
    base_retry_delay_seconds: int = 5
    idempotency_ttl_seconds: int = 3600


class TaskQueueService:
    def __init__(self, redis_client: RedisLike, config: QueueConfig | None = None) -> None:
        self.redis = redis_client
        self.config = config or QueueConfig()

    def submit_job(
        self,
        tenant_id: str,
        task_type: str,
        payload: dict[str, Any],
        idempotency_key: str | None = None,
        delay_seconds: int = 0,
    ) -> dict[str, Any]:
        tenant = normalize_id(tenant_id, "tenant_id")
        task = normalize_id(task_type, "task_type")
        dedupe_key = normalize_optional(idempotency_key, "idempotency_key")
        if dedupe_key:
            existing = self.redis.get(IDEMPOTENCY_PREFIX + dedupe_key)
            if existing:
                return self.get_job(existing) | {"idempotent_replay": True}

        job_id = "job-" + uuid.uuid4().hex[:12]
        now = now_ms()
        job = {
            "job_id": job_id,
            "tenant_id": tenant,
            "task_type": task,
            "payload": json.dumps(payload, sort_keys=True),
            "status": "queued" if delay_seconds <= 0 else "delayed",
            "attempts": "0",
            "max_attempts": str(self.config.max_attempts),
            "created_at": str(now),
            "updated_at": str(now),
            "available_at": str(now + max(0, delay_seconds) * 1000),
            "idempotency_key": dedupe_key or "",
            "last_error": "",
        }
        self.redis.hset(JOB_KEY_PREFIX + job_id, job)
        if delay_seconds > 0:
            self.redis.zadd(DELAYED_ZSET, {job_id: now + delay_seconds * 1000})
        else:
            self.redis.rpush(READY_QUEUE, job_id)
        if dedupe_key:
            self.redis.set(IDEMPOTENCY_PREFIX + dedupe_key, job_id, ex=self.config.idempotency_ttl_seconds, nx=False)
        return self.get_job(job_id)

    def get_job(self, job_id: str) -> dict[str, Any]:
        job = self.redis.hgetall(JOB_KEY_PREFIX + normalize_id(job_id, "job_id"))
        if not job:
            raise ValueError(f"unknown job: {job_id}")
        return decode_job(job)

    def worker_tick(self, now: int | None = None) -> dict[str, Any]:
        resolved_now = now_ms() if now is None else now
        moved_delayed = self.move_due_delayed(resolved_now)
        reclaimed = self.reclaim_timed_out(resolved_now)
        job_id = self.redis.lpop(READY_QUEUE)
        if not job_id:
            return {"action": "idle", "moved_delayed": moved_delayed, "reclaimed": reclaimed}

        raw = self.redis.hgetall(JOB_KEY_PREFIX + job_id)
        if not raw:
            return {"action": "missing", "job_id": job_id, "moved_delayed": moved_delayed, "reclaimed": reclaimed}
        job = decode_job(raw)
        allowed, retry_after = self.check_rate_limit(job["tenant_id"])
        if not allowed:
            self.schedule_retry(job_id, job, retry_after, "tenant rate limit exceeded", resolved_now, increment_attempt=False)
            return {"action": "rate_limited", "job_id": job_id, "retry_after_seconds": retry_after}

        attempts = int(job["attempts"]) + 1
        self.redis.hset(
            JOB_KEY_PREFIX + job_id,
            {
                "status": "processing",
                "attempts": str(attempts),
                "updated_at": str(resolved_now),
                "last_error": "",
            },
        )
        self.redis.zadd(PROCESSING_ZSET, {job_id: resolved_now + self.config.visibility_timeout_seconds * 1000})

        payload = job["payload"]
        if payload.get("fail") or payload.get("should_fail"):
            result = self.fail_job(job_id, "simulated worker failure", resolved_now)
        else:
            result = self.complete_job(job_id, resolved_now)
        result["moved_delayed"] = moved_delayed
        result["reclaimed"] = reclaimed
        return result

    def drain(self, max_ticks: int = 25, now: int | None = None) -> dict[str, Any]:
        actions = []
        for _ in range(max(1, min(max_ticks, 100))):
            result = self.worker_tick(now=now)
            actions.append(result)
            if result["action"] == "idle":
                break
        return {"ticks": len(actions), "actions": actions, "snapshot": self.snapshot()}

    def fail_job(self, job_id: str, reason: str = "manual failure", now: int | None = None) -> dict[str, Any]:
        resolved_now = now_ms() if now is None else now
        raw = self.redis.hgetall(JOB_KEY_PREFIX + normalize_id(job_id, "job_id"))
        if not raw:
            raise ValueError(f"unknown job: {job_id}")
        job = decode_job(raw)
        attempts = int(job["attempts"])
        self.redis.zrem(PROCESSING_ZSET, job_id)
        if attempts >= int(job["max_attempts"]):
            self.redis.hset(
                JOB_KEY_PREFIX + job_id,
                {"status": "dead_letter", "last_error": reason, "updated_at": str(resolved_now)},
            )
            self.redis.zadd(FAILED_ZSET, {job_id: resolved_now})
            return {"action": "dead_lettered", "job_id": job_id, "reason": reason, "snapshot": self.snapshot()}
        delay = self.config.base_retry_delay_seconds * (2 ** max(0, attempts - 1))
        self.schedule_retry(job_id, job, delay, reason, resolved_now, increment_attempt=False)
        return {"action": "retry_scheduled", "job_id": job_id, "delay_seconds": delay, "reason": reason}

    def complete_job(self, job_id: str, now: int | None = None) -> dict[str, Any]:
        resolved_now = now_ms() if now is None else now
        self.redis.zrem(PROCESSING_ZSET, job_id)
        self.redis.hset(
            JOB_KEY_PREFIX + job_id,
            {"status": "completed", "updated_at": str(resolved_now), "last_error": ""},
        )
        self.redis.zadd(COMPLETED_ZSET, {job_id: resolved_now})
        return {"action": "completed", "job_id": job_id, "snapshot": self.snapshot()}

    def reset_rate_limits(self, tenant_id: str | None = None) -> dict[str, Any]:
        if tenant_id:
            keys = [RATE_LIMIT_PREFIX + normalize_id(tenant_id, "tenant_id")]
        else:
            keys = self.redis.keys(RATE_LIMIT_PREFIX + "*")
        removed = self.redis.delete(*keys) if keys else 0
        return {"removed": removed, "keys": keys}

    def move_due_delayed(self, now: int) -> int:
        due = self.redis.zrangebyscore(DELAYED_ZSET, 0, now)
        for job_id in due:
            self.redis.zrem(DELAYED_ZSET, job_id)
            self.redis.hset(JOB_KEY_PREFIX + job_id, {"status": "queued", "updated_at": str(now)})
            self.redis.rpush(READY_QUEUE, job_id)
        return len(due)

    def reclaim_timed_out(self, now: int) -> int:
        expired = self.redis.zrangebyscore(PROCESSING_ZSET, 0, now)
        for job_id in expired:
            self.redis.zrem(PROCESSING_ZSET, job_id)
            raw = self.redis.hgetall(JOB_KEY_PREFIX + job_id)
            if not raw:
                continue
            job = decode_job(raw)
            self.schedule_retry(job_id, job, 0, "visibility timeout expired", now, increment_attempt=False)
        return len(expired)

    def schedule_retry(
        self,
        job_id: str,
        job: dict[str, Any],
        delay_seconds: int,
        reason: str,
        now: int,
        increment_attempt: bool,
    ) -> None:
        attempts = int(job["attempts"]) + (1 if increment_attempt else 0)
        available_at = now + max(0, delay_seconds) * 1000
        self.redis.hset(
            JOB_KEY_PREFIX + job_id,
            {
                "status": "delayed" if delay_seconds > 0 else "queued",
                "attempts": str(attempts),
                "available_at": str(available_at),
                "updated_at": str(now),
                "last_error": reason,
            },
        )
        if delay_seconds > 0:
            self.redis.zadd(DELAYED_ZSET, {job_id: available_at})
        else:
            self.redis.rpush(READY_QUEUE, job_id)

    def check_rate_limit(self, tenant_id: str) -> tuple[bool, int]:
        key = RATE_LIMIT_PREFIX + tenant_id
        count = self.redis.incr(key)
        if count == 1:
            self.redis.expire(key, self.config.rate_window_seconds)
        ttl = self.redis.ttl(key)
        if count > self.config.rate_limit:
            return False, max(1, ttl if ttl > 0 else self.config.rate_window_seconds)
        return True, max(0, ttl)

    def snapshot(self) -> dict[str, Any]:
        job_keys = self.redis.keys(JOB_KEY_PREFIX + "*")
        jobs = []
        for key in job_keys:
            raw = self.redis.hgetall(key)
            if raw:
                jobs.append(decode_job(raw))
        jobs.sort(key=lambda item: item["created_at"], reverse=True)
        return {
            "counts": {
                "ready": self.redis.llen(READY_QUEUE),
                "delayed": self.redis.zcard(DELAYED_ZSET),
                "processing": self.redis.zcard(PROCESSING_ZSET),
                "completed": self.redis.zcard(COMPLETED_ZSET),
                "dead_letter": self.redis.zcard(FAILED_ZSET),
                "total_jobs": len(jobs),
            },
            "ready_queue": self.redis.lrange(READY_QUEUE, 0, MAX_RECENT_ITEMS - 1),
            "delayed_jobs": zset_jobs(self.redis, DELAYED_ZSET),
            "processing_jobs": zset_jobs(self.redis, PROCESSING_ZSET),
            "completed_jobs": zset_jobs(self.redis, COMPLETED_ZSET),
            "dead_letter_jobs": zset_jobs(self.redis, FAILED_ZSET),
            "rate_limits": rate_limits(self.redis),
            "recent_jobs": jobs[:MAX_RECENT_ITEMS],
        }


def zset_jobs(redis_client: RedisLike, name: str) -> list[dict[str, Any]]:
    return [{"job_id": member, "score": score} for member, score in redis_client.zrange(name, 0, MAX_RECENT_ITEMS - 1, withscores=True)]


def rate_limits(redis_client: RedisLike) -> list[dict[str, Any]]:
    rows = []
    for key in redis_client.keys(RATE_LIMIT_PREFIX + "*"):
        rows.append({"tenant_id": key.removeprefix(RATE_LIMIT_PREFIX), "count": int(redis_client.get(key) or 0), "ttl": redis_client.ttl(key)})
    return rows


def decode_job(raw: dict[str, str]) -> dict[str, Any]:
    return {
        "job_id": raw["job_id"],
        "tenant_id": raw["tenant_id"],
        "task_type": raw["task_type"],
        "payload": json.loads(raw.get("payload", "{}")),
        "status": raw["status"],
        "attempts": int(raw["attempts"]),
        "max_attempts": int(raw["max_attempts"]),
        "created_at": int(raw["created_at"]),
        "updated_at": int(raw["updated_at"]),
        "available_at": int(raw["available_at"]),
        "idempotency_key": raw.get("idempotency_key", ""),
        "last_error": raw.get("last_error", ""),
    }


def now_ms() -> int:
    return int(time.time() * 1000)


def normalize_id(value: str, field: str) -> str:
    if not value or not str(value).strip():
        raise ValueError(f"{field} is required")
    normalized = str(value).strip()
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-")
    if len(normalized) > 100 or any(char not in allowed for char in normalized):
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, or dash")
    return normalized


def normalize_optional(value: str | None, field: str) -> str | None:
    if value is None or not str(value).strip():
        return None
    return normalize_id(value, field)
