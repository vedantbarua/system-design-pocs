# Smart Pantry Inventory POC

React TypeScript, Node, Express, and Kafka proof-of-concept for household inventory and shopping coordination. It tracks lot-level stock, consumes earliest-expiring inventory first, builds a low-stock shopping projection, scans expiration risk, retries worker jobs, and records an audit trail.

## Goal

Show how an everyday pantry app can use an event-driven stock ledger and derived read models without hiding ordering, idempotency, expiration, or failure-handling concerns.

## What It Covers

- Idempotent stock events keyed by product and event ID
- Receive, consume, waste, and adjustment movements
- Lot-level quantities, locations, costs, and expiration dates
- First-expire-first-out consumption allocation
- Barcode lookup for known products
- Automatic low-stock shopping-list projection
- Manual shopping items and status transitions
- Scheduled expiration scans and projection rebuilds
- Retryable jobs with dead-letter-ready state
- Kafka, PostgreSQL, and Redis adapters with memory fallback
- Inventory metrics, worker controls, and audit history

## Quick Start

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5188`. The API defaults to `http://127.0.0.1:8188`.

## Run With Kafka, Postgres, And Redis

```bash
docker compose up -d
```

```bash
cd backend
PANTRY_KAFKA_BROKERS=127.0.0.1:9096 \
PANTRY_DATABASE_URL=postgres://pantry:pantry@127.0.0.1:5439/smart_pantry \
PANTRY_REDIS_URL=redis://127.0.0.1:6386 \
npm run dev
```

Then run the frontend normally.

## Demo Flow

1. Review on-hand units, inventory value, low-stock counts, and near-expiry lots.
2. Open Inventory and consume oat milk to observe FEFO lot allocation.
3. Consume coffee until it reaches its threshold and inspect the generated shopping item.
4. Add a manual shopping item and move it through needed, in-cart, and bought states.
5. Record a replenishment and see the matching low-stock item resolve.
6. Queue an expiration scan and a shopping projection rebuild.
7. Arm a worker failure, drain jobs, and inspect retry recovery.
8. Publish a stock event through memory Kafka, drain the broker, and review the audit stream.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Shows Kafka, PostgreSQL, Redis, and broker-buffer status. |
| `GET` | `/api/snapshot` | Returns inventory, lots, events, shopping items, jobs, audits, and metrics. |
| `GET` | `/api/products/barcode/:barcode` | Resolves a known barcode to a product. |
| `POST` | `/api/stock/events` | Applies a stock event and publishes it to the configured broker. |
| `POST` | `/api/stock/events/publish` | Publishes a stock event without applying it synchronously. |
| `POST` | `/api/kafka/drain` | Drains buffered memory-broker events. |
| `POST` | `/api/shopping-items` | Adds a manual shopping item. |
| `PATCH` | `/api/shopping-items/:id` | Changes shopping status. |
| `POST` | `/api/scans/expiration` | Runs an immediate expiration scan. |
| `POST` | `/api/jobs/expiration` | Queues an expiration scan. |
| `POST` | `/api/jobs/shopping-rebuild` | Queues a shopping projection rebuild. |
| `POST` | `/api/jobs/fail-next` | Makes the next job attempt fail once. |
| `POST` | `/api/jobs/tick` | Processes one queued or retryable job. |
| `POST` | `/api/jobs/drain` | Drains available jobs. |
| `POST` | `/api/reset` | Restores seeded demo state. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8188` | API port. |
| `HOST` | `127.0.0.1` | API host. |
| `PANTRY_STOCK_TOPIC` | `pantry.stock.events` | Kafka stock-event topic. |
| `PANTRY_KAFKA_BROKERS` | `memory://` | Comma-separated Kafka brokers. |
| `PANTRY_KAFKA_GROUP` | `smart-pantry-poc` | Consumer group ID. |
| `PANTRY_DATABASE_URL` | `memory://` | PostgreSQL connection string. |
| `PANTRY_REDIS_URL` | `memory://` | Redis connection string. |

## Notes And Limitations

- Redpanda provides a compact Kafka-compatible local broker.
- Memory mode is seeded and runnable without Docker.
- The POC stores a JSON snapshot in PostgreSQL while separately appending idempotent stock events.
- Product creation and a real barcode catalog are intentionally out of scope.
- Quantities use JavaScript numbers; production financial and measured quantities need decimal types.

## Technologies Used

- React 19
- TypeScript
- Vite
- Node.js
- Express 5
- KafkaJS
- PostgreSQL
- Redis
- Redpanda
