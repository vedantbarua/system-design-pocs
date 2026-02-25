# FlashConf POC (Distributed Config Engine)

FlashConf is a **distributed feature flag/config engine** POC focused on:
- Attribute targeting (beta groups, regions, plans)
- Push-based updates via **Server-Sent Events (SSE)**
- Local caching with **Caffeine** to avoid hitting the store on every request
- Audit trail for every change

## Architecture

```
React (FeatureFlagProvider)
  -> GET /sdk/ruleset?clientId=web-dashboard&userId=...
  <- SSE /sdk/stream (ruleset pushes on change)

Spring Boot (FlashConf)
  -> Central store (in-memory, simulating Redis/Postgres)
  -> Local Caffeine cache (TTL)
  -> Targeting engine + rollout bucketing
  -> Audit trail
```

## How to Run

### 1) Backend (Spring Boot)
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/flashconf-poc/backend
mvn org.springframework.boot:spring-boot-maven-plugin:run
```
Backend runs on `http://localhost:8095`.

### 2) Frontend (React)
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/flashconf-poc/frontend
npm install
npm start
```
Frontend runs on `http://localhost:3000`.

## Admin API

- `GET /admin/flags` → list all flags
- `GET /admin/flags/{key}` → fetch a flag
- `POST /admin/flags` → create a flag
- `PUT /admin/flags/{key}` → update a flag
- `DELETE /admin/flags/{key}?actor=...` → delete
- `GET /admin/audit` → audit trail

Example update:
```
curl -X PUT "http://localhost:8095/admin/flags/new-sidebar" \
  -H "Content-Type: application/json" \
  -d '{"description":"Sidebar UI","enabled":true,"rules":[],"actor":"admin"}'
```

## SDK Endpoints

- `GET /sdk/ruleset?clientId=...&userId=...&country=...&segment=...`
- `GET /sdk/stream?clientId=...&userId=...&country=...&segment=...` (SSE)

## Notes
- Cache TTL and size are controlled in `backend/src/main/resources/application.properties`.
- Rollout bucketing uses a deterministic hash of `userId` by default.
- SSE pushes a full ruleset snapshot to every connected client on change.

See `TECHNICAL_README.md` for deeper details and `IMPROVEMENTS.md` for next steps.
