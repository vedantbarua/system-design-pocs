# Household Chore Coordinator POC

React TypeScript, Node, Express, and Kafka proof-of-concept for recurring household work. It materializes chore occurrences, balances assignments by effort, coordinates task claims with expiring leases and fencing tokens, replays offline completions, escalates overdue work, and exposes worker behavior.

## Goal

Show how a shared household task app can handle recurrence, concurrent claims, offline updates, fair assignment, reminders, and repairable projections without reducing the system to basic CRUD.

## What It Covers

- Recurring chore definitions and bounded occurrence materialization
- Idempotent occurrence keys and completion events
- Fair assignment based on current open effort points
- Expiring task claims with monotonically increasing fencing tokens
- Stale offline completion rejection after lease takeover
- Kafka-backed completion ingestion and memory-broker replay
- Overdue detection, escalation levels, and deduplicated reminders
- Retryable scheduler, scanner, notification, and projection jobs
- PostgreSQL event/snapshot persistence and Redis projection hooks
- Workload metrics, operational controls, and audit history

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

Open `http://127.0.0.1:5189`. The API defaults to `http://127.0.0.1:8189`.

## Run With Kafka, Postgres, And Redis

```bash
docker compose up -d
```

```bash
cd backend
CHORE_KAFKA_BROKERS=127.0.0.1:9097 \
CHORE_DATABASE_URL=postgres://chores:chores@127.0.0.1:5440/chore_coordinator \
CHORE_REDIS_URL=redis://127.0.0.1:6387 \
npm run dev
```

Then run the frontend normally.

## Demo Flow

1. Review today’s open, overdue, claimed, and completed counts.
2. Switch the acting household member and claim an available chore.
3. Complete the chore with the current fencing token.
4. Claim another chore and queue its completion offline.
5. Open Operations and replay the buffered completion event.
6. Add a recurring routine and inspect its materialized schedule.
7. Review workload points and assignment distribution across members.
8. Queue overdue, reminder, and materialization jobs.
9. Arm a worker failure, drain jobs, and inspect retry recovery.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Shows Kafka, PostgreSQL, Redis, and buffered-event status. |
| `GET` | `/api/snapshot` | Returns routines, tasks, leases, workload, reminders, jobs, and audits. |
| `POST` | `/api/definitions` | Creates a recurring chore and materializes its near-term tasks. |
| `POST` | `/api/materialize` | Materializes an idempotent schedule window immediately. |
| `POST` | `/api/tasks/:id/claim` | Acquires or renews an expiring task lease. |
| `POST` | `/api/tasks/:id/release` | Releases a claim using its fencing token. |
| `POST` | `/api/completions` | Applies and publishes a completion event. |
| `POST` | `/api/completions/publish` | Queues an offline completion without applying it. |
| `POST` | `/api/kafka/drain` | Replays buffered memory-broker completions. |
| `POST` | `/api/scans/overdue` | Detects overdue work and queues deduplicated reminders. |
| `POST` | `/api/jobs` | Queues a scheduler, scanner, notification, or projection job. |
| `POST` | `/api/jobs/fail-next` | Makes the next job attempt fail once. |
| `POST` | `/api/jobs/tick` | Processes one queued or retryable job. |
| `POST` | `/api/jobs/drain` | Drains available jobs. |
| `POST` | `/api/reset` | Restores seeded demo state. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8189` | API port. |
| `HOST` | `127.0.0.1` | API host. |
| `CHORE_COMPLETION_TOPIC` | `chores.task.completions` | Kafka completion topic. |
| `CHORE_KAFKA_BROKERS` | `memory://` | Comma-separated Kafka brokers. |
| `CHORE_KAFKA_GROUP` | `household-chore-coordinator-poc` | Consumer group ID. |
| `CHORE_DATABASE_URL` | `memory://` | PostgreSQL connection string. |
| `CHORE_REDIS_URL` | `memory://` | Redis connection string. |

## Notes And Limitations

- Redpanda provides a compact Kafka-compatible local broker.
- Memory mode is seeded and runnable without Docker.
- PostgreSQL stores a JSON snapshot and an append-only completion-event table.
- Recurrence uses fixed day intervals rather than a full calendar-rule library.
- One seeded household is modeled; authentication and invitations are out of scope.
- Jobs run in the API process for inspectability.

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
