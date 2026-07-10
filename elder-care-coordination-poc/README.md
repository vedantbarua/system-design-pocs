# Elder Care Coordination POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for coordinating everyday elder-care tasks across family caregivers, including meals, hydration, rides, appointments, wellness calls, refill pickup, handoffs, reminders, missed-care alerts, and audit history.

## What It Demonstrates

- Idempotent care event ingestion for task updates, logs, handoffs, skips, cancellations, and escalations
- Out-of-order update protection using event timestamps
- Care projection for scheduled, due-soon, done, missed, handoff-pending, escalated, and cancelled states
- Missed-care, due-soon, duplicate-log, handoff-pending, and escalation alerts
- Duplicate care-log detection by task and hourly care window
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for care tasks, logs, alerts, events, jobs, and audits

## Run Locally

Backend:

```bash
cd elder-care-coordination-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd elder-care-coordination-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5280`.

## Run With Infrastructure

```bash
cd elder-care-coordination-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5280`
- API: `http://127.0.0.1:8280`
- Kafka/Redpanda: `127.0.0.1:9116`
- Postgres: `127.0.0.1:5459`
- Redis: `127.0.0.1:6406`

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
curl -X POST http://127.0.0.1:8280/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"log-breakfast","taskId":"task-breakfast","type":"CARE_LOGGED","caregiver":"Ava"}'
```
