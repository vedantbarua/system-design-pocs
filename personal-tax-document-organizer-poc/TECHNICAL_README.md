# Technical README

## Architecture

```text
Tax document events -> Express API -> Kafka topic/fallback -> TaxDocumentOrganizer
                                                   |
                                                   +-> Postgres event/snapshot tables
                                                   +-> Redis latest snapshot cache
                                                   +-> React dashboard
```

The backend runs without external services by default. `TAX_DATABASE_URL`, `TAX_REDIS_URL`, and `TAX_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate tax document events are ignored by `{documentId}:{eventId}` keys.
- Out-of-order document updates are stored in the event log but ignored by the checklist projection.
- Duplicate forms are detected by stable tax-year/category/issuer/taxpayer fingerprints.
- Scans detect missing expected forms, upcoming deadlines, received documents needing review, and stale classification.
- Jobs support retry and dead-letter style status transitions.
- Retention keeps long-lived tax history while allowing event-log cleanup.

## Tests

The test suite covers seeded state, event idempotency, metadata updates, stale update protection, new document intake, duplicate detection, missing-document scans, deadline alerts, review alerts, classification, review/archive transitions, alert dispatch, retention, job retries, and restore.
