# Improvements

## Production Gaps

- Move jobs, shards, and execution history into durable storage instead of process memory.
- Split scheduler, dispatcher, and worker roles into independent services.
- Add a dead-letter queue and explicit retry/backoff policy controls per job type.

## Reliability Improvements

- Replace in-process leader election with a real lease coordinator or consensus-backed metadata store.
- Add deterministic worker acknowledgements so lease expiry and completion cannot race silently.
- Add idempotency keys so retries do not create duplicate external side effects.

## Scaling Improvements

- Add shard rebalancing and ownership transfer when nodes join or leave.
- Replace the single timing wheel with partitioned wheels or a hybrid wheel-plus-priority-queue design.
- Add per-tenant quotas and admission control to protect the scheduler under burst load.

## Security Improvements

- Add authentication and role-based access for job creation, pause/resume, and operational endpoints.
- Add per-tenant authorization boundaries around jobs and shard visibility.
- Validate payload size, schedule horizon, and request rate to prevent abuse.

## Testing Improvements

- Add unit tests for wheel promotion, lease expiry, and leader-election transitions.
- Add integration tests for retry behavior, pause/resume, and shard routing.
- Add deterministic simulation tests that sweep bursts, worker loss, and recovery timing.
