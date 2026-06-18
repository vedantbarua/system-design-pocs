# Personal Knowledge Index POC

React TypeScript, Node, Express, and Kafka proof-of-concept for a personal document search and indexing system. It ingests documents, builds an inspectable local index, supports keyword and semantic-style search, enforces access rules, detects stale documents, retries indexing jobs, and records search audit history.

## Goal

Show how a personal knowledge system can turn notes, bookmarks, PDFs, and snippets into a searchable index with incremental updates, replayable jobs, access controls, and query caching.

## What It Covers

- Kafka-style document change ingestion
- Content-hash deduplication for repeated document events
- Incremental document indexing
- Local full-text index simulation
- Semantic-style vector search simulation
- Hybrid ranking from keyword and vector scores
- Private/shared/work document visibility
- Explicit read grants
- Query caching and search audit history
- Stale document scans and index rebuild jobs
- PostgreSQL persistence and Redis queue/cache hooks with memory fallback

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

Open `http://127.0.0.1:5187`. The API defaults to `http://127.0.0.1:8187`.

## Run With Kafka, Postgres, And Redis

```bash
docker compose up -d
```

```bash
cd backend
KNOWLEDGE_KAFKA_BROKERS=127.0.0.1:9095 \
KNOWLEDGE_DATABASE_URL=postgres://knowledge:knowledge@127.0.0.1:5438/knowledge_index \
KNOWLEDGE_REDIS_URL=redis://127.0.0.1:6385 \
npm run dev
```

Then run the frontend normally.

## Demo Flow

1. Inspect indexed documents, stale counts, grants, and queue depth.
2. Search for `Kafka replay` as `vedant` in hybrid mode.
3. Search for private finance terms as `maya` and see access filtering.
4. Publish a new note or bookmark from Documents.
5. Drain memory Kafka, then drain index jobs.
6. Grant Maya access to a private document and rerun the query.
7. Fail the next index job and drain again to observe retry behavior.
8. Queue a full rebuild and review audit history.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Shows memory/Kafka/Postgres/Redis mode and buffered messages. |
| `GET` | `/api/snapshot` | Returns documents, index entries, jobs, grants, search audits, audit log, and metrics. |
| `POST` | `/api/documents` | Publishes and ingests a document immediately. |
| `POST` | `/api/documents/publish` | Publishes a document change to Kafka or the memory broker. |
| `POST` | `/api/kafka/drain` | Drains memory broker document changes. |
| `GET` | `/api/search` | Runs keyword, semantic, or hybrid search with access filtering. |
| `POST` | `/api/jobs/fail-next` | Makes the next indexing job fail once. |
| `POST` | `/api/jobs/tick` | Processes one queued/retry index job. |
| `POST` | `/api/jobs/drain` | Processes queued index jobs. |
| `POST` | `/api/index/rebuild` | Queues a full index rebuild. |
| `POST` | `/api/stale-scan` | Marks stale documents and queues reindex work. |
| `POST` | `/api/grants` | Grants read access to a document. |
| `POST` | `/api/reset` | Restores seeded demo state. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8187` | API port. |
| `HOST` | `127.0.0.1` | API host. |
| `KNOWLEDGE_DOCUMENT_TOPIC` | `knowledge.document.changes` | Kafka topic for document changes. |
| `KNOWLEDGE_KAFKA_BROKERS` | `memory://` | Comma-separated Kafka brokers. |
| `KNOWLEDGE_DATABASE_URL` | `memory://` | PostgreSQL connection string. |
| `KNOWLEDGE_REDIS_URL` | `memory://` | Redis connection string. |

## Notes And Limitations

- Redpanda is used as a compact Kafka-compatible local broker.
- Semantic search is simulated with deterministic hashed token vectors.
- The full-text index is in memory for inspectability.
- The API hosts the Kafka consumer for the POC. Production would split workers.
- Real PDF parsing, OCR, and external embedding models are intentionally out of scope.

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
