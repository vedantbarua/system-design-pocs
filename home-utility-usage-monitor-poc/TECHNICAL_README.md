# Technical README

## System Goal

The POC models a household utility monitoring system that needs to ingest frequent smart-meter readings, preserve event semantics, expose near-real-time rollups, and alert the household when usage looks abnormal.

The design intentionally keeps the domain core independent from infrastructure. The same `UtilityMonitor` class runs with an in-memory broker for tests and local demos, or with KafkaJS, PostgreSQL/TimescaleDB, and Redis when those services are configured.

## Components

| Component | Responsibility |
| --- | --- |
| React TypeScript frontend | Dashboard, meter drill-downs, Kafka actions, alert workflow, audit view. |
| Express TypeScript API | HTTP orchestration, validation boundary, infrastructure wiring. |
| `UtilityMonitor` domain core | Reading ingest, idempotency, correction handling, rollups, anomaly detection, workers. |
| KafkaJS adapter | Publishes meter events and starts a Kafka consumer when brokers are configured. |
| PostgreSQL/TimescaleDB adapter | Stores snapshots and append-only reading payloads. |
| Redis adapter | Mirrors the hot snapshot and retryable job queue. |
| Memory adapters | Deterministic fallback for quick local execution and tests. |

## Event Model

Readings are keyed with:

```text
meterId:eventId
```

That key gives per-meter idempotency and models Kafka partitioning by meter. If an event is replayed, the `processedKeys` set blocks duplicate projection changes.

Correction events include `correctionOf`. The original reading is marked with `supersededBy`, active rollups ignore superseded readings, and projections for the affected day are recomputed.

## Projection Model

Every accepted reading triggers:

1. Active reading selection for the meter and day.
2. Hour bucket recomputation.
3. Day bucket recomputation.
4. Cost calculation from meter tariff.
5. Audit event creation.

This favors clear deterministic recomputation over incremental mutation. For a POC this is easier to inspect and avoids complicated reverse-delta logic for corrections.

## Anomaly Detection

Detection currently covers four rules:

- `USAGE_SPIKE`: hourly usage is at least 3x baseline.
- `POSSIBLE_LEAK`: water usage stays above 5 gallons for four overnight hours.
- `MISSING_READINGS`: latest reading is older than twice the meter interval.
- `BUDGET_RISK`: month-to-date cost exceeds 85% of budget.

Alerts use dedupe keys so repeated detector runs do not create duplicate open alerts.

## Notification Worker

Alerts enqueue `ALERT_NOTIFICATION` jobs. A worker tick:

- Picks the next `READY` or `RETRY` job.
- Simulates a provider failure when `failNextDelivery` is armed.
- Retries until `maxAttempts`.
- Creates push and email delivery records per recipient.
- Dedupes delivery records by alert/job/recipient/channel.

## Infrastructure Modes

Default mode is memory:

```text
UTILITY_KAFKA_BROKERS=memory://
UTILITY_DATABASE_URL=memory://
UTILITY_REDIS_URL=memory://
```

With environment variables set, the API attempts to connect to real infrastructure. Each adapter falls back independently, so Kafka can be real while PostgreSQL or Redis stays in memory.

Kafka mode starts a KafkaJS consumer in the API process. Memory mode uses an explicit `/api/kafka/drain` endpoint so demos can show buffered messages before ingest.

## Tradeoffs

- The API stores whole snapshots for simple demo persistence. A production system would use event logs plus durable projections.
- Kafka consumer lifecycle is single-process. Production would separate ingestion workers from the API and use consumer-group scaling.
- Time-series compaction is not implemented. Rollups are recomputed from active readings for clarity.
- Authentication, household membership, and multi-tenant isolation are omitted.
- Detection rules are deterministic thresholds rather than learned baselines.

## Failure Cases Covered

- Duplicate meter event replay.
- Out-of-order late readings.
- Correction events that supersede old readings.
- Missing/stale meter readings.
- Provider notification failure and retry.
- Optional infrastructure unavailable at startup.

## Test Coverage

The backend tests cover seeding, idempotent ingest, late readings, corrections, rollup recomputation, anomaly dedupe, worker retries, delivery dedupe, reprocessing, snapshot metrics, export/import, and input validation.
