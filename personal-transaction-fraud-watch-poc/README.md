# Personal Transaction Fraud Watch POC

This POC models a practical transaction fraud-monitoring dashboard for everyday card and bank activity. It ingests simulated transaction events, scores risk, detects velocity spikes, flags duplicate charges, catches location and merchant anomalies, supports user actions such as mark-safe/dispute/freeze-card, and keeps a full audit trail.

The stack is resume-friendly: React + TypeScript, Node/Express, Kafka-style event ingestion, Postgres snapshots/events, Redis snapshot caching, retryable jobs, deterministic rule scoring, and local memory fallbacks.

## What It Demonstrates

- Idempotent transaction event ingestion with stable `transactionId:eventId` keys.
- Stale update protection for late authorization, settlement, dispute, and card-freeze events.
- Deterministic fraud scoring from amount, category, location, card state, velocity windows, duplicate fingerprints, and daily limits.
- Duplicate transaction detection by card, merchant, amount, currency, and minute.
- Velocity-window detection for too many purchases in a short time.
- Alerts for high risk, large transactions, location anomalies, merchant/category anomalies, duplicates, card freezes, and disputes.
- Retryable jobs for risk scans, velocity rebuilds, alert dispatch, and retention.
- Memory-first adapters that can switch to Kafka, Postgres, and Redis through environment variables.

## Stack

- Frontend: React, TypeScript, Vite, lucide-react
- Backend: Node.js, Express, TypeScript
- Eventing: Kafka-compatible producer/consumer via `kafkajs`, with in-memory fallback
- Persistence: Postgres snapshots/events, with in-memory fallback
- Cache: Redis snapshot cache, with in-memory fallback
- Local orchestration: Docker Compose

## Run Locally

Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5343`.

## API

- `GET /api/health` - adapter mode and buffered message count
- `GET /api/snapshot` - current cards, transactions, rules, alerts, jobs, audit, and metrics
- `POST /api/events` - ingest a fraud event immediately
- `POST /api/events/publish` - publish an event to Kafka or the in-memory buffer
- `POST /api/kafka/drain` - drain buffered messages in memory mode
- `POST /api/jobs` - queue a job
- `POST /api/jobs/fail-next` - force the next job to retry
- `POST /api/jobs/drain` - process queued jobs
- `POST /api/reset` - restore seeded demo state

## Useful Events

```json
{
  "eventId": "auth-1",
  "transactionId": "tx-new",
  "type": "TRANSACTION_AUTHORIZED",
  "cardId": "card-primary",
  "merchant": "Camera Store",
  "category": "ELECTRONICS",
  "amount": 899.99,
  "currency": "USD",
  "city": "Chicago",
  "country": "US"
}
```

```json
{
  "eventId": "freeze-1",
  "transactionId": "tx-paris",
  "type": "CARD_FROZEN",
  "cardId": "card-primary"
}
```

## Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5343`
- API: `http://127.0.0.1:8343`
- Kafka-compatible Redpanda: `127.0.0.1:9125`
- Postgres: `127.0.0.1:5468`
- Redis: `127.0.0.1:6415`

## Verification

```bash
cd backend && npm test && npm run build
cd ../frontend && npm run build
docker compose config
```
