# Technical README

## Architecture

```text
Sensors/manual care -> Express API -> Kafka topic/fallback -> PlantCareMonitor
                                           |
                                           +-> Postgres event/snapshot tables
                                           +-> Redis latest snapshot cache
                                           +-> React dashboard
```

The backend runs without external services by default. `PLANT_DATABASE_URL`, `PLANT_REDIS_URL`, and `PLANT_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate plant events are ignored by `{sensorId}:{eventId}` keys.
- Care scans rebuild plant health from latest readings and watering history.
- Alerts and reminders are deduplicated by stable plant-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, duplicate events, dry/overwater/low-light/stale-sensor detection, watering recovery, offline alerts, reminder dedupe, dispatch, validation, retention, job retries, and restore.
