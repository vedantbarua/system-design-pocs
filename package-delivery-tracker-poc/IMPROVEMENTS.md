# Package Delivery Tracker Improvements

## Production Gaps

1. Replace the single Redis snapshot with immutable event storage and transactional projections.
2. Integrate official UPS, FedEx, USPS, and Amazon carrier APIs.
3. Verify webhook signatures and retain provider request IDs.
4. Add authenticated households and package-level access control.
5. Encrypt tracking numbers and delivery addresses at rest.

## Reliability Improvements

1. Add a durable ingestion queue between HTTP handlers and projection workers.
2. Use a transactional outbox for notification decisions.
3. Add dead-letter handling for unknown carrier codes.
4. Detect carrier clock skew before classifying events as stale.
5. Rebuild package projections by replaying immutable events.
6. Add Redis and datastore health probes with explicit degraded mode.

## Scaling Improvements

1. Partition events and projections by tracking-number hash.
2. Add carrier-specific polling rate limits and adaptive backoff.
3. Batch polling requests where carrier APIs support it.
4. Cache household inbox projections with targeted invalidation.
5. Add WebSocket gateways subscribed to Redis Pub/Sub.
6. Precompute carrier reliability metrics through stream processing.

## Security Improvements

1. Redact tracking numbers in logs and analytics.
2. Add CSRF protection and secure session handling.
3. Validate webhook source IPs where carriers publish ranges.
4. Add per-household and per-carrier API rate limits.
5. Audit preference, address, and package ownership changes.

## Testing Improvements

1. Add Express integration tests against ephemeral Redis.
2. Add contract tests for each carrier status mapping.
3. Add property-based tests for arbitrary event orderings.
4. Add concurrent duplicate-ingestion tests.
5. Add Redis outage and recovery tests.
6. Add React interaction, accessibility, and visual regression tests.
