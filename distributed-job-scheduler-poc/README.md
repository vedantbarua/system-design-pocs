# Distributed Job Scheduler POC

Node and React proof-of-concept for a Cron-as-a-Service control plane with timing-wheel scheduling, lease-based leader election, shard-aware job placement, and at-least-once execution semantics.

## Goal

Demonstrate how a scheduler can smooth bursty workloads, coordinate a single active dispatcher, and recover work after lease expiry without introducing a real distributed datastore or message broker.

## What It Covers

- Timing-wheel based delayed scheduling
- Lease-based leader election through periodic node heartbeats
- Tenant-to-shard routing for scalable job placement
- At-least-once execution with worker lease expiry and retry
- Dispatch caps that smooth thundering-herd releases
- Operational dashboard for nodes, queues, jobs, executions, shards, and recent events

## Quick Start

1. Start the backend:
   ```bash
   cd distributed-job-scheduler-poc/backend
   npm install
   npm run dev
   ```
2. Start the frontend:
   ```bash
   cd distributed-job-scheduler-poc/frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:5179`.

The backend listens on `http://localhost:8130`, and the frontend proxies `/api` to it.

## UI Flows

- Watch node heartbeats elect a leader
- Schedule one job with a future `runAt` timestamp
- Seed a thundering-herd workload and inspect wheel depth plus dispatch smoothing
- Pause and resume scheduling to see queued jobs accumulate and drain
- Observe retries after lease expiry or random execution failure

## JSON Endpoints

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

Example job request:

```json
{
  "tenantId": "tenant-1",
  "name": "daily-summary",
  "runAt": 1760000000000,
  "payload": {
    "type": "digest",
    "region": "us-east"
  },
  "maxAttempts": 3
}
```

## Configuration

- `PORT` controls the backend port and defaults to `8130`
- the scheduler tick interval is fixed in code at `200ms`
- the timing wheel uses `60` slots with `1s` slot size
- leader and worker leases use a `3500ms` timeout

## Notes and Limitations

- All scheduler state is in memory and resets on restart.
- Leader election is process-local and based on a shared in-memory node map, not a real distributed lease store.
- Execution failure rate is randomized to make retries visible in the demo.
- There is no durable job log, exactly-once guarantee, or multi-process backend cluster.

## Technologies Used

- Node.js
- Express
- React
- Vite
