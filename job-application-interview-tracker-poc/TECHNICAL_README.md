# Technical README

## Architecture

```text
Application/interview events -> Express API -> Kafka topic/fallback -> JobApplicationTracker
                                                          |
                                                          +-> Postgres event/snapshot tables
                                                          +-> Redis latest snapshot cache
                                                          +-> React dashboard
```

The backend runs without external services by default. `JOB_DATABASE_URL`, `JOB_REDIS_URL`, and `JOB_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate application events are ignored by `{applicationId}:{eventId}` keys.
- Out-of-order application updates are stored in the event log but ignored by the projection.
- Duplicate postings are detected by stable company/role/location fingerprints across sources.
- Scans detect follow-ups, stale applications, upcoming interviews, offer deadlines, and thank-you reminders.
- Alerts are deduplicated with stable application-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, event idempotency, metadata updates, stale update protection, new applications, duplicate postings, interview scheduling, thank-you reminders, offers, follow-ups, stale applications, resume versions, alert dispatch, retention, job retries, and restore.
