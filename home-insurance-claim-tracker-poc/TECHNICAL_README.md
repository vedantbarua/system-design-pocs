# Technical README

## Architecture

```text
Claim/provider events -> Express API -> Kafka topic/fallback -> InsuranceClaimTracker
                                                   |
                                                   +-> Postgres event/snapshot tables
                                                   +-> Redis latest snapshot cache
                                                   +-> React dashboard
```

The backend runs without external services by default. `CLAIM_DATABASE_URL`, `CLAIM_REDIS_URL`, and `CLAIM_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate claim events are ignored by `{claimId}:{eventId}` keys.
- Out-of-order provider updates are stored in the event log but ignored by the claim projection.
- Evidence uploads are fingerprinted by kind, normalized label, and content hash to detect duplicates.
- Claim scans detect document deadlines, inspection windows, stale claims, duplicate evidence, and payment readiness.
- Alerts and reminders are deduplicated by stable claim-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, provider metadata updates, stale update protection, evidence dedupe, evidence ingestion, deadline reminders, inspection reminders, stale claims, payment/closure transitions, reminder dedupe, dispatch, retention, job retries, and restore.
