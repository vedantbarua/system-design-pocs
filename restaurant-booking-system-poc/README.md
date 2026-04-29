# Restaurant Booking System POC

Node, Express, and React TSX proof-of-concept for restaurant reservations with expiring holds, table assignment, waitlist promotion, idempotent booking requests, and an operational event stream.

## Goal

Show how a booking service prevents double booking while still giving guests a temporary checkout window, surfacing waitlist backpressure when capacity is exhausted.

## What It Covers

- In-memory table inventory with room, seat count, and service status
- Slot availability calculated across overlapping 90-minute dining turns
- Temporary reservation holds with TTL expiry
- Confirmation flow that converts a hold into a reservation
- Idempotency keys for duplicate hold and confirmation requests
- Waitlist entries with flexible time windows and automatic offer promotion
- Simulation controls for walk-in rushes and hold expiry
- React dashboard for capacity, holds, reservations, waitlist offers, metrics, and audit events

## Quick Start

1. Start the backend:
   ```bash
   cd restaurant-booking-system-poc/backend
   npm install
   npm run dev
   ```
2. Start the frontend:
   ```bash
   cd restaurant-booking-system-poc/frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:5194`.

The backend listens on `http://localhost:8144`, and the frontend proxies `/api` to it.

## UI Flows

- Create a temporary booking hold for a guest and confirm it before the hold expires
- Try larger parties during busy slots to trigger automatic waitlist insertion
- Run the walk-in rush simulation to create concurrent demand against limited capacity
- Force active holds to expire and watch waitlist promotion run
- Cancel or update reservation status and inspect the event stream
- Watch slot utilization change as holds and reservations overlap

## JSON Endpoints

- `GET /api/health`
- `GET /api/snapshot?date=YYYY-MM-DD`
- `POST /api/holds`
- `POST /api/holds/:id/confirm`
- `POST /api/waitlist`
- `POST /api/waitlist/:id/book`
- `PATCH /api/reservations/:id/status`
- `DELETE /api/reservations/:id`
- `POST /api/simulate/expire-holds`
- `POST /api/simulate/walk-in-rush`
- `POST /api/seed`

Example hold request:

```json
{
  "date": "2026-04-28",
  "time": "18:00",
  "partySize": 4,
  "guestName": "Jordan Lee",
  "guestPhone": "555-0142"
}
```

Send `Idempotency-Key` on mutating booking requests to safely retry from a client.

## Configuration

- `PORT` controls the backend port and defaults to `8144`
- service hours are seeded as `17:00` to `22:00`
- slot size is 30 minutes
- dining turn length is 90 minutes
- hold TTL is 2 minutes
- event retention is bounded to the most recent 180 events

## Notes and Limitations

- State is in memory and resets on restart.
- Table assignment uses best-fit by seat count, not a full floor optimization solver.
- Hold expiry runs opportunistically during requests and snapshot polling.
- Guest contact data is sample data only and not persisted securely.
- Time zones, deposits, cancellation policies, and staff override workflows are intentionally simplified.

## Technologies Used

- Node.js
- Express
- TypeScript
- React
- Vite
- TSX
