# Personal Backup Sync POC

React TypeScript, Node, Express, and Kafka proof-of-concept for a personal backup and sync system similar to a small iCloud or Google Drive backend. It models file change ingestion, chunked content-addressable storage, deduplication, snapshots, restore jobs, conflicts, retries, retention, and audit history.

## Goal

Show how file backup systems can turn noisy device changes into durable manifests and restoreable snapshots while keeping uploads idempotent and storage efficient.

## What It Covers

- Kafka-style file change events keyed by device
- Chunked uploads using SHA-256 content hashes
- Chunk deduplication and reference counts
- File version manifests and superseded versions
- Cross-device conflict detection and resolution
- Point-in-time snapshots and restore jobs
- Retryable sync queue with failure simulation
- Retention pruning for old file versions
- PostgreSQL persistence and Redis queue mirroring when configured
- Memory fallback for fast local demos and tests

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

Open `http://127.0.0.1:5186`. The API defaults to `http://127.0.0.1:8186`.

## Run With Kafka, Postgres, And Redis

```bash
docker compose up -d
```

```bash
cd backend
BACKUP_KAFKA_BROKERS=127.0.0.1:9094 \
BACKUP_DATABASE_URL=postgres://backup:backup@127.0.0.1:5437/personal_backup \
BACKUP_REDIS_URL=redis://127.0.0.1:6384 \
npm run dev
```

Then run the frontend normally.

## Demo Flow

1. Inspect storage usage, dedupe savings, backup clients, and active files.
2. Publish a new photo or note edit from the Files tab.
3. Drain memory Kafka to ingest the buffered change.
4. Drain sync jobs to complete chunk upload work.
5. Trigger a conflict on `/Documents/budget.xlsx` from another device.
6. Resolve the conflict from the Sync queue tab.
7. Create a snapshot and queue a restore to the iPad.
8. Fail the next job and drain again to observe retry behavior.
9. Prune old versions and inspect the audit log.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Shows memory/Kafka/Postgres/Redis mode and buffered messages. |
| `GET` | `/api/snapshot` | Returns devices, chunks, versions, snapshots, jobs, conflicts, audit, and metrics. |
| `POST` | `/api/changes` | Publishes and ingests a file change immediately. |
| `POST` | `/api/changes/publish` | Publishes a file change to Kafka or the memory broker. |
| `POST` | `/api/kafka/drain` | Drains memory broker events. |
| `POST` | `/api/jobs/fail-next` | Makes the next sync job fail once. |
| `POST` | `/api/jobs/tick` | Processes one queued or retry job. |
| `POST` | `/api/jobs/drain` | Processes queued sync jobs. |
| `POST` | `/api/snapshots` | Creates a point-in-time snapshot for a device. |
| `POST` | `/api/snapshots/:snapshotId/restore` | Queues a restore job to a target device. |
| `POST` | `/api/conflicts/:conflictId/resolve` | Resolves a conflict by selecting a winning version. |
| `POST` | `/api/retention/prune` | Prunes older non-snapshot-pinned versions. |
| `POST` | `/api/replay` | Rebuilds upload jobs for existing versions in a time range. |
| `POST` | `/api/reset` | Restores seeded demo state. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8186` | API port. |
| `HOST` | `127.0.0.1` | API host. |
| `BACKUP_CHANGE_TOPIC` | `backup.file.changes` | Kafka topic for file change events. |
| `BACKUP_KAFKA_BROKERS` | `memory://` | Comma-separated Kafka brokers. |
| `BACKUP_DATABASE_URL` | `memory://` | PostgreSQL connection string. |
| `BACKUP_REDIS_URL` | `memory://` | Redis connection string. |

## Notes And Limitations

- Redpanda is used as a compact Kafka-compatible local broker.
- Chunk objects are represented by metadata only; binary object bytes are simulated by content hashes.
- The API hosts the Kafka consumer for the POC. Production would split consumers and workers.
- Conflict detection is path-based and deterministic, not a full sync protocol.
- Authentication, encryption, and real filesystem watchers are intentionally out of scope.

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
