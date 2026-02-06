# Distributed Job Scheduler (Cron-as-a-Service) POC
Node + Express backend with a React control plane modeling a distributed scheduler using a timing wheel, leader election, and sharded job store.

## What this POC shows
- Hierarchical timing wheel (simplified single wheel) for delayed scheduling
- Leader election via leasing heartbeats
- Sharded job routing by tenant
- At-least-once delivery with worker leases and retries
- Thundering herd smoothing using slot batching + dispatch caps

## How to Run
1. Backend

```bash
cd system-design-pocs/distributed-job-scheduler-poc/backend
npm install
npm run dev
```

Backend runs on `http://localhost:8130`.

2. Frontend

```bash
cd system-design-pocs/distributed-job-scheduler-poc/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5179` and proxies `/api` to the backend.

## API
- `GET /api/health`
- `POST /api/nodes/heartbeat`
- `GET /api/nodes`
- `GET /api/shards`
- `POST /api/jobs`
- `GET /api/jobs?limit=50`
- `GET /api/queues`
- `GET /api/events`
- `GET /api/executions`
- `POST /api/controls/pause`
- `POST /api/controls/resume`
- `POST /api/seed`

## Notes
- State is in-memory; restarting the backend clears everything.
- Lease expiry triggers re-schedule to guarantee at-least-once execution.
