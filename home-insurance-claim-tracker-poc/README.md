# Home Insurance Claim Tracker POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for tracking home insurance claims, evidence, adjuster updates, inspections, deadlines, payments, reminders, and audit history.

## What It Demonstrates

- Idempotent claim/provider event ingestion
- Out-of-order provider update protection using event timestamps
- Claim lifecycle projection for documents, inspections, estimates, approvals, payments, and closures
- Duplicate evidence detection with stable evidence fingerprints
- Document deadline, inspection-soon, stale claim, duplicate evidence, and payment-ready alerts
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for claims, evidence, alerts, event history, jobs, and audits

## Run Locally

Backend:

```bash
cd home-insurance-claim-tracker-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd home-insurance-claim-tracker-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5240`.

## Run With Infrastructure

```bash
cd home-insurance-claim-tracker-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5240`
- API: `http://127.0.0.1:8240`
- Kafka/Redpanda: `127.0.0.1:9112`
- Postgres: `127.0.0.1:5455`
- Redis: `127.0.0.1:6402`

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
curl -X POST http://127.0.0.1:8240/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"payment","claimId":"claim-water","type":"PAYMENT_ISSUED","expectedPaymentCents":410000,"notes":"ACH payment scheduled."}'
```
