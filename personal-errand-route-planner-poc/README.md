# Personal Errand Route Planner POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for planning everyday errands around priorities, deadlines, store hours, and live route changes.

## What It Demonstrates

- Idempotent errand and location event ingestion
- Route planning from pending errands, priorities, deadlines, and distances
- Route stale detection after location changes
- Missed window, duplicate update, and high-priority due alerts
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for route plan, errands, event history, alerts, reminders, jobs, and audits

## Run Locally

Backend:

```bash
cd personal-errand-route-planner-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd personal-errand-route-planner-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5199`.

## Run With Infrastructure

```bash
cd personal-errand-route-planner-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5199`
- API: `http://127.0.0.1:8199`
- Kafka/Redpanda: `127.0.0.1:9107`
- Postgres: `127.0.0.1:5450`
- Redis: `127.0.0.1:6397`

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
curl -X POST http://127.0.0.1:8199/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-complete","errandId":"errand-pharmacy","type":"ERRAND_COMPLETED","notes":"Picked up prescription."}'
```
