# Personal Bill Payment Coordinator POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for tracking household bills, due dates, autopay status, payment confirmations, changed statements, reminders, and audit history.

## What It Demonstrates

- Idempotent bill statement and payment event ingestion
- Out-of-order bill/payment update protection using event timestamps
- Bill lifecycle projection for upcoming, scheduled, paid, overdue, failed autopay, and missing-confirmation states
- Duplicate bill detection from payee, account, and due-date fingerprints
- Due-soon, overdue, autopay-failed, missing-confirmation, duplicate-bill, and amount-changed alerts
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for bills, payments, alerts, event history, jobs, and audits

## Run Locally

Backend:

```bash
cd personal-bill-payment-coordinator-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd personal-bill-payment-coordinator-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5250`.

## Run With Infrastructure

```bash
cd personal-bill-payment-coordinator-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5250`
- API: `http://127.0.0.1:8250`
- Kafka/Redpanda: `127.0.0.1:9113`
- Postgres: `127.0.0.1:5456`
- Redis: `127.0.0.1:6403`

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
curl -X POST http://127.0.0.1:8250/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"confirm-rent","billId":"bill-rent","type":"PAYMENT_CONFIRMED","confirmationCode":"ACH-100"}'
```
