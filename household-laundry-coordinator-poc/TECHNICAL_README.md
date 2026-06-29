# Technical README

## Architecture

The POC uses a deterministic domain core, an Express API, optional infrastructure adapters, and a React dashboard.

```text
Machine/app events -> Express API -> Kafka topic/fallback -> LaundryCoordinator
                                           |
                                           +-> Postgres event/snapshot tables
                                           +-> Redis latest snapshot cache
                                           +-> React dashboard
```

The backend runs without external services by default. If `LAUNDRY_DATABASE_URL`, `LAUNDRY_REDIS_URL`, or `LAUNDRY_KAFKA_BROKERS` are configured, adapters try real infrastructure and fall back to memory if unavailable.

## Core Model

- `Machine` tracks washer/dryer availability, last seen time, and active load.
- `LaundryLoad` tracks household owner, label, status, due time, machine, and handoff.
- `LaundryEvent` is the idempotent machine/app event keyed by `{machineId}:{eventId}`.
- `Reminder` models deduped load reminders.
- `Alert` covers stale wet loads, abandoned dryer loads, duplicate updates, and offline machines.
- `Job` models retryable operational work.

## Event Semantics

Machine and app events mutate the load projection immediately while preserving an append-only event trail. Duplicate event keys are ignored, while semantic duplicates, like repeated cycle-done updates for the same load, generate alerts.

## Reliability Behaviors

- Duplicate machine events are ignored through processed event keys.
- Timer scans detect wet loads and dry loads that were not moved or folded.
- Reminder and alert dedupe prevent repeated notifications.
- Kafka works in memory for local demos and with Redpanda through Compose.
- Postgres stores latest snapshots and append-only laundry events.
- Redis stores the latest snapshot for fast dashboard loading.

## Testing Strategy

The Node test suite covers:

- Seeded machines, loads, events, alerts, and reminders
- Stable idempotency keys
- Duplicate event ingestion
- Washer start and machine state transitions
- Wet-load and dry-load stale detection
- Duplicate update alerts
- Machine offline alerts
- Reminder dedupe
- Alert/reminder dispatch
- Folded load completion
- Retention
- Job retries
- Export/import restore

Run:

```bash
cd backend
npm test
```

## Production Improvements

For production, add multi-household tenancy, mobile push providers, real appliance integrations, presence-aware reminders, worker-based scans, stronger schema validation, and role-based household access.
