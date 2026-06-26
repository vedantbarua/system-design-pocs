# Home Air Quality Monitor POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for monitoring room-level indoor air quality from distributed sensors.

## Why This Exists

Indoor air sensors are noisy distributed devices. They can report duplicate readings, sync late, go stale, or spike briefly during cooking, cleaning, poor ventilation, or purifier failures. This POC shows how to ingest those events, rebuild room health projections, and create actionable alerts without spamming the household.

## What It Demonstrates

- Event-time sensor reading ingestion with Kafka-compatible buffering
- Idempotent `{sensorId}:{eventId}` keys for duplicate protection
- Rolling room rollups for PM2.5, CO2, VOC, humidity, temperature, and score
- Stale sensor detection from last-seen timestamps
- Incident correlation for particulate spikes, CO2 buildup, VOC spikes, humidity drift, and stale sensors
- Alert deduplication and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for rooms, readings, alerts, recommendations, and operations

## Run Locally

Backend:

```bash
cd home-air-quality-monitor-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd home-air-quality-monitor-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5194`.

## Run With Infrastructure

```bash
cd home-air-quality-monitor-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5194`
- API: `http://127.0.0.1:8194`
- Kafka/Redpanda: `127.0.0.1:9102`
- Postgres: `127.0.0.1:5445`
- Redis: `127.0.0.1:6392`

## API Shape

- `GET /api/health` returns adapter mode and buffered Kafka messages
- `GET /api/snapshot` returns rooms, sensors, readings, rollups, incidents, alerts, recommendations, jobs, and audit entries
- `POST /api/readings` ingests and publishes a sensor reading immediately
- `POST /api/readings/publish` only queues a sensor reading
- `POST /api/kafka/drain` drains the in-memory Kafka fallback
- `POST /api/jobs` queues an operational job
- `POST /api/jobs/drain` processes queued jobs
- `POST /api/reset` restores seeded demo data

## Demo Flow

1. Open the overview to inspect home score, PM2.5, CO2, stale sensors, and recommendations.
2. Review room rollups to compare room health and sensor freshness.
3. Open the reading stream to inspect raw event-time readings.
4. Queue and drain jobs in Operations to exercise rebuilds, retries, retention, and alert dispatch.
5. Publish a late high-CO2 or PM2.5 reading and drain Kafka to verify deterministic incident rebuilds.

Example reading:

```bash
curl -X POST http://127.0.0.1:8194/api/readings \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-spike","roomId":"room-office","sensorId":"sensor-office","type":"MEASUREMENT","pm25":61,"co2Ppm":1450,"vocIndex":640,"humidityPct":47,"temperatureF":72,"observedAt":"2026-06-26T14:45:00Z"}'
```

## Tradeoffs

This is intentionally a POC. It uses a compact in-process projection engine and JSON snapshots rather than a dedicated stream processor. The important behaviors are explicit: duplicate handling, late event replay, stale sensor detection, alert dedupe, and job retries.
