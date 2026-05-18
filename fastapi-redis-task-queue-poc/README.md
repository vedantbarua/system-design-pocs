# FastAPI Redis Task Queue POC

FastAPI + Redis proof-of-concept for a lightweight background task queue with ready jobs, delayed jobs, worker claims, rate limits, retries, visibility timeouts, idempotency keys, and a dead-letter queue.

## Goal

Show how Redis primitives can power a practical Python task queue behind a web API while making queue state, retries, rate limits, and failure handling visible.

## What It Covers

- FastAPI JSON API and lightweight HTML dashboard
- Redis-backed job records using hashes
- Ready queue using a Redis list
- Delayed queue using a sorted set
- Processing, completed, and dead-letter sets using sorted sets
- Idempotency keys using expiring Redis string keys
- Per-tenant rate limits using expiring counters
- Worker tick and drain controls
- Retry with exponential backoff
- Visibility timeout reclaim for stuck processing jobs
- In-memory Redis adapter for dependency-free unit tests

## Quick Start

Install dependencies:

```bash
cd fastapi-redis-task-queue-poc
python3 -m pip install -r requirements.txt
```

Run with a real Redis server:

```bash
export TASK_QUEUE_REDIS_URL=redis://localhost:6379/0
uvicorn app:app --reload --port 8161
```

Run without Redis for a local demo:

```bash
export TASK_QUEUE_REDIS_URL=memory://
uvicorn app:app --reload --port 8161
```

Open:

```text
http://127.0.0.1:8161
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Submit a job with `POST /jobs`.
2. Run `POST /workers/tick` and watch the job move from ready to completed.
3. Submit the same idempotency key twice and confirm the original job is returned.
4. Submit more jobs than the per-tenant rate limit and watch overflow jobs move to delayed.
5. Submit a job with payload `{"fail": true}` and tick workers until it retries and reaches the DLQ.
6. Force a delayed job with `delay_seconds` and tick after it becomes due.
7. Inspect `/snapshot` to see ready, delayed, processing, completed, DLQ, and rate-limit state.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /jobs/{job_id}`
- `POST /jobs`
- `POST /workers/tick`
- `POST /workers/drain`
- `POST /jobs/{job_id}/fail`
- `POST /rate-limits/reset`

Example job:

```json
{
  "tenant_id": "tenant-a",
  "task_type": "email",
  "payload": {
    "to": "user@example.com"
  },
  "idempotency_key": "email:user@example.com:welcome",
  "delay_seconds": 0
}
```

Example simulated failure:

```json
{
  "tenant_id": "tenant-a",
  "task_type": "webhook",
  "payload": {
    "fail": true
  }
}
```

## Configuration

- `TASK_QUEUE_REDIS_URL` defaults to `redis://localhost:6379/0`; use `memory://` for no-Redis local demo
- `TASK_QUEUE_RATE_LIMIT` defaults to `3`
- `TASK_QUEUE_RATE_WINDOW_SECONDS` defaults to `60`
- `TASK_QUEUE_VISIBILITY_TIMEOUT_SECONDS` defaults to `30`
- `TASK_QUEUE_MAX_ATTEMPTS` defaults to `3`
- `TASK_QUEUE_BASE_RETRY_DELAY_SECONDS` defaults to `5`

## Notes and Limitations

- The test suite uses an in-memory Redis adapter so it can run without external services.
- The production app path uses `redis-py` and expects a reachable Redis server unless `memory://` is configured.
- Worker execution is simulated inside `POST /workers/tick`.
- The claim flow is intentionally compact; production systems should use Lua scripts or Redis transactions for stronger atomicity.
- There is no authentication, tenant authorization, metrics exporter, or background worker process.

## Technologies Used

- Python 3
- FastAPI
- Redis
- Uvicorn
- `unittest`
