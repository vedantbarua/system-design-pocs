# Improvements

## Sensor Data

- Add per-sensor calibration profiles and drift detection.
- Track battery, firmware version, Wi-Fi quality, and last upload latency.
- Add explicit correction events when a device backfills or retracts readings.
- Store raw readings separately from derived room projections.

## Stream Processing

- Move rollups and incident correlation to a Kafka consumer group.
- Partition by home ID and room ID for scalable replay.
- Add schema registry checks for reading versions.
- Persist consumer offsets and projection checkpoints.

## Product Behavior

- Support multiple homes, time zones, floors, and room-specific thresholds.
- Add purifier and HVAC control recommendations.
- Correlate cooking, cleaning, outdoor AQI, and window-open events.
- Add quiet hours and alert escalation preferences.

## Operations

- Add structured logs, metrics, and tracing.
- Add alert provider integrations with retry budgets.
- Add database migrations and backup/restore runbooks.
- Add load tests for high-frequency sensor streams.

## Frontend

- Add historical charts and room comparison filters.
- Add sensor setup and calibration screens.
- Add notification preference controls.
- Add accessibility and visual regression tests.
