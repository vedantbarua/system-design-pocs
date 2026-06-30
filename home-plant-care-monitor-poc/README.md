# Home Plant Care Monitor POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for coordinating plant care from sensor readings and manual watering events.

## What It Demonstrates

- Idempotent plant sensor and watering event ingestion
- Moisture, light, temperature, and stale sensor projections
- Dry plant, overwatering, low light, missed watering, and stale sensor alerts
- Reminder dedupe and retryable dispatch jobs
- Postgres event/snapshot persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for plant status, upcoming care, events, jobs, and audits

## Run Locally

```bash
cd home-plant-care-monitor-poc/backend
npm install
npm run dev
```

```bash
cd home-plant-care-monitor-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5198`.

## Run With Infrastructure

```bash
cd home-plant-care-monitor-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5198`
- API: `http://127.0.0.1:8198`
- Kafka/Redpanda: `127.0.0.1:9106`
- Postgres: `127.0.0.1:5449`
- Redis: `127.0.0.1:6396`

## API Shape

- `GET /api/health`
- `GET /api/snapshot`
- `POST /api/events`
- `POST /api/events/publish`
- `POST /api/kafka/drain`
- `POST /api/jobs`
- `POST /api/jobs/drain`
- `POST /api/reset`

Example:

```bash
curl -X POST http://127.0.0.1:8198/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"manual-water","plantId":"plant-monstera","sensorId":"sensor-monstera","type":"WATERED","moisturePct":52,"lightLux":1200,"temperatureF":72}'
```
