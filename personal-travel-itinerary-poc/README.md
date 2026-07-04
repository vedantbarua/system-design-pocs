# Personal Travel Itinerary POC

React, Node, Express, Kafka, Postgres, and Redis proof-of-concept for coordinating trip reservations, booking updates, schedule conflicts, document deadlines, check-in windows, reminders, and audit history.

## What It Demonstrates

- Idempotent booking import and update event ingestion
- Out-of-order itinerary update protection using provider event timestamps
- Reservation timeline projection for flights, hotels, activities, transport, dining, and documents
- Schedule conflict, check-in window, departure-soon, document deadline, and stale booking alerts
- Reminder queue with dedupe and retryable dispatch jobs
- Postgres snapshot/event persistence and Redis latest-snapshot caching with in-memory fallback
- React dashboard for trip timeline, attention queue, alerts, event history, jobs, and audits

## Run Locally

Backend:

```bash
cd personal-travel-itinerary-poc/backend
npm install
npm run dev
```

Frontend:

```bash
cd personal-travel-itinerary-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5220`.

## Run With Infrastructure

```bash
cd personal-travel-itinerary-poc
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5220`
- API: `http://127.0.0.1:8220`
- Kafka/Redpanda: `127.0.0.1:9110`
- Postgres: `127.0.0.1:5453`
- Redis: `127.0.0.1:6400`

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
curl -X POST http://127.0.0.1:8220/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"hotel-change","reservationId":"res-hotel","type":"BOOKING_UPDATED","notes":"Late check-in confirmed."}'
```
