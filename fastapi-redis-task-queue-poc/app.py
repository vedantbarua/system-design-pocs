#!/usr/bin/env python3
"""FastAPI + Redis task queue POC."""

from __future__ import annotations

import os
from typing import Any

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import HTMLResponse
    from pydantic import BaseModel, Field
except ModuleNotFoundError as exc:  # pragma: no cover - exercised by environment, not tests
    raise SystemExit(
        "Missing FastAPI dependencies. Install them with: python3 -m pip install -r requirements.txt"
    ) from exc

from core import MemoryRedis, QueueConfig, RedisPyAdapter, TaskQueueService


class JobSubmitRequest(BaseModel):
    tenant_id: str = Field(default="tenant-a")
    task_type: str = Field(default="email")
    payload: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None
    delay_seconds: int = Field(default=0, ge=0, le=3600)


class WorkerTickRequest(BaseModel):
    now_ms: int | None = None


class DrainRequest(BaseModel):
    max_ticks: int = Field(default=25, ge=1, le=100)


class FailRequest(BaseModel):
    reason: str = "manual failure"


def build_service() -> TaskQueueService:
    redis_url = os.getenv("TASK_QUEUE_REDIS_URL", "redis://localhost:6379/0")
    config = QueueConfig(
        rate_limit=int(os.getenv("TASK_QUEUE_RATE_LIMIT", "3")),
        rate_window_seconds=int(os.getenv("TASK_QUEUE_RATE_WINDOW_SECONDS", "60")),
        visibility_timeout_seconds=int(os.getenv("TASK_QUEUE_VISIBILITY_TIMEOUT_SECONDS", "30")),
        max_attempts=int(os.getenv("TASK_QUEUE_MAX_ATTEMPTS", "3")),
        base_retry_delay_seconds=int(os.getenv("TASK_QUEUE_BASE_RETRY_DELAY_SECONDS", "5")),
    )
    if redis_url == "memory://":
        return TaskQueueService(MemoryRedis(), config)
    try:
        import redis
    except ModuleNotFoundError as exc:  # pragma: no cover
        raise SystemExit("Missing redis dependency. Install with: python3 -m pip install -r requirements.txt") from exc
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    client.ping()
    return TaskQueueService(RedisPyAdapter(client), config)


service = build_service()
app = FastAPI(title="FastAPI Redis Task Queue POC", version="0.1.0")


@app.get("/", response_class=HTMLResponse)
def dashboard() -> str:
    snapshot = service.snapshot()
    jobs = "".join(
        f"<tr><td>{job['job_id']}</td><td>{job['tenant_id']}</td><td>{job['task_type']}</td><td>{job['status']}</td><td>{job['attempts']}</td><td>{job['last_error']}</td></tr>"
        for job in snapshot["recent_jobs"]
    )
    rates = "".join(
        f"<tr><td>{row['tenant_id']}</td><td>{row['count']}</td><td>{row['ttl']}</td></tr>"
        for row in snapshot["rate_limits"]
    )
    counts = snapshot["counts"]
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>FastAPI Redis Task Queue POC</title>
  <style>
    body {{ margin:0; background:#eef2f7; color:#172033; font-family:Inter,Segoe UI,sans-serif; }}
    main {{ max-width: 1300px; margin: 0 auto; padding: 28px 20px 56px; }}
    h1,h2 {{ margin:0; }}
    p {{ color:#5a6475; }}
    .stats,.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; }}
    .card {{ background:white; border:1px solid #d9dee8; border-radius:8px; padding:18px; box-shadow:0 16px 42px rgba(23,32,51,.07); }}
    .stat span {{ color:#5a6475; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }}
    .stat strong {{ display:block; font-size:28px; margin-top:6px; }}
    table {{ width:100%; border-collapse:collapse; margin-top:12px; }}
    th,td {{ border-bottom:1px solid #d9dee8; padding:8px 6px; text-align:left; }}
    th {{ color:#5a6475; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }}
    code {{ font-family:SFMono-Regular,Consolas,monospace; }}
  </style>
</head>
<body>
<main>
  <h1>FastAPI Redis Task Queue POC</h1>
  <p>Redis lists, sorted sets, hashes, idempotency keys, TTL rate limits, retries, and DLQ behavior.</p>
  <section class="stats">
    <div class="card stat"><span>Ready</span><strong>{counts['ready']}</strong></div>
    <div class="card stat"><span>Delayed</span><strong>{counts['delayed']}</strong></div>
    <div class="card stat"><span>Processing</span><strong>{counts['processing']}</strong></div>
    <div class="card stat"><span>Completed</span><strong>{counts['completed']}</strong></div>
    <div class="card stat"><span>DLQ</span><strong>{counts['dead_letter']}</strong></div>
  </section>
  <section class="grid" style="margin-top:18px">
    <div class="card"><h2>Submit</h2><p><code>POST /jobs</code></p></div>
    <div class="card"><h2>Worker</h2><p><code>POST /workers/tick</code> or <code>POST /workers/drain</code></p></div>
    <div class="card"><h2>Snapshot</h2><p><code>GET /snapshot</code></p></div>
  </section>
  <section class="card" style="margin-top:18px">
    <h2>Recent Jobs</h2>
    <table><thead><tr><th>Job</th><th>Tenant</th><th>Task</th><th>Status</th><th>Attempts</th><th>Error</th></tr></thead><tbody>{jobs}</tbody></table>
  </section>
  <section class="card" style="margin-top:18px">
    <h2>Rate Limits</h2>
    <table><thead><tr><th>Tenant</th><th>Count</th><th>TTL</th></tr></thead><tbody>{rates}</tbody></table>
  </section>
</main>
</body>
</html>"""


@app.post("/jobs")
def submit_job(request: JobSubmitRequest) -> dict[str, Any]:
    try:
        return service.submit_job(
            request.tenant_id,
            request.task_type,
            request.payload,
            request.idempotency_key,
            request.delay_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    try:
        return service.get_job(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/workers/tick")
def worker_tick(request: WorkerTickRequest | None = None) -> dict[str, Any]:
    return service.worker_tick(now=None if request is None else request.now_ms)


@app.post("/workers/drain")
def drain(request: DrainRequest) -> dict[str, Any]:
    return service.drain(request.max_ticks)


@app.post("/jobs/{job_id}/fail")
def fail_job(job_id: str, request: FailRequest) -> dict[str, Any]:
    try:
        return service.fail_job(job_id, request.reason)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/rate-limits/reset")
def reset_rate_limits(tenant_id: str | None = None) -> dict[str, Any]:
    return service.reset_rate_limits(tenant_id)


@app.get("/snapshot")
def snapshot() -> dict[str, Any]:
    return service.snapshot()


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True}
