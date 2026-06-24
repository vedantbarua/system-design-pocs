# Home Network Health Monitor POC

React TypeScript, Node, Express, and Kafka proof-of-concept for event-time connectivity telemetry, rolling quality windows, outage correlation, alert deduplication, retention, and replayable projections.

## Goal

Turn noisy and delayed home-network probes into trustworthy quality metrics and actionable incidents.

## What It Covers

- Idempotent ping, DNS, and heartbeat ingestion
- Availability, latency, loss, and quality rollups
- Delayed event-time telemetry
- Failure grouping and recovery detection
- Deduplicated outage and recovery alerts
- Retention and retryable projection jobs
- Kafka, PostgreSQL, and Redis adapters with memory fallback

## Quick Start

Run `npm install && npm run dev` in `backend`, then in `frontend`. Open `http://127.0.0.1:5192`; the API uses `8192`.

## Run With Infrastructure

Run `docker compose up -d`, then configure `NETWORK_KAFKA_BROKERS=127.0.0.1:9100`, `NETWORK_DATABASE_URL=postgres://network:network@127.0.0.1:5443/network_health`, and `NETWORK_REDIS_URL=redis://127.0.0.1:6390`.

## Demo Flow

Review WAN quality and target rollups, ingest failures followed by recovery, inspect one correlated incident, replay delayed probes, queue projection jobs, and simulate retry recovery.

## API

`GET /api/health`, `GET /api/snapshot`, `POST /api/probes`, `POST /api/probes/publish`, `POST /api/kafka/drain`, `POST /api/jobs`, `POST /api/jobs/fail-next`, `POST /api/jobs/drain`, and `POST /api/reset`.

## Configuration

`PORT` defaults to `8192`; the topic defaults to `home.network.probes`. Infrastructure URLs default to `memory://`.

## Notes And Limitations

The POC uses synthetic probes, fixed 15-minute windows, and one seeded network. Real probe agents, TimescaleDB hypertables, authentication, and notification providers are out of scope.

## Technologies Used

React 19, TypeScript, Vite, Node.js, Express 5, KafkaJS, Redpanda, PostgreSQL, and Redis.
