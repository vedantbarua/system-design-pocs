# Household Emergency Readiness POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for tracking household emergency kits, supplies, documents, contacts, pets, vehicles, evacuation tasks, reminders, incident mode, and audit history.

## What It Demonstrates

- Idempotent readiness event ingestion for supplies, documents, contacts, and tasks
- Out-of-order update protection using event timestamps
- Readiness projection for ready, expiring, expired, missing, stale, and completed states
- Expiring supply, expired supply, low quantity, missing document, stale contact, and incident task alerts
- Incident-mode checklist generation for critical household items
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for readiness inventory, alerts, events, jobs, and audits

## Run Locally

Backend:

```bash
cd household-emergency-readiness-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd household-emergency-readiness-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5270`.

## Run With Infrastructure

```bash
cd household-emergency-readiness-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5270`
- API: `http://127.0.0.1:8270`
- Kafka/Redpanda: `127.0.0.1:9115`
- Postgres: `127.0.0.1:5458`
- Redis: `127.0.0.1:6405`

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
curl -X POST http://127.0.0.1:8270/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"incident","itemId":"item-water","type":"INCIDENT_MODE_STARTED","notes":"Storm warning active."}'
```
