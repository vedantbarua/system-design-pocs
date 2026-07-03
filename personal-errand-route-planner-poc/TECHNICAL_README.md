# Technical README

## Architecture

```text
App/location events -> Express API -> Kafka topic/fallback -> ErrandRoutePlanner
                                            |
                                            +-> Postgres event/snapshot tables
                                            +-> Redis latest snapshot cache
                                            +-> React dashboard
```

The backend runs without external services by default. `ERRAND_DATABASE_URL`, `ERRAND_REDIS_URL`, and `ERRAND_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate events are ignored by `{errandId}:{eventId}` keys.
- Route plans rebuild after task and location events.
- Location updates can mark a cached route stale.
- Missed windows and high-priority deadlines are detected by scans.
- Alerts and reminders are deduplicated by stable errand keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, route ordering, route-stale alerts, completion and skip events, missed windows, priority alerts, semantic duplicates, reminder dedupe, dispatch, retention, job retries, and restore.
