# Family School Activity Coordinator POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for coordinating school events, homework, forms, activities, pickup changes, caregiver reminders, schedule conflicts, and audit history.

## What It Demonstrates

- Idempotent school/activity event ingestion
- Out-of-order update protection using event timestamps
- Family schedule projection for homework, forms, sports, music, pickup, supplies, and school events
- Child-specific conflict detection across timed activities
- Assignment due, permission form, pickup confirmation, start-soon, and stale school update alerts
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for schedule, attention queue, alerts, event history, jobs, and audits

## Run Locally

Backend:

```bash
cd family-school-activity-coordinator-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd family-school-activity-coordinator-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5230`.

## Run With Infrastructure

```bash
cd family-school-activity-coordinator-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5230`
- API: `http://127.0.0.1:8230`
- Kafka/Redpanda: `127.0.0.1:9111`
- Postgres: `127.0.0.1:5454`
- Redis: `127.0.0.1:6401`

## API Shape

- `GET /api/health`
- `GET /api/snapshot`
- `POST /api/events`
- `POST /api/events/publish`
- `POST /api/kafka/drain`
- `POST /api/jobs`
- `POST /api/jobs/drain`
- `POST /api/reset`

Example:

```bash
curl -X POST http://127.0.0.1:8230/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"pickup-change","itemId":"item-pickup","type":"PICKUP_CHANGED","pickupBy":"Noah","notes":"Grandma unavailable today."}'
```
