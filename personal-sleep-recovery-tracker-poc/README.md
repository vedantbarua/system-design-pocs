# Personal Sleep Recovery Tracker POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for ingesting wearable sleep events, rebuilding sleep sessions, and turning nightly recovery signals into practical recommendations.

## Why This Exists

Sleep data is messy in realistic products. Watches, rings, and phones can sync late, send duplicate events, or report a wake event before the matching sleep-start event reaches the backend. This POC makes that behavior visible with a deterministic projection engine and a dashboard built around everyday recovery questions.

## What It Demonstrates

- Event-time wearable ingestion with Kafka-compatible buffering
- Idempotent event keys for duplicate device syncs
- Rebuilt sleep and nap sessions from out-of-order events
- Daily recovery rollups with sleep debt, consistency, and recovery scores
- Alert deduplication for short-sleep streaks, irregular bedtimes, and recovery drops
- Retryable operational jobs for rebuilds, retention, alert dispatch, and recommendation refreshes
- Postgres snapshot/event persistence and Redis snapshot caching with in-memory fallback

## Run Locally

Backend:

```bash
cd personal-sleep-recovery-tracker-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd personal-sleep-recovery-tracker-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5193`.

## Run With Infrastructure

```bash
cd personal-sleep-recovery-tracker-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5193`
- API: `http://127.0.0.1:8193`
- Kafka/Redpanda: `127.0.0.1:9101`
- Postgres: `127.0.0.1:5444`
- Redis: `127.0.0.1:6391`

## API Shape

- `GET /api/health` returns adapter mode and buffered Kafka messages
- `GET /api/snapshot` returns devices, events, sessions, recovery rollups, alerts, recommendations, jobs, and audit entries
- `POST /api/events` ingests and publishes a wearable event immediately
- `POST /api/events/publish` only queues a wearable event
- `POST /api/kafka/drain` drains the in-memory Kafka fallback
- `POST /api/jobs` queues an operational job
- `POST /api/jobs/drain` processes queued jobs
- `POST /api/reset` restores seeded demo data

## Demo Flow

1. Open the overview to inspect recovery score, sleep debt, and weekly trend.
2. Review rebuilt sessions to see night sleep and naps paired from event-time data.
3. Open the event stream to inspect raw wearable events.
4. Queue and drain jobs in Operations to exercise retries, alert dispatch, and rebuild behavior.
5. Publish out-of-order events through the API and drain Kafka to verify deterministic replay.

Example out-of-order event:

```bash
curl -X POST http://127.0.0.1:8193/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-start","userId":"user-ava","deviceId":"device-ring","type":"SLEEP_START","occurredAt":"2026-06-26T03:15:00Z","quality":88}'
```

## Tradeoffs

This is intentionally a POC. It uses one user profile, compact projection rebuilds, and JSON snapshots instead of production-grade stream processors. The important behavior is still realistic: every duplicate, late event, retention run, and alert dispatch has an explicit system path.
