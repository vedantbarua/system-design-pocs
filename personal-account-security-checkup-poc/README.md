# Personal Account Security Checkup POC

This POC models a practical account-security dashboard for everyday users. It tracks account metadata, MFA posture, recovery readiness, password age, breach findings, active sessions, duplicate records, security reminders, and an exportable recovery checklist.

The stack is intentionally resume-friendly: React + TypeScript, Node/Express, Kafka-style event ingestion, Postgres snapshots/events, Redis snapshot caching, retryable jobs, deterministic risk scoring, and audit history. The app stores metadata only and never stores real passwords.

## What It Demonstrates

- Idempotent account event ingestion with stable `accountId:eventId` keys.
- Stale update protection for late account, MFA, recovery, password, session, and breach events.
- Deterministic risk scoring from MFA, recovery data, password age, breach state, session count, and account importance.
- Duplicate account detection by normalized domain and username.
- Alerts for missing MFA, incomplete recovery, stale passwords, open breaches, duplicate accounts, and session spikes.
- Account recovery checklist generation with checksums.
- Retryable jobs for security scans, breach imports, checklist exports, reminders, and retention.
- Memory-first adapters that can switch to Kafka, Postgres, and Redis through environment variables.

## Stack

- Frontend: React, TypeScript, Vite, lucide-react
- Backend: Node.js, Express, TypeScript
- Eventing: Kafka-compatible producer/consumer via `kafkajs`, with in-memory fallback
- Persistence: Postgres snapshots/events, with in-memory fallback
- Cache: Redis snapshot cache, with in-memory fallback
- Local orchestration: Docker Compose

## Run Locally

Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5342`.

## API

- `GET /api/health` - adapter mode and buffered message count
- `GET /api/snapshot` - current accounts, breaches, checklists, alerts, jobs, audit, and metrics
- `POST /api/events` - ingest an account security event immediately
- `POST /api/events/publish` - publish an event to Kafka or the in-memory buffer
- `POST /api/kafka/drain` - drain buffered messages in memory mode
- `POST /api/jobs` - queue a job
- `POST /api/jobs/fail-next` - force the next job to retry
- `POST /api/jobs/drain` - process queued jobs
- `POST /api/reset` - restore seeded demo state

## Useful Events

```json
{
  "eventId": "mfa-1",
  "accountId": "acct-bank",
  "type": "MFA_ENABLED",
  "mfaMethod": "TOTP"
}
```

```json
{
  "eventId": "breach-1",
  "accountId": "acct-email",
  "type": "BREACH_IMPORTED",
  "breachSource": "sample breach feed",
  "breachSeverity": "CRITICAL"
}
```

## Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5342`
- API: `http://127.0.0.1:8342`
- Kafka-compatible Redpanda: `127.0.0.1:9124`
- Postgres: `127.0.0.1:5467`
- Redis: `127.0.0.1:6414`

## Verification

```bash
cd backend && npm test && npm run build
cd ../frontend && npm run build
docker compose config
```
