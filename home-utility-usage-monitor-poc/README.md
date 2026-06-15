# Home Utility Usage Monitor POC

React TypeScript, Node, Express, and Kafka proof-of-concept for an everyday home utility monitor. It ingests smart-meter readings, projects hourly and daily usage, detects spikes/leaks/missing readings, and sends retryable alert notifications.

The demo runs fully in memory by default. Docker Compose adds Kafka-compatible Redpanda, TimescaleDB/PostgreSQL, and Redis so the same API can exercise a more realistic event and persistence stack.

## What It Shows

- Kafka-style meter event ingestion keyed by `meterId`
- Idempotent readings with duplicate suppression and correction events
- Hourly and daily usage rollups for electricity and water meters
- Anomaly detection for spikes, overnight water leaks, stale meters, and budget risk
- Retryable notification jobs with delivery dedupe
- React dashboard for utility spend, usage charts, Kafka buffering, alerts, and audit history
- Memory fallback when Kafka, PostgreSQL, or Redis are not running

## Architecture

```text
React dashboard
      |
      v
Express API
      |
      +--> KafkaJS producer/consumer or in-memory broker
      |
      +--> UtilityMonitor domain core
      |       - ingest readings
      |       - recompute projections
      |       - detect anomalies
      |       - enqueue notification jobs
      |
      +--> PostgreSQL/TimescaleDB snapshot + readings table or memory
      |
      +--> Redis hot snapshot/job mirror or memory
```

## Run In Memory

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

Open `http://127.0.0.1:5184`. The API defaults to `http://127.0.0.1:8184`.

## Run With Kafka, TimescaleDB, And Redis

Start infrastructure:

```bash
docker compose up -d
```

Start the backend with infrastructure URLs:

```bash
cd backend
UTILITY_KAFKA_BROKERS=127.0.0.1:9092 \
UTILITY_DATABASE_URL=postgres://utility:utility@127.0.0.1:5435/utility_monitor \
UTILITY_REDIS_URL=redis://127.0.0.1:6382 \
npm run dev
```

Then start the frontend normally:

```bash
cd frontend
npm run dev
```

## Demo Flow

1. Open the overview and inspect electricity/water usage, cost, and open alerts.
2. Go to Kafka stream and publish a late reading.
3. In memory mode, click drain memory Kafka. In Kafka mode, the background KafkaJS consumer ingests it.
4. Publish a correction for the overnight water reading and watch the rollup change.
5. Run anomaly detection to create missing-reading or usage alerts.
6. Go to Alerts, fail the next notification, then drain workers to see retry behavior.
7. Acknowledge an alert and inspect the audit trail.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Shows memory/Kafka/PostgreSQL/Redis mode and buffered messages. |
| `GET` | `/api/snapshot` | Returns household, meters, readings, rollups, alerts, jobs, deliveries, and audit history. |
| `POST` | `/api/readings` | Publishes and ingests a reading immediately. |
| `POST` | `/api/readings/publish` | Publishes a reading to Kafka or the memory broker. |
| `POST` | `/api/kafka/drain` | Drains memory broker messages. |
| `POST` | `/api/anomalies/run` | Runs anomaly detection for a supplied `asOf` timestamp. |
| `POST` | `/api/reprocess` | Rebuilds rollups for a meter and time range. |
| `POST` | `/api/alerts/:alertId/acknowledge` | Acknowledges an open alert. |
| `POST` | `/api/workers/fail-next` | Arms the notification worker to fail once. |
| `POST` | `/api/workers/drain` | Processes pending notification jobs. |
| `POST` | `/api/reset` | Restores the seeded demo state. |

## Useful Commands

Backend:

```bash
npm run build
npm test
npm audit --audit-level=moderate
```

Frontend:

```bash
npm run build
npm audit --audit-level=moderate
```

## Notes

- Redpanda is used as the local Kafka-compatible broker because it keeps the POC compose file small.
- TimescaleDB is optional. If the extension cannot be enabled, the backend continues with regular PostgreSQL tables.
- Kafka message ordering is modeled by keying readings with `meterId`.
- Corrections supersede the original reading and trigger projection recomputation for the affected day.
