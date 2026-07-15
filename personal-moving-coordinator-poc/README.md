# Personal Moving Coordinator POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for coordinating a household move across deadlines, packing, address changes, utilities, movers, vendors, inspections, keys, issues, and reminders.

## What It Demonstrates

- Idempotent move event ingestion for timeline tasks, boxes, address updates, utilities, mover bookings, vendor updates, and issues
- Out-of-order update protection using event timestamps
- Move projection for planned, due-soon, overdue, booked, confirmed, packed, done, blocked, duplicate, and cancelled states
- Duplicate task detection using area, title, and owner fingerprints
- Deadline scans for move tasks, missing essentials, unpacked priority boxes, unconfirmed vendors, and open issues
- Retryable background jobs for scans, reminders, vendor rechecks, and retention
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for move readiness, timeline tasks, packing inventory, vendors, alerts, events, jobs, and audits

## Run Locally

Backend:

```bash
cd personal-moving-coordinator-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd personal-moving-coordinator-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5330`.

## Run With Infrastructure

```bash
cd personal-moving-coordinator-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5330`
- API: `http://127.0.0.1:8330`
- Kafka/Redpanda: `127.0.0.1:9121`
- Postgres: `127.0.0.1:5464`
- Redis: `127.0.0.1:6411`

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
curl -X POST http://127.0.0.1:8330/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"pack-essentials","taskId":"task-pack-kitchen","type":"BOX_PACKED","relatedRef":"box-kitchen-essentials","room":"Kitchen","boxLabel":"Kitchen essentials","fragile":true,"essentials":true}'
```
