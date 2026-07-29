# Personal Grocery Price Compare POC

This POC models an everyday grocery price comparison tool. It tracks a grocery list, prices across stores, availability, substitutions, price drops, cheapest cart options, split-store recommendations, alert dispatch, and audit history.

The stack is resume-friendly and practical: React + TypeScript, Node/Express, Kafka-style event ingestion, Postgres snapshots/events, Redis snapshot caching, retryable jobs, deterministic cart optimization, and local memory fallbacks.

## What It Demonstrates

- Idempotent grocery and price event ingestion with stable `itemId:eventId` keys.
- Stale update protection for late item, price, availability, substitution, and store-selection events.
- Duplicate grocery detection by normalized item, brand, and unit.
- Cart total comparison across stores.
- Split-store recommendation with projected savings.
- Alerts for price drops, over-budget items, unavailable items, substitutions, duplicate list rows, and best-store changes.
- Retryable jobs for price refreshes, availability checks, recommendation rebuilds, alert dispatch, and retention.
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

Open `http://127.0.0.1:5344`.

## API

- `GET /api/health` - adapter mode and buffered message count
- `GET /api/snapshot` - current grocery list, stores, prices, recommendations, alerts, jobs, audit, and metrics
- `POST /api/events` - ingest a grocery price event immediately
- `POST /api/events/publish` - publish an event to Kafka or the in-memory buffer
- `POST /api/kafka/drain` - drain buffered messages in memory mode
- `POST /api/jobs` - queue a job
- `POST /api/jobs/fail-next` - force the next job to retry
- `POST /api/jobs/drain` - process queued jobs
- `POST /api/reset` - restore seeded demo state

## Useful Events

```json
{
  "eventId": "price-1",
  "itemId": "item-chicken",
  "type": "PRICE_UPDATED",
  "storeId": "store-market",
  "brand": "Store brand",
  "price": 4.99,
  "unit": "lb",
  "available": true
}
```

```json
{
  "eventId": "sub-1",
  "itemId": "item-apples",
  "type": "SUBSTITUTION_FOUND",
  "substituteItemId": "item-pears",
  "notes": "Pears are cheaper today."
}
```

## Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5344`
- API: `http://127.0.0.1:8344`
- Kafka-compatible Redpanda: `127.0.0.1:9126`
- Postgres: `127.0.0.1:5469`
- Redis: `127.0.0.1:6416`

## Verification

```bash
cd backend && npm test && npm run build
cd ../frontend && npm run build
docker compose config
```
