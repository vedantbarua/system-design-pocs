# Distributed Lock Manager POC (Node + React)

A Redis-backed Distributed Lock Manager proof of concept with:
- Atomic acquisition (`SET NX PX` + fencing token increment)
- Owner-safe release (check-and-delete via Lua)
- Fencing tokens to reject late writes
- Two service instances to demonstrate lock TTL race handling

## What’s Inside
- `backend/`: Node.js + Express DLM service
- `frontend/`: React UI to run the race demo
- `docker-compose.yml`: Redis + two backend instances

## Run the Demo

### 1) Start Redis + two backends
```bash
docker compose up --build
```

### 2) Optional: Run the React UI
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5174`.

### 3) CLI demo (race condition)
Start a long-running write on app-1 (longer than TTL):
```bash
curl -X POST "http://localhost:8081/dlm/demo" \
  -H "Content-Type: application/json" \
  -d '{"resource":"inventory:sku-42","payload":"write-from-app-1","workMs":3000}'
```

Wait ~2 seconds so the 1.5s TTL expires, then trigger a shorter write on app-2:
```bash
curl -X POST "http://localhost:8082/dlm/demo" \
  -H "Content-Type: application/json" \
  -d '{"resource":"inventory:sku-42","payload":"write-from-app-2","workMs":200}'
```

Check the stored resource state:
```bash
curl "http://localhost:8081/dlm/state?resource=inventory:sku-42"
```

Expected behavior:
- App-1 acquires the lock but sleeps past the TTL
- App-2 acquires a higher fencing token and writes
- App-1’s late write is rejected

## API
- `POST /dlm/demo` body: `{ resource, payload, workMs }`
- `GET /dlm/state?resource=...`
- `GET /health`

## Notes
- Lock TTL is controlled by `DLM_LOCK_TTL_MS` (default 1500ms in compose).
- Fencing tokens are stored in Redis under `dlm:fence:<resource>` and the resource state under `dlm:resource:<resource>`.
