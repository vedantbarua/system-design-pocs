# Technical README

## Architecture

```text
Tenant/landlord events -> Express API -> Kafka topic/fallback -> RentalLeaseTracker
                                                     |
                                                     +-> Postgres event/snapshot tables
                                                     +-> Redis latest snapshot cache
                                                     +-> React dashboard
```

The backend runs without external services by default. `RENTAL_DATABASE_URL`, `RENTAL_REDIS_URL`, and `RENTAL_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate tenant events are ignored by `{recordId}:{eventId}` keys.
- Out-of-order lease updates are stored in the event log but ignored by the projection.
- Duplicate notices and lease documents are detected by stable lease/area/title/party fingerprints.
- Deadline scans detect rent, deposit return, renewal, move-out, repair response, and notice review work.
- Alerts are deduplicated with stable record-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, event idempotency, rent payments, stale update protection, maintenance intake, duplicate notices, rent due scans, repair overdue scans, deposit return scans, renewal and move-out windows, landlord responses, deposit disputes, alert dispatch, retention, job retries, and restore.
