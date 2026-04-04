# Distributed Lock Manager POC

Redis-backed proof-of-concept for lease-based distributed locking with fencing tokens, owner-safe release, and a race demo that shows why a lock alone is not enough to protect downstream writes.

## Goal

Demonstrate how a lock can expire while a worker is still running, and why downstream systems need fencing tokens to reject stale work even when the original lock holder eventually resumes.

## What It Covers

- Atomic lock acquisition with `SET NX PX`
- Monotonic fencing-token issuance per resource
- Owner-safe release with compare-and-delete Lua logic
- Two independent backend instances sharing the same Redis coordinator
- Race-condition demo where one worker sleeps past TTL and loses authority
- UI and CLI flows to inspect the final stored resource state

## Quick Start

1. Ensure Docker is available.
2. Start Redis and both backend instances:
   ```bash
   cd distributed-lock-manager-poc
   docker compose up --build
   ```
3. In a separate terminal, start the React UI:
   ```bash
   cd distributed-lock-manager-poc/frontend
   npm install
   npm run dev
   ```
4. Open `http://localhost:5174`.

## UI Flows

- Run the default race demo where app-1 holds the lock longer than the TTL
- Adjust work durations to see when both writes succeed versus when the stale write is fenced
- Refresh the stored resource state to inspect the winning token and payload

## Demo Flow

Start a long-running write on app-1:

```bash
curl -X POST "http://localhost:8081/dlm/demo" \
  -H "Content-Type: application/json" \
  -d '{"resource":"inventory:sku-42","payload":"write-from-app-1","workMs":3000}'
```

Wait about 2 seconds so the 1.5s TTL expires, then trigger a shorter write on app-2:

```bash
curl -X POST "http://localhost:8082/dlm/demo" \
  -H "Content-Type: application/json" \
  -d '{"resource":"inventory:sku-42","payload":"write-from-app-2","workMs":200}'
```

Inspect the final state:

```bash
curl "http://localhost:8081/dlm/state?resource=inventory:sku-42"
```

Expected behavior:

- app-1 acquires the lock first
- app-1 sleeps past the TTL
- app-2 acquires a higher fencing token and writes
- app-1's late write is rejected by the fenced resource update

## JSON Endpoints

- `POST /dlm/demo` body: `{ resource, payload, workMs }`
- `GET /dlm/state?resource=...`
- `GET /health`

Example request:

```json
{
  "resource": "inventory:sku-42",
  "payload": "write-from-app-1",
  "workMs": 3000
}
```

## Configuration

- `PORT` controls the backend port and defaults to `8081`
- `DLM_INSTANCE_ID` names the backend instance in responses and logs
- `DLM_REDIS_HOST` and `DLM_REDIS_PORT` point to Redis
- `DLM_LOCK_TTL_MS` controls lease duration and defaults to `1500`

## Notes and Limitations

- The POC uses one Redis instance and does not model multi-Redis or quorum-based locking.
- Locks are lease-based and intentionally do not auto-renew.
- The protected resource is an in-memory Redis hash rather than a real downstream database or storage engine.
- There is no retry orchestration, deadlock detection, or metrics pipeline.

## Technologies Used

- Node.js
- Express
- Redis
- React
- Vite
- Docker Compose
