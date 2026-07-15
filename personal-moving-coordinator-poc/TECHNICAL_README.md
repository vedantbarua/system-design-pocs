# Technical README

## Architecture

```text
Move events -> Express API -> Kafka topic/fallback -> MovingCoordinator
                                           |
                                           +-> Postgres event/snapshot tables
                                           +-> Redis latest snapshot cache
                                           +-> React dashboard
```

The backend runs without external services by default. `MOVE_DATABASE_URL`, `MOVE_REDIS_URL`, and `MOVE_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate move events are ignored by `{taskId}:{eventId}` keys.
- Out-of-order move updates are stored in the event log but ignored by the projection.
- Duplicate tasks are detected by stable area/title/owner fingerprints.
- Scans detect due deadlines, overdue work, missing essentials, unpacked high-priority boxes, unconfirmed vendors, and open issues.
- Alerts are deduplicated with stable task, box, and vendor keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, event idempotency, metadata updates, stale update protection, new task intake, duplicate tasks, packing, mover booking, deadline scans, missing essentials, vendor confirmation, issue resolution, alert dispatch, retention, job retries, and restore.
