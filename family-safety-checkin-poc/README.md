# Family Safety Check-in POC

React and FastAPI proof-of-concept for scheduled safety check-ins, trusted-contact escalation, temporary location sharing, offline acknowledgements, retryable notifications, and realtime household updates with PostgreSQL, Redis, and WebSockets.

## Goal

Demonstrate the system behavior behind a practical "arrived safely" workflow. The POC focuses on check-in deadlines, grace windows, command replay, delayed mobile events, expiring location data, escalation delivery, and realtime coordination across household dashboards.

## What It Covers

- Scheduled check-in windows and destination notes
- Scheduled, open, late, escalated, acknowledged, and canceled states
- Configurable grace periods
- Trusted-contact escalation
- Idempotent safety acknowledgements
- Delayed offline event synchronization
- Temporary location sharing with TTL
- Monotonic location sequences and stale-event rejection
- Notification retries and recipient/channel deduplication
- WebSocket snapshot and presence updates
- Owner, trusted-contact, and member permissions
- Incident timeline and append-only activity history
- PostgreSQL state snapshots and Redis job mirrors
- Responsive React operations workspace

## Quick Start

Install dependencies:

```bash
cd family-safety-checkin-poc/backend
python3 -m pip install -r requirements.txt

cd ../frontend
npm install
```

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Run FastAPI with infrastructure:

```bash
cd backend
SAFETY_DATABASE_URL=postgresql://safety:safety@127.0.0.1:5434/family_safety \
SAFETY_REDIS_URL=redis://127.0.0.1:6381/0 \
uvicorn app:app --host 127.0.0.1 --port 8183
```

Run without infrastructure:

```bash
cd backend
SAFETY_DATABASE_URL=memory:// \
SAFETY_REDIS_URL=memory:// \
uvicorn app:app --host 127.0.0.1 --port 8183
```

Start React:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5183`.

## UI Flows

1. Review open, late, escalated, and upcoming household check-ins.
2. Open a check-in to inspect its window, temporary location, and timeline.
3. Confirm a member is safe through a replay-protected command.
4. Simulate a delayed offline acknowledgement.
5. Create a check-in for yourself or another household member.
6. Advance the scheduler past a due time and then past the grace period.
7. Inspect temporary location shares and submit a newer sequence.
8. Simulate a notification provider timeout and retry recovery.
9. Drain notification workers and inspect delivery receipts.
10. Watch other connected dashboards refresh through WebSockets.

## JSON Endpoints

- `GET /api/health`
- `GET /api/snapshot`
- `GET /api/checkins/{checkinId}`
- `POST /api/checkins`
- `POST /api/checkins/{checkinId}/acknowledge`
- `POST /api/checkins/{checkinId}/cancel`
- `POST /api/checkins/{checkinId}/location`
- `PUT /api/members/{memberId}/location`
- `POST /api/members/{memberId}/location/stop`
- `POST /api/offline/sync`
- `POST /api/scheduler/run`
- `POST /api/workers/tick`
- `POST /api/workers/drain`
- `POST /api/workers/fail-next`
- `POST /api/reset`

Example acknowledgement:

```json
{
  "actor_id": "user-maya",
  "idempotency_key": "mobile-command-41f9",
  "message": "Arrived safely",
  "occurred_at": "2026-06-14T23:42:00Z"
}
```

Example offline batch:

```json
{
  "actor_id": "user-maya",
  "events": [
    {
      "client_event_id": "offline-event-7",
      "kind": "CHECKIN_ACKNOWLEDGED",
      "occurred_at": "2026-06-14T23:42:00Z",
      "payload": {
        "checkin_id": "checkin-commute",
        "message": "Arrived safely"
      }
    }
  ]
}
```

## WebSocket Endpoint

```text
ws://127.0.0.1:8183/ws/households/household-maple?actor_id=user-vedant
```

Message types:

- `snapshot`
- `snapshot.updated`
- `presence.updated`
- `ping`
- `pong`

## Configuration

- FastAPI defaults to port `8183`
- React defaults to port `5183`
- PostgreSQL Compose port is `5434`
- Redis Compose port is `6381`
- `SAFETY_DATABASE_URL` defaults to `memory://`
- `SAFETY_REDIS_URL` defaults to `memory://`
- Location TTL must be between 5 and 120 minutes
- Notification jobs allow three delivery attempts
- The deterministic demo time is June 14, 2026 at 6:45 PM Central

## Testing

```bash
cd backend
python3 -m unittest discover -s tests

cd ../frontend
npm run build
```

## Notes and Limitations

- The product is a coordination simulation, not an emergency-response service.
- Users should contact local emergency services directly when immediate assistance is required.
- Authentication is represented by explicit demo actor IDs.
- Location coordinates are demo data and the map is an AI-generated fictional neighborhood.
- Infrastructure mode persists a compact JSONB snapshot and mirrors pending jobs to Redis.
- Redis publishing is present, but cross-instance WebSocket subscription is intentionally simplified.
- The application is not a substitute for professional personal-safety planning.

## Technologies Used

- Python 3
- FastAPI
- WebSockets
- Pydantic
- PostgreSQL
- Redis
- React 19
- Vite
- Lucide React
- `unittest`
