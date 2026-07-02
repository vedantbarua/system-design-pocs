# Household Mail Triage POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for triaging incoming household mail into an inbox, action queue, deadlines, reminders, and archive.

## What It Demonstrates

- Idempotent scanned mail and classification event ingestion
- Sender/category/action projection for household mail
- Duplicate notice detection from stable fingerprints
- Stale unreviewed mail and due-soon/overdue alerting
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for inbox, action queue, alerts, event history, jobs, and audits

## Run Locally

Backend:

```bash
cd household-mail-triage-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd household-mail-triage-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5200`.

## Run With Infrastructure

```bash
cd household-mail-triage-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5200`
- API: `http://127.0.0.1:8200`
- Kafka/Redpanda: `127.0.0.1:9108`
- Postgres: `127.0.0.1:5451`
- Redis: `127.0.0.1:6398`

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
curl -X POST http://127.0.0.1:8200/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-done","mailId":"mail-electric","type":"ACTION_COMPLETED","notes":"Paid online."}'
```
