# FastAPI Redis Task Queue Technical README

## Problem Statement

Many web systems need to accept API requests quickly and process work asynchronously. Redis is a common building block for lightweight queues because it provides fast lists, sorted sets, hashes, counters, TTLs, and atomic operations.

This POC models a task queue with the operational behavior reviewers expect: delayed jobs, retries, rate limits, visibility timeouts, idempotency, and a dead-letter queue.

## Architecture Overview

The POC has two layers:

- `app.py`: FastAPI API and dashboard
- `core.py`: queue service and Redis adapters

`TaskQueueService` is written against a small Redis protocol. The FastAPI app uses `RedisPyAdapter` for real Redis, while tests use `MemoryRedis`.

## Redis Data Model

`job:{job_id}` hash

- tenant ID
- task type
- payload JSON
- status
- attempts
- timestamps
- idempotency key
- last error

`queue:ready` list

- FIFO queue of runnable job IDs

`queue:delayed` sorted set

- member: job ID
- score: available timestamp in milliseconds

`queue:processing` sorted set

- member: job ID
- score: visibility timeout deadline

`queue:completed` sorted set

- member: job ID
- score: completion timestamp

`queue:failed` sorted set

- member: job ID
- score: DLQ timestamp

`idempotency:{key}` string

- value: job ID
- TTL: idempotency retention window

`rate:{tenant_id}` string counter

- incremented per job execution attempt
- TTL defines the rate-limit window

## Request And Worker Flow

### Submit

1. `POST /jobs` validates tenant, task type, idempotency key, and delay.
2. If an idempotency key already maps to a job, that job is returned.
3. A job hash is written.
4. Immediate jobs are pushed to `queue:ready`.
5. Delayed jobs are inserted into `queue:delayed`.

### Worker Tick

1. Move due delayed jobs from `queue:delayed` to `queue:ready`.
2. Reclaim expired processing jobs from `queue:processing`.
3. Pop one ready job.
4. Apply per-tenant rate limit.
5. Mark the job processing with a visibility timeout.
6. Simulate execution.
7. Complete the job or schedule retry.

### Retry And DLQ

Failures retry with exponential backoff:

```text
base_delay * 2^(attempt - 1)
```

When attempts reach `max_attempts`, the job moves to `queue:failed` and its status becomes `dead_letter`.

## Key Tradeoffs

- **Redis lists and sorted sets:** simple, inspectable queue mechanics.
- **HTTP worker controls:** make state transitions easy to demo without a separate worker process.
- **Memory adapter for tests:** keeps CI and local verification dependency-free.
- **Rate limit on execution:** shows how tenants can be throttled without rejecting initial submission.
- **Visibility timeout reclaim:** models worker crashes and stuck processing jobs.

## Failure Handling

The POC demonstrates:

- duplicate submit protection through idempotency keys
- retry scheduling after worker failure
- DLQ after max attempts
- rate-limit deferral
- delayed jobs
- processing timeout reclaim

## Scaling Path

A production version would add:

- Lua scripts for atomic claim/move operations
- separate worker process pool
- structured task handlers
- Redis Streams or a broker for stronger delivery semantics
- metrics and tracing
- job payload schema validation
- per-tenant queues or priority queues
- job cancellation
- authentication and operator authorization

## What Is Intentionally Simplified

- Worker execution is simulated in-process.
- Redis operations are not wrapped in Lua scripts.
- No persistent result payloads beyond job metadata.
- No auth or multi-tenant security.
- No Prometheus metrics.
- No separate scheduler loop.
