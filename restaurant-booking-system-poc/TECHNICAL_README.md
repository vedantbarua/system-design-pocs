# Restaurant Booking System Technical README

## Problem Statement

Restaurant reservations need to allocate scarce tables across time. The hard parts are preventing double booking, keeping inventory available during checkout, and recovering capacity when guests cancel or holds expire.

This POC models those problems with expiring holds, overlap-aware table assignment, waitlist promotion, and idempotent write APIs.

## Architecture Overview

- React TSX frontend renders service health, slot utilization, holds, reservations, waitlist state, and recent events.
- Express backend owns the in-memory booking state and exposes JSON APIs.
- A slot availability calculator evaluates table conflicts across overlapping 90-minute dining turns.
- Mutating booking endpoints optionally use `Idempotency-Key` to replay a cached response for duplicate client retries.
- Simulation endpoints create rush demand or force hold expiry so operational state transitions are visible.

## Core Data Model

- `DiningTable`: stable table inventory with room, seat count, and active/maintenance status.
- `Hold`: temporary claim on a table for a date/time/party size. Active holds block the table until confirmed, released, or expired.
- `Reservation`: confirmed booking with guest details, assigned table, status, and notes.
- `WaitlistEntry`: guest demand that could not be immediately assigned. Entries can be waiting, offered, or booked.
- `BookingEvent`: bounded audit stream for holds, confirmations, cancellations, waitlist offers, idempotency replays, and simulations.

## Request Flow

1. Client requests a hold for a date, time, and party size.
2. Backend expires stale holds before checking capacity.
3. Backend finds the smallest active table that can fit the party and does not overlap an active hold or confirmed reservation.
4. If a table exists, an active hold is created with a TTL.
5. If no table exists, a waitlist entry is created.
6. Client confirms the hold before expiry.
7. Backend rechecks table availability, marks the hold confirmed, and creates a reservation.
8. Cancellation, no-show, completion, or hold expiry triggers waitlist promotion.

## Key Tradeoffs

- Best-fit assignment keeps large tables available but can still fragment capacity for unusual party mixes.
- In-memory idempotency is enough for a POC but would need shared durable storage in production.
- Opportunistic expiry avoids background workers, but production systems should use scheduled jobs or delayed queues.
- Waitlist promotion is deterministic and simple: oldest waiting guest first, nearest acceptable slot first.

## Failure Handling

- Duplicate client retries can send `Idempotency-Key`; the backend returns the first response for that key and route.
- Confirmation revalidates table availability before writing a reservation.
- Expired holds are not treated as capacity blockers.
- Cancellation and terminal reservation states immediately run waitlist promotion.
- API validation rejects invalid dates, times, party sizes, and statuses.

## Scaling Path

- Store reservations, holds, and waitlist rows in a transactional database.
- Add a uniqueness or exclusion constraint covering `restaurant_id`, `table_id`, date, and occupied time range.
- Use Redis or a database table for shared idempotency keys.
- Replace opportunistic hold expiry with delayed jobs, queue consumers, or database TTL scanning.
- Partition by restaurant ID and service date for high-volume multi-tenant deployments.
- Emit booking events to a stream for notifications, analytics, and audit replay.

## What Is Intentionally Simplified

- One restaurant, one service day model, and seeded table inventory.
- No authentication, staff roles, deposits, or guest identity management.
- No timezone conversion beyond ISO date strings and local HH:MM slots.
- No multi-table party splitting.
- No durable storage or cross-process locking.
- No external SMS/email notification provider for waitlist offers.
