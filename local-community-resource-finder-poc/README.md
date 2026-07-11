# Local Community Resource Finder POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for finding nearby community resources such as food pantries, clinics, shelters, utility assistance, legal aid, childcare, transport, and benefits offices.

## What It Demonstrates

- Idempotent provider event ingestion for listings, hours, capacity, closures, reopenings, verification, and saves
- Out-of-order update protection using provider event timestamps
- Search filtering by category, ZIP code, language, eligibility, open availability, and required documents
- Saved-resource alerts when a provider changes, closes, fills up, or reopens
- Capacity-low, full, closed, and stale-listing detection
- Redis-friendly cached search results with explicit cache refresh jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for nearby resources, saved options, alerts, events, jobs, and audits

## Run Locally

Backend:

```bash
cd local-community-resource-finder-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd local-community-resource-finder-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5290`.

## Run With Infrastructure

```bash
cd local-community-resource-finder-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5290`
- API: `http://127.0.0.1:8290`
- Kafka/Redpanda: `127.0.0.1:9117`
- Postgres: `127.0.0.1:5460`
- Redis: `127.0.0.1:6407`

## API Shape

- `GET /api/health`
- `GET /api/snapshot`
- `GET /api/search`
- `POST /api/events`
- `POST /api/events/publish`
- `POST /api/kafka/drain`
- `POST /api/jobs`
- `POST /api/jobs/drain`
- `POST /api/reset`

Example:

```bash
curl "http://127.0.0.1:8290/api/search?zipCode=60618&language=Spanish&needsOpenNow=true"
```
