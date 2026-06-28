# Technical README

## Architecture

The POC uses a deterministic domain core, an Express API, optional infrastructure adapters, and a React dashboard.

```text
Municipal updates -> Express API -> Kafka topic/fallback -> WastePickupCoordinator
                                          |
                                          +-> Postgres event/snapshot tables
                                          +-> Redis latest snapshot cache
                                          +-> React dashboard
```

The backend runs without external services by default. If `WASTE_DATABASE_URL`, `WASTE_REDIS_URL`, or `WASTE_KAFKA_BROKERS` are configured, adapters try real infrastructure and fall back to memory if unavailable.

## Core Model

- `PickupSchedule` tracks stream, bin color, route, recurrence, scheduled time, and status.
- `RouteEvent` is the idempotent municipal event keyed by `{routeId}:{eventId}`.
- `RouteStatus` provides a compact route-level read model.
- `Reminder` models deduped household pickup reminders.
- `Alert` covers missed pickups, route delays, holiday shifts, skipped pickups, and bulk pickup due warnings.
- `Job` models retryable operational work.

## Event Semantics

Route events can complete pickups, delay a route, skip a schedule, or apply a holiday shift. The schedule projection is updated immediately, while the event is also appended to persistence when Postgres is enabled.

## Reliability Behaviors

- Duplicate municipal events are ignored through processed event keys.
- Holiday shifts mutate the affected future schedule and queue an alert.
- Schedule scans detect missed pickups after a configurable service window.
- Reminder and alert dedupe prevent repeated notifications.
- Kafka works in memory for local demos and with Redpanda through Compose.
- Postgres stores latest snapshots and append-only route events.
- Redis stores the latest snapshot for fast dashboard loading.

## Testing Strategy

The Node test suite covers:

- Seeded pickup schedules and route state
- Stable idempotency keys
- Duplicate event ingestion
- Completed pickups
- Route delays
- Holiday shifts
- Missed and skipped pickups
- Bulk pickup alerts
- Reminder dedupe
- Alert/reminder dispatch
- Retention
- Job retries
- Export/import restore

Run:

```bash
cd backend
npm test
```

## Production Improvements

For production, add multi-household tenancy, geocoded service zones, timezone-aware recurrence expansion, official holiday calendars, provider webhook signatures, worker-based scans, and notification provider integrations.
