# Technical README

## Architecture

```text
Readiness events -> Express API -> Kafka topic/fallback -> EmergencyReadiness
                                               |
                                               +-> Postgres event/snapshot tables
                                               +-> Redis latest snapshot cache
                                               +-> React dashboard
```

The backend runs without external services by default. `READINESS_DATABASE_URL`, `READINESS_REDIS_URL`, and `READINESS_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate readiness events are ignored by `{itemId}:{eventId}` keys.
- Out-of-order item updates are stored in the event log but ignored by the readiness projection.
- Readiness scans detect expired supplies, expiring supplies, low quantities, missing documents, stale contacts, and incident-mode tasks.
- Incident mode queues a checklist from critical household items.
- Alerts and reminders are deduplicated by stable item-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, metadata updates, stale update protection, low quantities, missing documents, expiring/expired supplies, stale contacts, incident mode, task completion, reminder dedupe, dispatch, retention, job retries, and restore.
