# Technical README

## Architecture

```text
Care events -> Express API -> Kafka topic/fallback -> ElderCareCoordinator
                                           |
                                           +-> Postgres event/snapshot tables
                                           +-> Redis latest snapshot cache
                                           +-> React dashboard
```

The backend runs without external services by default. `CARE_DATABASE_URL`, `CARE_REDIS_URL`, and `CARE_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate care events are ignored by `{taskId}:{eventId}` keys.
- Out-of-order task updates are stored in the event log but ignored by the care projection.
- Care scans detect due-soon tasks, missed care windows, pending handoffs, and escalated tasks.
- Duplicate completed-care logs are detected by task and hourly care window.
- Alerts and reminders are deduplicated by stable task-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, metadata updates, stale update protection, completed care logs, duplicate log alerts, skipped care escalation, due-soon detection, missed-care detection, handoffs, reminder dedupe, dispatch, retention, job retries, and restore.
