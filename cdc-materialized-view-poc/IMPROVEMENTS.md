# CDC Materialized View Improvements

## Production Gaps

- Replace the in-memory source table with a real database.
- Read from a real WAL/binlog stream.
- Store CDC events in a durable broker.
- Persist connector offsets transactionally.
- Add schema versions and schema migration handling.
- Split connector workers from projection consumers.

## Reliability Improvements

- Add durable idempotency tables per projection.
- Add retry, backoff, and DLQ handling for projection failures.
- Add poison-event isolation.
- Add offset commit only after successful projection writes.
- Add replay safety checks before clearing projections.
- Add source snapshot watermarks for consistent backfills.

## Scaling Improvements

- Partition events by order ID or customer ID.
- Add parallel projection workers.
- Track lag per partition.
- Add bounded replay and backfill pagination.
- Support compaction for superseded change events.
- Move search index projection into a dedicated adapter.

## Security Improvements

- Require authentication for mutation and connector-control endpoints.
- Restrict replay and backfill controls to operators.
- Redact sensitive customer/order fields from logs.
- Add tenant boundaries to projection updates.
- Sign connector control actions in audit logs.
- Encrypt broker and projection traffic in a production topology.

## Testing Improvements

- Add controller tests for JSON API contracts.
- Add replay tests across mixed insert/update/delete histories.
- Add randomized duplicate-delivery tests.
- Add projection drift and backfill recovery tests.
- Add browser smoke tests for the dashboard.
- Add performance tests with larger change logs and batch sizes.
