# Rental Lease Tenant Tracker POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for renters to track lease dates, rent deadlines, security deposits, landlord notices, repair requests, evidence, and move-out tasks.

## What It Demonstrates

- Idempotent tenant event ingestion for rent, notices, documents, maintenance, landlord responses, deposit deductions, and move-out events
- Out-of-order update protection using event timestamps
- Lease projection for scheduled, due-soon, open, overdue, responded, resolved, disputed, duplicate, paid, and archived records
- Duplicate notice/document detection using lease, area, title, and party fingerprints
- Deadline scans for rent, renewal windows, move-out notice, deposit return, unresolved repairs, and notice review
- Retryable background jobs for scans, evidence review, alert dispatch, and retention
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for tenant readiness, records, alerts, events, jobs, and audits

## Run Locally

Backend:

```bash
cd rental-lease-tenant-tracker-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd rental-lease-tenant-tracker-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5310`.

## Run With Infrastructure

```bash
cd rental-lease-tenant-tracker-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5310`
- API: `http://127.0.0.1:8310`
- Kafka/Redpanda: `127.0.0.1:9119`
- Postgres: `127.0.0.1:5462`
- Redis: `127.0.0.1:6409`

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
curl -X POST http://127.0.0.1:8310/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"repair-response","recordId":"rec-repair","type":"LANDLORD_RESPONDED","notes":"Plumber scheduled."}'
```
