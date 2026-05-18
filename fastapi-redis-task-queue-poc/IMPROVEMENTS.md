# FastAPI Redis Task Queue Improvements

## Production Gaps

- Move workers into a separate long-running process.
- Use Lua scripts for atomic delayed-to-ready and ready-to-processing moves.
- Add typed task handlers and payload schemas.
- Store structured task results.
- Add job cancellation and priority queues.
- Add Redis key namespace configuration for shared Redis clusters.

## Reliability Improvements

- Add poison-job classification.
- Add retry jitter to avoid thundering herds.
- Add durable audit events.
- Add worker heartbeats.
- Add job leases with fencing tokens.
- Add idempotent task-side effects, not only idempotent submission.

## Scaling Improvements

- Partition queues by tenant or task type.
- Add worker concurrency controls.
- Add batch claiming.
- Add priority sorted sets.
- Add queue depth and age metrics.
- Add Redis Cluster compatibility checks.

## Security Improvements

- Require authentication for submit and operator endpoints.
- Authorize tenants against job access.
- Redact sensitive payload fields in snapshots.
- Add signed idempotency keys or request IDs.
- Encrypt Redis traffic in production.
- Add rate-limit controls per API identity.

## Testing Improvements

- Add FastAPI endpoint tests once dependencies are installed.
- Add integration tests against a real Redis container.
- Add randomized retry/rate-limit tests.
- Add timeout reclaim race tests.
- Add load tests for queue depth and worker throughput.
- Add dashboard smoke tests.
