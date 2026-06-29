# Household Laundry Coordinator POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for coordinating shared household laundry loads across washer, dryer, folding, and completion states.

## Why This Exists

Laundry is a small but realistic shared-resource workflow. Machines have state, timers drift, loads get forgotten, household members hand work off to each other, and devices can resend the same status update. This POC models those issues with event-driven load state, reminders, alert dedupe, and retryable jobs.

## What It Demonstrates

- Idempotent washer/dryer event ingestion with Kafka-compatible buffering
- Load lifecycle across washing, wet-done, drying, dry-done, folding, completed, and stale states
- Machine availability and active load tracking
- Stale wet-load and abandoned dryer-load detection
- Duplicate status update alerts
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for machines, active loads, event history, alerts, reminders, jobs, and audits

## Run Locally

Backend:

```bash
cd household-laundry-coordinator-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd household-laundry-coordinator-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5197`.

## Run With Infrastructure

```bash
cd household-laundry-coordinator-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5197`
- API: `http://127.0.0.1:8197`
- Kafka/Redpanda: `127.0.0.1:9105`
- Postgres: `127.0.0.1:5448`
- Redis: `127.0.0.1:6395`

## API Shape

- `GET /api/health` returns adapter mode and buffered Kafka messages
- `GET /api/snapshot` returns machines, loads, events, reminders, alerts, jobs, and audit entries
- `POST /api/events` ingests and publishes a laundry event immediately
- `POST /api/events/publish` only queues a laundry event
- `POST /api/kafka/drain` drains the in-memory Kafka fallback
- `POST /api/jobs` queues an operational job
- `POST /api/jobs/drain` processes queued jobs
- `POST /api/reset` restores seeded demo data

## Demo Flow

1. Open the overview to inspect machine state, active loads, stale loads, reminders, and alerts.
2. Review the Loads tab to see handoffs, due times, and load status.
3. Open Machine Events to inspect idempotent washer/dryer updates.
4. Queue and drain jobs in Operations to exercise scans, reminders, alert dispatch, retention, and retries.
5. Post a duplicate cycle-done event to trigger duplicate update detection.

Example event:

```bash
curl -X POST http://127.0.0.1:8197/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-start","loadId":"load-sheets","machineId":"washer-1","type":"LOAD_STARTED","actor":"Ava","notes":"Started sheets."}'
```

## Tradeoffs

This is intentionally a POC. It models one household, two machines, and compact in-process projections instead of a production workflow engine. The important behaviors are explicit: idempotent events, timer-based scans, stale load alerts, duplicate update detection, reminder dedupe, and retryable jobs.
