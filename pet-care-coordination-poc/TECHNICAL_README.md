# Technical README

## Architecture

The POC is split into a deterministic domain core, an Express API, optional infrastructure adapters, and a React dashboard.

```text
Caregiver app -> Express API -> Kafka topic/fallback -> PetCareCoordinator
                                       |
                                       +-> Postgres event/snapshot tables
                                       +-> Redis latest snapshot cache
                                       +-> React dashboard
```

The backend runs without external services by default. If `PET_DATABASE_URL`, `PET_REDIS_URL`, or `PET_KAFKA_BROKERS` are configured, adapters try real infrastructure and fall back to memory if unavailable.

## Core Model

- `Pet` and `Caregiver` define the household context.
- `CareTask` tracks due time, window, assignment, recurrence, and status.
- `CareEvent` is the idempotent event emitted by a caregiver device.
- `Alert` covers missed care, duplicate logs, medications, and vet reminders.
- `Reminder` models deduped outbound caregiver notifications.
- `Job` models retryable operational work.

## Event Semantics

Care events use `{caregiverId}:{eventId}` as the idempotency key. This allows each caregiver device to retry safely while still allowing the system to detect semantic duplicates, like two caregivers completing the same walk task.

## Reliability Behaviors

- Duplicate event submissions are ignored.
- Missed care is detected by comparing due windows with scan time.
- Reminder dedupe prevents repeated notifications for the same task/caregiver pair.
- Alerts are deduplicated by stable task-oriented keys.
- Kafka works in memory for local demos and with Redpanda through Compose.
- Postgres stores latest snapshots and append-only care events.
- Redis stores the latest snapshot for fast dashboard loading.

## Testing Strategy

The Node test suite covers:

- Seeded household state
- Stable event keys
- Duplicate event ingestion
- Task completion
- Missed-care detection
- Medication and vet alerts
- Duplicate care logs
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

For production, add multi-household tenancy, timezone-aware recurrence generation, stronger schema validation, role-based access controls, notification provider integrations, encrypted health notes, and worker-based scheduling.
