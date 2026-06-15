# Improvements

## Production Hardening

- Split the Kafka consumer into a separate worker service with independent deployment and autoscaling.
- Add schema validation for meter events using a schema registry or versioned JSON schema.
- Store immutable event history separately from projected read models.
- Add tenant-aware authorization for households, meters, alerts, and audit records.
- Add request tracing across API, Kafka publish, consumer ingest, projection writes, and notification delivery.

## Data And Time-Series

- Use native TimescaleDB hypertable retention, compression, and continuous aggregates.
- Add backfill jobs for historical meter imports.
- Track meter clock skew and reject impossible future readings.
- Add raw/normalized unit conversion for meters that report different units.
- Introduce projection versions so old rollup algorithms can be replayed safely.

## Kafka Reliability

- Add DLQ topics for malformed or permanently failing readings.
- Persist consumer offsets only after projection writes complete.
- Add partition-count tests for high-cardinality meter fleets.
- Include event headers for schema version, correlation ID, producer ID, and trace context.
- Add producer idempotence and retry/backoff tuning for real broker deployments.

## Alerting

- Replace fixed thresholds with seasonal baselines and per-household learning.
- Add alert suppression windows and quiet hours.
- Add escalation policies for critical leak alerts.
- Support SMS/email provider adapters with real webhook receipts.
- Add alert resolution rules when usage returns to normal.

## Frontend

- Add live polling or Server-Sent Events for streaming updates.
- Add date range controls for historical utility usage.
- Add budget editing and per-meter tariff configuration.
- Add exportable CSV/PDF reports for billing disputes.
- Add household comparison views for month-over-month trends.
