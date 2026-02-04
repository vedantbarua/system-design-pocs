# Notification System (Pub/Sub at Scale) POC
Multi-channel notification engine using Node + Express with a React control plane. It models priority queues, per-provider rate limits, template rendering, and deduplication windows.

## What this POC shows
- Pub/sub topics per channel (SMS, Email, Push)
- Priority queue ordering with high-priority first
- Token-bucket rate limiting per provider
- Template rendering service with `{{var}}` placeholders
- Deduplication window to drop repeats
- Basic retry flow for failures

## How to Run
1. Backend

```bash
cd system-design-pocs/notification-system-poc/backend
npm install
npm run dev
```

Backend runs on `http://localhost:8120`.

2. Frontend

```bash
cd system-design-pocs/notification-system-poc/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5178` and proxies `/api` to the backend.

## API
- `GET /api/health`
- `GET /api/templates`
- `POST /api/templates`
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

## Notes
- All state is in-memory; restarting the backend clears queues, templates, and history.
- Deduplication window is configurable via `DEDUPE_WINDOW_MS`.
