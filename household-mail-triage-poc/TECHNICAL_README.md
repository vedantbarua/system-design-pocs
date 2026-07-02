# Technical README

## Architecture

```text
Scan/classify events -> Express API -> Kafka topic/fallback -> MailTriage
                                             |
                                             +-> Postgres event/snapshot tables
                                             +-> Redis latest snapshot cache
                                             +-> React dashboard
```

The backend runs without external services by default. `MAIL_DATABASE_URL`, `MAIL_REDIS_URL`, and `MAIL_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate mail events are ignored by `{mailId}:{eventId}` keys.
- Duplicate notices are detected by sender, normalized subject, and due date fingerprints.
- Inbox scans detect stale unreviewed mail, due-soon items, and overdue actions.
- Alerts and reminders are deduplicated by stable mail-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, classification, duplicate notices, stale mail, due reminders, overdue alerts, action completion, archive, reminder dedupe, dispatch, retention, job retries, and restore.
