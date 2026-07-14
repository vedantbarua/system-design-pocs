# Job Application Interview Tracker POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for tracking job applications, recruiter follow-ups, interview loops, resume versions, offers, duplicate postings, and stale opportunities.

## What It Demonstrates

- Idempotent job application event ingestion for application updates, status changes, interviews, offers, follow-ups, rejections, withdrawals, and resume attachments
- Out-of-order update protection using event timestamps
- Application projection for saved, applied, screen, interview, offer, rejected, withdrawn, stale, follow-up-due, and duplicate states
- Duplicate job posting detection across job boards using company, role, and location fingerprints
- Deadline scans for follow-ups, upcoming interviews, offer deadlines, stale applications, and thank-you notes
- Retryable background jobs for scans, reminders, offer review, and retention
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for applications, interviews, offers, alerts, events, jobs, and audits

## Run Locally

Backend:

```bash
cd job-application-interview-tracker-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd job-application-interview-tracker-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5320`.

## Run With Infrastructure

```bash
cd job-application-interview-tracker-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5320`
- API: `http://127.0.0.1:8320`
- Kafka/Redpanda: `127.0.0.1:9120`
- Postgres: `127.0.0.1:5463`
- Redis: `127.0.0.1:6410`

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
curl -X POST http://127.0.0.1:8320/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"schedule-panel","applicationId":"app-contoso","type":"INTERVIEW_SCHEDULED","round":"Hiring manager","scheduledAt":"2026-07-15T15:00:00Z"}'
```
