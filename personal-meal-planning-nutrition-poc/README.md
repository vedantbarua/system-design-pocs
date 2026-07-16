# Personal Meal Planning Nutrition POC

Everyday meal planning becomes a systems problem once plans, pantry inventory, groceries, nutrition goals, and reminders all change independently. This POC models that workflow with a React dashboard and a Node/Express API backed by Kafka-style events, Postgres snapshots, and Redis cache support.

The demo tracks weekly meals, recipe swaps, cooked and skipped meals, pantry consumption, grocery gaps, duplicate grocery entries, expiring ingredients, nutrition target drift, budget alerts, retryable jobs, and audit history.

## What It Demonstrates

- Idempotent meal event ingestion with stable `mealId:eventId` keys.
- Stale update protection for late recipe or meal-status events.
- Pantry-aware grocery gap rebuilding from planned meals.
- Duplicate grocery detection by normalized item and needed-by date.
- Nutrition scans for over-target calories/sodium and under-target protein/fiber.
- Budget and expiring ingredient alerts with alert dedupe keys.
- Retryable background jobs for meal scans, grocery rebuilds, reminders, and retention.
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

Open `http://127.0.0.1:5340`.

## API

- `GET /api/health` - adapter mode and buffered message count
- `GET /api/snapshot` - current meal plan, pantry, groceries, alerts, jobs, audit, and metrics
- `POST /api/events` - ingest a meal event immediately
- `POST /api/events/publish` - publish an event to Kafka or the in-memory buffer
- `POST /api/kafka/drain` - drain buffered messages in memory mode
- `POST /api/jobs` - queue a job
- `POST /api/jobs/fail-next` - force the next job to retry
- `POST /api/jobs/drain` - process queued jobs
- `POST /api/reset` - restore seeded demo state

## Useful Events

```json
{
  "eventId": "cook-1",
  "mealId": "meal-tacos",
  "type": "MEAL_COOKED"
}
```

```json
{
  "eventId": "swap-1",
  "mealId": "meal-pasta",
  "type": "RECIPE_SWAPPED",
  "recipe": "Chickpea pasta",
  "ingredients": ["chickpea pasta", "spinach", "tomato sauce"],
  "calories": 700,
  "protein": 44,
  "fiber": 18
}
```

## Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5340`
- API: `http://127.0.0.1:8340`
- Kafka-compatible Redpanda: `127.0.0.1:9122`
- Postgres: `127.0.0.1:5465`
- Redis: `127.0.0.1:6412`

## Verification

```bash
cd backend && npm test && npm run build
cd ../frontend && npm run build
docker compose config
```
