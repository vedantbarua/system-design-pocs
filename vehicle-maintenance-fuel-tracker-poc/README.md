# Vehicle Maintenance And Fuel Tracker POC

React TypeScript, Node, Express, and Kafka proof-of-concept for vehicle telemetry, fuel economy, and service scheduling. It accepts delayed events, quarantines impossible odometer regressions, rebuilds ordered projections, calculates full-tank MPG, scans time and mileage service rules, and retries worker jobs.

## Goal

Show how an everyday vehicle log can preserve ordered telemetry and derive trustworthy maintenance and fuel projections from duplicate and out-of-order events.

## What It Covers

- Idempotent odometer, fuel-fill, and service events
- Event-time ordering with separate receive timestamps
- Quarantine of chronological odometer regressions
- Deterministic telemetry projection rebuilding
- Full-tank fuel economy and cost-per-gallon calculations
- Rolling fuel-economy anomaly detection
- Mileage- and time-based service schedules
- Deduplicated reminders and service completion history
- Kafka, PostgreSQL, and Redis adapters with memory fallback
- Retryable workers and audit history

## Quick Start

```bash
cd backend && npm install && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Open `http://127.0.0.1:5191`. The API defaults to `http://127.0.0.1:8191`.

## Run With Infrastructure

```bash
docker compose up -d
```

```bash
VEHICLE_KAFKA_BROKERS=127.0.0.1:9099 \
VEHICLE_DATABASE_URL=postgres://vehicle:vehicle@127.0.0.1:5442/vehicle_tracker \
VEHICLE_REDIS_URL=redis://127.0.0.1:6389 npm run dev
```

## Demo Flow

1. Review mileage, MPG, service attention, and ownership costs.
2. Record a current odometer or full-tank fuel event.
3. Publish a delayed lower-mileage reading with an earlier event time and rebuild successfully.
4. Record a later event below current mileage and inspect its quarantine reason.
5. Complete a due service and see its time and mileage baselines advance.
6. Queue telemetry, service, anomaly, and reminder workers.
7. Simulate a worker failure and drain the retry queue.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Adapter and broker status. |
| `GET` | `/api/snapshot` | Vehicle, telemetry, fuel, service, job, and audit projections. |
| `POST` | `/api/events` | Applies and publishes a vehicle event. |
| `POST` | `/api/events/publish` | Publishes an event asynchronously. |
| `POST` | `/api/kafka/drain` | Replays memory-broker events. |
| `POST` | `/api/services/:id/complete` | Records completed maintenance. |
| `POST` | `/api/jobs` | Queues projection work. |
| `POST` | `/api/jobs/fail-next` | Simulates one failed attempt. |
| `POST` | `/api/jobs/drain` | Drains retryable work. |
| `POST` | `/api/reset` | Restores demo state. |

## Configuration

`PORT` defaults to `8191`; `VEHICLE_EVENT_TOPIC` defaults to `vehicle.telemetry.events`. `VEHICLE_KAFKA_BROKERS`, `VEHICLE_DATABASE_URL`, and `VEHICLE_REDIS_URL` default to `memory://`.

## Notes And Limitations

- Fuel economy requires consecutive full-tank fills.
- One seeded vehicle and miles/US gallons are modeled.
- PostgreSQL stores a snapshot plus append-only events.
- Real OBD-II, receipt upload, VIN decoding, and notification providers are out of scope.

## Technologies Used

- React 19, TypeScript, Vite
- Node.js, Express 5
- KafkaJS, Redpanda, PostgreSQL, Redis
