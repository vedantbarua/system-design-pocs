# Technical README

## Architecture

The POC is split into a deterministic domain core, a thin Express API, optional infrastructure adapters, and a React dashboard.

```text
Wearable sync -> Express API -> Kafka topic/fallback -> SleepRecoveryTracker
                                      |
                                      +-> Postgres event/snapshot tables
                                      +-> Redis latest snapshot cache
                                      +-> React dashboard
```

The backend runs without external services by default. If `SLEEP_DATABASE_URL`, `SLEEP_REDIS_URL`, or `SLEEP_KAFKA_BROKERS` are present, the adapters try to use real infrastructure and fall back to memory if unavailable.

## Core Model

- `SleepEvent` is the raw wearable event with a stable `{deviceId}:{eventId}` idempotency key.
- `SleepSession` is a rebuilt projection from `SLEEP_START`/`WAKE` and `NAP_START`/`NAP_END` pairs.
- `DailyRecovery` is a daily read model for total sleep, sleep debt, bedtime variance, consistency, and recovery score.
- `Alert` is deduplicated by kind and date-oriented key.
- `Job` models retryable background work.

## Event-Time Processing

Events are sorted by `occurredAt` before rebuilding sessions. That means a late `SLEEP_START` can arrive after a `WAKE` event and still produce a correct session on replay. Projection rebuilds preserve existing session IDs where the source event pair is stable.

## Reliability Behaviors

- Duplicate device syncs are ignored through `processed` event keys.
- Kafka publish/drain works in memory for local demos and with Redpanda through Compose.
- Postgres keeps an append-only event table and a latest JSON snapshot.
- Redis stores the latest snapshot for fast dashboard loading.
- Jobs support retry and dead-letter style status transitions.
- Alerts are deduplicated so repeated rebuilds do not spam notifications.

## Recovery Score

The recovery score combines:

- Sleep duration versus the user target
- Average session quality
- Bedtime consistency
- Sleep debt penalty

The formula is deliberately transparent rather than medically authoritative. It exists to demonstrate system behavior and UX feedback loops.

## Testing Strategy

The Node test suite covers:

- Seeded demo data
- Stable idempotency keys
- Duplicate ingestion
- Out-of-order session rebuilding
- Open sessions
- Sleep debt and alert calculations
- Recommendation refresh
- Retention
- Job retries
- Export/import restore

Run:

```bash
cd backend
npm test
```

## Production Improvements

For production, replace full projection rebuilds with partitioned stream processors, add multi-user tenancy boundaries, encrypt health data, introduce schema validation, and separate alert delivery from projection writes.
