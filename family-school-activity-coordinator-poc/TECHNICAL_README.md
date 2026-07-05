# Technical README

## Architecture

```text
School/activity events -> Express API -> Kafka topic/fallback -> SchoolActivityCoordinator
                                                     |
                                                     +-> Postgres event/snapshot tables
                                                     +-> Redis latest snapshot cache
                                                     +-> React dashboard
```

The backend runs without external services by default. `SCHOOL_DATABASE_URL`, `SCHOOL_REDIS_URL`, and `SCHOOL_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate school/activity events are ignored by `{itemId}:{eventId}` keys.
- Out-of-order schedule updates are stored in the event log but ignored by the projection.
- Schedule scans detect child-specific overlaps, homework deadlines, permission forms, pickup confirmations, start-soon windows, and stale school updates.
- Alerts and reminders are deduplicated by stable schedule-item keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, schedule metadata updates, stale update protection, child conflicts, assignment reminders, form reminders, pickup confirmations, form/completion flows, reminder dedupe, dispatch, retention, job retries, and restore.
