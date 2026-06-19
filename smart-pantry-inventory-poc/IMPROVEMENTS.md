# Improvements

## Production Gaps

1. Replace JSON snapshots with normalized products, lots, stock events, and projection tables.
2. Add household membership, roles, invitations, and per-household data isolation.
3. Add product creation and integrate a barcode catalog with local override support.
4. Support decimal quantities, unit conversion, package sizes, and measurement precision.
5. Add push notifications for expiring food and shopping-list changes.

## Reliability Improvements

1. Commit the stock event, aggregate version, and outbox record in one PostgreSQL transaction.
2. Enforce optimistic concurrency with a product-inventory version on every command.
3. Add Kafka retry topics, exponential backoff, poison-message quarantine, and replay tooling.
4. Persist processed-event keys with retention instead of keeping them in process memory.
5. Lease background jobs so crashed workers can safely release timed-out work.
6. Reconcile stock projections against the event ledger on a schedule.

## Scaling Improvements

1. Partition Kafka by household and product to preserve local ordering without global serialization.
2. Split command handling, event consumption, expiration scanning, and notifications into separate services.
3. Store shopping and inventory read models separately from the write ledger.
4. Batch expiration scans by date bucket and household shard.
5. Add cursor pagination and archival for long event and audit histories.

## Security Improvements

1. Add OIDC authentication and household-scoped authorization checks on every endpoint.
2. Encrypt sensitive household metadata at rest and enforce TLS between services.
3. Rate-limit barcode lookups, event publication, and bulk worker controls.
4. Replace free-form actor values with verified principal IDs.
5. Sign administrative audit events and export them to immutable storage.

## Testing Improvements

1. Add PostgreSQL, Redis, and Redpanda integration tests through Testcontainers.
2. Add concurrency tests for simultaneous consume commands against the final unit.
3. Add property-based tests proving stock never becomes negative and replay is idempotent.
4. Add clock-controlled tests for timezone and expiration-boundary behavior.
5. Add Playwright coverage for stock entry, shopping transitions, retries, and responsive layouts.
6. Add broker replay and out-of-order delivery tests across product partitions.
