# Home Warranty Receipt Vault POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for organizing household receipts, warranty coverage, return windows, product claims, reminders, and audit history.

## What It Demonstrates

- Idempotent receipt scan and metadata extraction events
- Product registry projection with receipt fingerprints and duplicate detection
- Return-deadline, warranty-expiring, warranty-expired, missing-metadata, and stale-claim alerts
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for covered items, return windows, claims, alerts, event history, jobs, and audits

## Run Locally

Backend:

```bash
cd home-warranty-receipt-vault-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd home-warranty-receipt-vault-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5210`.

## Run With Infrastructure

```bash
cd home-warranty-receipt-vault-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5210`
- API: `http://127.0.0.1:8210`
- Kafka/Redpanda: `127.0.0.1:9109`
- Postgres: `127.0.0.1:5452`
- Redis: `127.0.0.1:6399`

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
curl -X POST http://127.0.0.1:8210/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-claim","itemId":"item-washer","type":"CLAIM_OPENED","notes":"Drum noise reported."}'
```
