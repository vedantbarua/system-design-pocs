# Personal Routine Habit Coordinator POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for coordinating recurring habits, routine windows, check-ins, skips, streaks, reminders, and audit history.

## What It Demonstrates

- Idempotent habit check-in, skip, and routine edit event ingestion
- Out-of-order routine update protection using event timestamps
- Habit projection for scheduled, due-soon, done, missed, skipped, and overloaded states
- Duplicate check-in, missed-window, streak-broken, and overloaded-window detection
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for habits, logs, alerts, event history, jobs, and audits

## Run Locally

Backend:

```bash
cd personal-routine-habit-coordinator-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd personal-routine-habit-coordinator-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5260`.

## Run With Infrastructure

```bash
cd personal-routine-habit-coordinator-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5260`
- API: `http://127.0.0.1:8260`
- Kafka/Redpanda: `127.0.0.1:9114`
- Postgres: `127.0.0.1:5457`
- Redis: `127.0.0.1:6404`

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
curl -X POST http://127.0.0.1:8260/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"water-checkin","habitId":"habit-water","type":"CHECKED_IN","notes":"Finished first bottle."}'
```
