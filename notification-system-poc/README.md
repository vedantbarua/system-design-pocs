# Notification System POC

Node and React proof-of-concept for a multi-channel notification platform with queueing, provider rate limits, deduplication windows, template rendering, retries, and operational visibility across SMS, email, and push delivery paths.

## Goal

Demonstrate how a notification control plane can absorb message bursts, prioritize urgent work, protect downstream providers with rate limiting, and retry failed deliveries without introducing a real broker or durable datastore.

## What It Covers

- Channel-specific topics for SMS, email, and push
- Priority queue ordering with higher-priority work dispatched first
- Token-bucket rate limiting per provider
- Template storage and placeholder rendering
- Deduplication window keyed by channel and user-defined token
- Retry scheduling after provider failure
- Dashboard for queue depth, provider capacity, recent events, and latest deliveries

## Quick Start

1. Start the backend:
   ```bash
   cd notification-system-poc/backend
   npm install
   npm run dev
   ```
2. Start the frontend:
   ```bash
   cd notification-system-poc/frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:5178`.

The backend listens on `http://localhost:8120`, and the frontend proxies `/api` to it.

## UI Flows

- Seed templates, then create and send notifications through different channels
- Increase priority to see urgent notifications move ahead in a queue
- Reuse a dedupe key to confirm duplicates are dropped
- Adjust provider rate limits to simulate downstream bottlenecks
- Pause and resume dispatch while watching queue depth and status mix change

## JSON Endpoints

- `GET /api/health`
- `GET /api/templates`
- `POST /api/templates`
- `GET /api/templates/:id`
- `POST /api/templates/:id/render`
- `GET /api/providers`
- `POST /api/providers/:id/rate`
- `POST /api/notifications`
- `GET /api/notifications?limit=50`
- `GET /api/queues`
- `GET /api/events`
- `POST /api/controls/pause`
- `POST /api/controls/resume`
- `POST /api/seed`

Example notification request:

```json
{
  "userId": "user-1024",
  "channel": "email",
  "templateId": "template-123",
  "priority": 3,
  "params": {
    "name": "Alex",
    "orderId": "A-9021",
    "eta": "2 days"
  },
  "dedupeKey": "order-A-9021"
}
```

## Configuration

- `PORT` controls the backend port and defaults to `8120`
- `DEDUPE_WINDOW_MS` controls duplicate suppression and defaults to two minutes
- provider rate and burst limits are initialized in code and can be changed at runtime
- event retention is bounded to the most recent `200` operational events

## Notes and Limitations

- All state is in memory and resets on restart.
- Dispatch is simulated with timers and randomized provider failure rates.
- There is no durable outbox, exactly-once delivery, or external broker.
- Retries stay within the same process and do not survive crashes.

## Technologies Used

- Node.js
- Express
- React
- Vite
