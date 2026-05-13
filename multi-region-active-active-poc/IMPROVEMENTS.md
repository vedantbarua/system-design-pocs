# Multi-Region Active-Active Improvements

## Production Gaps

- Replace in-memory regions with real regional databases.
- Store replication events in durable regional logs.
- Add idempotency keys for write commands and replication events.
- Include schema versions for replicated payloads.
- Add background replication workers instead of manual draining.
- Add repair jobs that compare cart versions across regions.

## Reliability Improvements

- Persist pending replication before acknowledging local writes.
- Add retry backoff, dead-letter queues, and poison-event handling.
- Track per-route replication lag and delivery failures.
- Add anti-entropy scans to recover from dropped replication events.
- Add deterministic replay tests for conflict scenarios.
- Add safeguards for clock skew if wall-clock timestamps are used for last-write-wins.

## Scaling Improvements

- Partition carts by tenant or cart ID.
- Use regional event streams with ordered partitions.
- Support partial replication fanout by tenant geography.
- Add backpressure when a target region falls behind.
- Separate command APIs, replication workers, and query APIs.
- Add compaction for superseded cart snapshots.

## Security Improvements

- Require authentication for write and control endpoints.
- Restrict region outage and event-drop controls to operators.
- Add tenant isolation checks before accepting cart mutations.
- Encrypt cross-region replication traffic.
- Sign replication events to prevent forged writes.
- Redact sensitive cart metadata from operational logs.

## Testing Improvements

- Add controller tests for JSON API contracts.
- Add property-style tests for vector-clock comparison.
- Add convergence tests with random write and drain order.
- Add tests for duplicate replication event application.
- Add browser-level smoke tests for the Thymeleaf dashboard.
- Add failure-injection tests for dropped, delayed, and reordered events.
