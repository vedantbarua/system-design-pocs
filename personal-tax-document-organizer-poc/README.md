# Personal Tax Document Organizer POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for organizing annual tax documents such as W-2s, 1099s, mortgage statements, childcare receipts, charity receipts, health forms, deductions, and prior-year returns.

## What It Demonstrates

- Idempotent document event ingestion for expected, received, classified, reviewed, duplicate, missing-scan, and archived events
- Out-of-order update protection using document event timestamps
- Checklist projection for expected, received, classified, missing, duplicate, reviewed, and archived states
- Duplicate document detection using tax year, category, issuer, and taxpayer fingerprints
- Missing-document and filing-deadline alerts
- Retryable background jobs for scans, classification, alert dispatch, and retention
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for document readiness, checklist status, alerts, events, jobs, and audits

## Run Locally

Backend:

```bash
cd personal-tax-document-organizer-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd personal-tax-document-organizer-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5300`.

## Run With Infrastructure

```bash
cd personal-tax-document-organizer-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5300`
- API: `http://127.0.0.1:8300`
- Kafka/Redpanda: `127.0.0.1:9118`
- Postgres: `127.0.0.1:5461`
- Redis: `127.0.0.1:6408`

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
curl -X POST http://127.0.0.1:8300/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"receive-1099","documentId":"doc-1099-bank","type":"DOCUMENT_RECEIVED","storageRef":"inbox://1099-int.pdf"}'
```
