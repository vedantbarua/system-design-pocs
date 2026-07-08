# Technical README

## Architecture

```text
Routine/habit events -> Express API -> Kafka topic/fallback -> RoutineHabitCoordinator
                                                    |
                                                    +-> Postgres event/snapshot tables
                                                    +-> Redis latest snapshot cache
                                                    +-> React dashboard
```

The backend runs without external services by default. `ROUTINE_DATABASE_URL`, `ROUTINE_REDIS_URL`, and `ROUTINE_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate habit events are ignored by `{habitId}:{eventId}` keys.
- Out-of-order habit edits are stored in the event log but ignored by the routine projection.
- Duplicate check-ins are detected by habit and daily window key.
- Routine scans detect due-soon habits, missed windows, streak breaks, and overloaded time blocks.
- Alerts and reminders are deduplicated by stable habit/window keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, habit edits, stale update protection, check-ins, duplicate check-ins, skips, missed windows, overloads, due reminders, reminder dedupe, dispatch, retention, job retries, and restore.
