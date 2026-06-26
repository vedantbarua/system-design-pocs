# Technical README

## Architecture

The POC uses a deterministic domain core, a thin Express API, optional infrastructure adapters, and a React dashboard.

```text
Room sensors -> Express API -> Kafka topic/fallback -> AirQualityMonitor
                                      |
                                      +-> Postgres event/snapshot tables
                                      +-> Redis latest snapshot cache
                                      +-> React dashboard
```

The backend works without external services by default. If `AIR_DATABASE_URL`, `AIR_REDIS_URL`, or `AIR_KAFKA_BROKERS` are configured, adapters attempt to use real infrastructure and fall back to memory if unavailable.

## Core Model

- `Reading` is the raw sensor event with a stable `{sensorId}:{eventId}` idempotency key.
- `RoomRollup` is the rolling room health view for PM2.5, CO2, VOC, humidity, temperature, stale sensors, and score.
- `Incident` correlates consecutive unhealthy readings into a durable event.
- `Alert` is deduplicated by incident and alert kind.
- `Recommendation` turns current room state into an action.
- `Job` models retryable operational work.

## Event-Time Processing

Readings are stored by observed time and rollups are rebuilt from event time. A late reading can update room averages and incident history without depending on arrival order.

## Reliability Behaviors

- Duplicate sensor syncs are ignored through processed event keys.
- Kafka works in memory for local demos and with Redpanda through Compose.
- Postgres stores latest snapshots and append-only reading events.
- Redis stores the latest snapshot for fast dashboard loading.
- Alerts are deduplicated across repeated projection rebuilds.
- Jobs support retry and dead-letter style status transitions.

## Air Quality Score

The score starts at 100 and applies transparent penalties for:

- Elevated PM2.5
- Elevated CO2
- High VOC index
- Humidity outside the target range
- Temperature outside the comfort range
- Stale sensors

The formula is meant for system-design demonstration, not medical or environmental certification.

## Testing Strategy

The Node test suite covers:

- Seeded room/sensor state
- Stable idempotency keys
- Duplicate ingestion
- Rolling score calculation
- Late event replay
- Stale sensor detection
- Incident grouping
- Alert dedupe and dispatch
- Recommendations
- Validation
- Retention
- Job retries
- Export/import restore

Run:

```bash
cd backend
npm test
```

## Production Improvements

For production, add schema validation, partition Kafka by room or home, use durable stream processors, store raw events separately from projections, encrypt household data, and add real alert delivery providers with rate limits.
