# Improvements

## Data and Privacy

- Encrypt sleep events and derived health metrics at rest.
- Add per-user tenant isolation and access grants.
- Introduce configurable retention policies for raw wearable events and aggregate recovery metrics.
- Add export/delete workflows for privacy requests.

## Stream Processing

- Move projection rebuilds to a Kafka consumer group.
- Partition events by user ID to preserve per-user ordering.
- Add schema validation and compatibility checks for wearable event versions.
- Track consumer offsets and replay checkpoints.

## Product Behavior

- Support multiple users, time zones, travel days, shift work, and custom sleep targets.
- Add wearable-specific confidence scoring.
- Distinguish restless wakeups from final wake events.
- Integrate calendar load, workouts, caffeine, and medication context.

## Operations

- Add structured logs, trace IDs, and Prometheus metrics.
- Add alert delivery providers with rate limits and escalation windows.
- Add background workers instead of in-process job draining.
- Add database migrations and backup/restore runbooks.

## Frontend

- Add editable sleep sessions for user corrections.
- Add device sync status and stale-data warnings.
- Add comparison views for weekdays versus weekends.
- Add accessibility tests and visual regression coverage.
