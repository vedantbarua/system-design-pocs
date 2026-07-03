# Technical README

## Architecture

```text
Receipt/claim events -> Express API -> Kafka topic/fallback -> WarrantyVault
                                                |
                                                +-> Postgres event/snapshot tables
                                                +-> Redis latest snapshot cache
                                                +-> React dashboard
```

The backend runs without external services by default. `WARRANTY_DATABASE_URL`, `WARRANTY_REDIS_URL`, and `WARRANTY_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate receipt events are ignored by `{itemId}:{eventId}` keys.
- Duplicate receipts are detected by merchant, normalized product name, purchase date, and price fingerprints.
- Vault scans detect return deadlines, warranty expirations, missing metadata, and stale claims.
- Alerts and reminders are deduplicated by stable item-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, metadata extraction, duplicate receipts, missing metadata, return reminders, warranty alerts, claim open/resolve flows, stale claims, reminder dedupe, dispatch, retention, job retries, and restore.
