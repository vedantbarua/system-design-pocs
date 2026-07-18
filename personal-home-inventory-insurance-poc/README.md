# Personal Home Inventory Insurance POC

This POC models a practical household inventory system for insurance readiness. It helps a homeowner or renter track valuable items, proof of ownership, replacement value, policy coverage, duplicate records, and export bundles before a claim is needed.

The demo includes a React dashboard and a Node/Express API with Kafka-style events, Postgres snapshots/events, Redis snapshot caching, retryable jobs, and memory fallbacks so it runs without infrastructure.

## What It Demonstrates

- Idempotent inventory event ingestion with stable `itemId:eventId` keys.
- Stale update protection for late item, location, valuation, and coverage events.
- Duplicate item detection by normalized category plus serial number or item name.
- Missing proof alerts for high-value items without receipts, photos, appraisals, or serial cards.
- Underinsurance and policy-gap scans by replacement value, coverage limit, and covered category.
- Insurance-ready export bundles with checksums.
- Retryable jobs for inventory scans, valuation refreshes, export generation, reminders, and retention.
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

Open `http://127.0.0.1:5341`.

## API

- `GET /api/health` - adapter mode and buffered message count
- `GET /api/snapshot` - current items, proofs, policies, exports, alerts, jobs, audit, and metrics
- `POST /api/events` - ingest an inventory event immediately
- `POST /api/events/publish` - publish an event to Kafka or the in-memory buffer
- `POST /api/kafka/drain` - drain buffered messages in memory mode
- `POST /api/jobs` - queue a job
- `POST /api/jobs/fail-next` - force the next job to retry
- `POST /api/jobs/drain` - process queued jobs
- `POST /api/reset` - restore seeded demo state

## Useful Events

```json
{
  "eventId": "proof-1",
  "itemId": "item-bike",
  "type": "PROOF_ATTACHED",
  "proofKind": "RECEIPT",
  "proofLabel": "Bike shop receipt"
}
```

```json
{
  "eventId": "coverage-1",
  "itemId": "item-tv",
  "type": "COVERAGE_UPDATED",
  "policyId": "policy-home",
  "coverageLimit": 2200
}
```

## Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5341`
- API: `http://127.0.0.1:8341`
- Kafka-compatible Redpanda: `127.0.0.1:9123`
- Postgres: `127.0.0.1:5466`
- Redis: `127.0.0.1:6413`

## Verification

```bash
cd backend && npm test && npm run build
cd ../frontend && npm run build
docker compose config
```
