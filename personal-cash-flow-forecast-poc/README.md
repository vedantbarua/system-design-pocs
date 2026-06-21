# Personal Cash Flow Forecast POC

React TypeScript, Node, Express, and Kafka proof-of-concept for bank transaction reconciliation and short-term balance forecasting. It ingests idempotent bank events, replaces pending charges with posted transactions, detects recurring cash flow, tracks budgets, rebuilds projections, and records operational history.

## Goal

Show how a personal finance app can maintain ledger integrity while handling duplicate, delayed, pending, and out-of-order bank events and deriving explainable forecasts.

## What It Covers

- Integer-cent financial calculations
- Idempotent provider event ingestion
- Pending-to-posted transaction reconciliation
- Stale pending-event rejection after posted state
- Priority-based merchant categorization
- Monthly recurring income and expense detection
- Available versus posted account balances
- Monthly category budgets and alert thresholds
- 30-day projected balance timeline
- Retryable categorization, recurrence, forecast, and budget jobs
- Kafka, PostgreSQL, and Redis adapters with memory fallback

## Quick Start

```bash
cd backend && npm install && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Open `http://127.0.0.1:5190`. The API defaults to `http://127.0.0.1:8190`.

## Run With Kafka, Postgres, And Redis

```bash
docker compose up -d
```

```bash
cd backend
CASHFLOW_KAFKA_BROKERS=127.0.0.1:9098 \
CASHFLOW_DATABASE_URL=postgres://cashflow:cashflow@127.0.0.1:5441/cashflow \
CASHFLOW_REDIS_URL=redis://127.0.0.1:6388 \
npm run dev
```

## Demo Flow

1. Compare posted and available balances with the seeded pending charge.
2. Ingest a pending purchase and inspect its automatic category.
3. Post a replacement transaction referencing the pending provider ID.
4. Verify the pending row becomes reconciled and is not double-counted.
5. Inspect detected payroll and rent patterns and the forecast timeline.
6. Review current-month category budget pace.
7. Queue projection jobs, simulate one failure, and drain the retry queue.
8. Publish a bank event asynchronously and drain the memory broker.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Returns adapter modes and broker backlog. |
| `GET` | `/api/snapshot` | Returns accounts, ledger, budgets, recurrence, forecast, jobs, and audits. |
| `POST` | `/api/transactions` | Applies and publishes a bank transaction event. |
| `POST` | `/api/transactions/publish` | Publishes an event without synchronous application. |
| `POST` | `/api/kafka/drain` | Replays buffered memory-broker events. |
| `POST` | `/api/rebuild/categories` | Reapplies category rules. |
| `POST` | `/api/rebuild/recurring` | Rebuilds recurring patterns. |
| `POST` | `/api/rebuild/forecast` | Rebuilds the balance forecast. |
| `POST` | `/api/jobs` | Queues a projection job. |
| `POST` | `/api/jobs/fail-next` | Fails the next job attempt once. |
| `POST` | `/api/jobs/tick` | Processes one job attempt. |
| `POST` | `/api/jobs/drain` | Drains available jobs. |
| `POST` | `/api/reset` | Restores seeded state. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8190` | API port. |
| `HOST` | `127.0.0.1` | API host. |
| `CASHFLOW_TRANSACTION_TOPIC` | `cashflow.bank.transactions` | Kafka transaction topic. |
| `CASHFLOW_KAFKA_BROKERS` | `memory://` | Kafka brokers. |
| `CASHFLOW_KAFKA_GROUP` | `personal-cash-flow-poc` | Consumer group. |
| `CASHFLOW_DATABASE_URL` | `memory://` | PostgreSQL URL. |
| `CASHFLOW_REDIS_URL` | `memory://` | Redis URL. |

## Notes And Limitations

- Seeded memory mode runs without Docker or external credentials.
- Recurrence detection uses repeated normalized merchants with 20-40 day cadence.
- Forecasts extend detected patterns and are not financial advice.
- PostgreSQL stores a snapshot plus append-only transaction events.
- Bank authentication, transfers, multi-currency support, and real provider APIs are out of scope.

## Technologies Used

- React 19, TypeScript, Vite
- Node.js, Express 5
- KafkaJS and Redpanda
- PostgreSQL and Redis
