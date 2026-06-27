# Pet Care Coordination POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for coordinating daily pet care across multiple caregivers.

## Why This Exists

Pet care is deceptively distributed. Feeding, walks, medications, sitter handoffs, and vet appointments can be logged by different people from different devices. This POC makes the edge cases visible: duplicate logs, missed windows, pending medications, reminder dedupe, offline event replay, and retryable notification work.

## What It Demonstrates

- Idempotent caregiver event ingestion with Kafka-compatible buffering
- Daily care plan projection for pets, tasks, caregivers, and handoffs
- Missed-care detection from due windows
- Duplicate care-log alerts when multiple caregivers record the same task
- Medication and vet appointment alerting
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for tasks, event stream, reminders, alerts, jobs, and audits

## Run Locally

Backend:

```bash
cd pet-care-coordination-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd pet-care-coordination-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5195`.

## Run With Infrastructure

```bash
cd pet-care-coordination-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5195`
- API: `http://127.0.0.1:8195`
- Kafka/Redpanda: `127.0.0.1:9103`
- Postgres: `127.0.0.1:5446`
- Redis: `127.0.0.1:6393`

## API Shape

- `GET /api/health` returns adapter mode and buffered Kafka messages
- `GET /api/snapshot` returns pets, caregivers, tasks, events, alerts, reminders, handoffs, jobs, and audit entries
- `POST /api/events` ingests and publishes a care event immediately
- `POST /api/events/publish` only queues a care event
- `POST /api/kafka/drain` drains the in-memory Kafka fallback
- `POST /api/jobs` queues an operational job
- `POST /api/jobs/drain` processes queued jobs
- `POST /api/reset` restores seeded demo data

## Demo Flow

1. Open the overview to inspect today's plan, missed tasks, medication due state, alerts, and handoffs.
2. Review the Tasks tab to see assigned caregivers and care windows.
3. Open Care Events to inspect idempotent caregiver logs.
4. Queue and drain jobs in Operations to exercise reminders, alert dispatch, retention, and retries.
5. Post a duplicate completion for Ruby's walk to trigger duplicate-log detection.

Example care event:

```bash
curl -X POST http://127.0.0.1:8195/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-dinner","taskId":"task-ruby-dinner","petId":"pet-ruby","caregiverId":"care-ava","type":"COMPLETED","notes":"Finished dinner."}'
```

## Tradeoffs

This is intentionally a POC. It models a single household and uses in-process projections rather than a dedicated workflow engine. The reliability behaviors are still explicit: event idempotency, missed-window scans, duplicate care detection, reminder locks, alert dedupe, and retryable jobs.
