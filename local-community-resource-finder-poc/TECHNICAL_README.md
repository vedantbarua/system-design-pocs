# Technical README

## Architecture

```text
Provider/resource events -> Express API -> Kafka topic/fallback -> CommunityResourceFinder
                                                        |
                                                        +-> Postgres event/snapshot tables
                                                        +-> Redis latest snapshot cache
                                                        +-> React dashboard
```

The backend runs without external services by default. `RESOURCE_DATABASE_URL`, `RESOURCE_REDIS_URL`, and `RESOURCE_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate provider events are ignored by `{resourceId}:{eventId}` keys.
- Out-of-order provider updates are stored in the event log but ignored by the resource projection.
- Search results are cached by query and invalidated when listing events change the projection.
- Scans detect low capacity, full resources, closures, and stale verification dates.
- Saved resources fan out user-specific alerts when capacity, hours, closures, or availability change.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, metadata updates, stale provider update protection, resource creation, search filters, search caching, cache invalidation, capacity/full detection, saved-resource notifications, save idempotency, stale listings, alert dispatch, retention, job retries, and restore.
