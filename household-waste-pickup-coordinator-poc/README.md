# Household Waste Pickup Coordinator POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for coordinating trash, recycling, compost, and bulk pickup schedules.

## Why This Exists

Waste pickup looks simple until holidays, municipal delays, skipped bins, bulk pickup windows, and duplicate route updates enter the workflow. This POC makes those everyday edge cases visible with an event-driven schedule projection and a dashboard for reminders, route status, alerts, and history.

## What It Demonstrates

- Idempotent municipal route event ingestion with Kafka-compatible buffering
- Pickup schedules for trash, recycling, compost, and bulk items
- Holiday shifts and one-off route delays
- Missed and skipped pickup detection
- Reminder queue with dedupe
- Alert deduplication and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for upcoming pickups, route status, event history, reminders, jobs, and audits

## Run Locally

Backend:

```bash
cd household-waste-pickup-coordinator-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd household-waste-pickup-coordinator-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5196`.

## Run With Infrastructure

```bash
cd household-waste-pickup-coordinator-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5196`
- API: `http://127.0.0.1:8196`
- Kafka/Redpanda: `127.0.0.1:9104`
- Postgres: `127.0.0.1:5447`
- Redis: `127.0.0.1:6394`

## API Shape

- `GET /api/health` returns adapter mode and buffered Kafka messages
- `GET /api/snapshot` returns schedules, route events, route status, reminders, alerts, jobs, and audit entries
- `POST /api/events` ingests and publishes a route event immediately
- `POST /api/events/publish` only queues a route event
- `POST /api/kafka/drain` drains the in-memory Kafka fallback
- `POST /api/jobs` queues an operational job
- `POST /api/jobs/drain` processes queued jobs
- `POST /api/reset` restores seeded demo data

## Demo Flow

1. Open the overview to inspect upcoming pickups, route delays, reminders, and alerts.
2. Review the Schedule tab for stream, bin, route, recurrence, and status.
3. Open Route Events to inspect idempotent municipal updates.
4. Queue and drain jobs in Operations to exercise reminders, alert dispatch, retention, and retries.
5. Post a skipped compost pickup or late recycling completion to verify alerting and status changes.

Example route event:

```bash
curl -X POST http://127.0.0.1:8196/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-skip","routeId":"route-compost-nw","scheduleId":"sched-compost-today","type":"PICKUP_SKIPPED","notes":"Blocked bin"}'
```

## Tradeoffs

This is intentionally a POC. It models one household and compact in-process projections instead of a municipal-grade route platform. The important behaviors are explicit: event idempotency, holiday shifts, delay propagation, reminder dedupe, missed-pickup scans, alert dedupe, and retryable jobs.
