# Package Delivery Tracker POC

React, Node.js, Express, and Redis proof-of-concept for normalizing package events across carriers while handling duplicate and out-of-order webhooks safely.

## Goal

Demonstrate the event-ingestion and projection logic behind a unified household package tracker rather than building another carrier-specific CRUD application.

## What It Covers

- Multiple carriers and tracking numbers
- Carrier-specific status normalization
- Monotonic delivery state transitions
- Duplicate webhook suppression
- Out-of-order event auditing without projection regression
- Redis snapshot persistence
- Redis event deduplication with expiring keys
- Redis Stream append and Pub/Sub publication
- Simulated carrier polling
- Delivery windows, delays, exceptions, and ETAs
- Notification preferences and queued alerts
- Carrier reliability scorecards
- Responsive package operations dashboard

## Quick Start

Install dependencies:

```bash
cd package-delivery-tracker-poc/backend
npm install

cd ../frontend
npm install
```

Optional Redis:

```bash
docker compose up -d redis
```

Start the API with Redis:

```bash
cd backend
PACKAGE_TRACKER_REDIS_URL=redis://127.0.0.1:6379 npm start
```

Start without Redis:

```bash
cd backend
PACKAGE_TRACKER_REDIS_URL=memory:// npm start
```

Start the React application in another terminal:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5179`.

## UI Flows

1. Review active, arriving-today, exception, and delivered package counts.
2. Open a package to inspect its normalized event timeline.
3. Run carrier polling to ingest the next simulated FedEx and USPS updates.
4. Send a carrier webhook from the package drawer.
5. Reuse an event ID to verify duplicate suppression.
6. Send an event with an older occurrence time and inspect the ignored audit entry.
7. Review carrier on-time rates and exception counts.
8. Toggle package-specific notification preferences.

## JSON Endpoints

- `GET /api/health`
- `GET /api/snapshot?householdId=...&asOf=...`
- `GET /api/packages/{packageId}`
- `POST /api/packages`
- `POST /api/events/webhook`
- `POST /api/poll/run`
- `POST /api/packages/{packageId}/preferences`
- `POST /api/reset`

Example webhook:

```json
{
  "eventId": "ups-event-4831",
  "carrier": "UPS",
  "trackingNumber": "1Z84A20E0391208841",
  "carrierStatus": "D",
  "occurredAt": "2026-06-10T19:30:00Z",
  "location": "Front porch",
  "message": "Delivered"
}
```

## Configuration

- `PORT` defaults to `8178`
- `HOST` defaults to `127.0.0.1`
- `PACKAGE_TRACKER_REDIS_URL` defaults to `memory://`
- Set `PACKAGE_TRACKER_REDIS_URL=redis://127.0.0.1:6379` to use Redis
- Redis dedupe keys expire after seven days
- The Redis event stream is approximately capped at 1,000 entries

## Testing

```bash
cd backend
npm test

cd ../frontend
npm run build
```

## Notes and Limitations

- Carrier integrations and notification delivery are simulated.
- Memory mode resets when the API process restarts.
- The Redis snapshot is one JSON document for POC clarity, not a production storage model.
- The demo clock is fixed at June 10, 2026 for deterministic UI states.
- There is no authentication, household authorization, or encrypted tracking data.

## Technologies Used

- React 18
- Vite
- Lucide React
- Node.js
- Express
- Redis
- Node built-in test runner
