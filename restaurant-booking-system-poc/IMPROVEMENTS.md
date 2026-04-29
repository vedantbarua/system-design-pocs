# Restaurant Booking System Improvements

## Production Gaps

- Persist tables, holds, reservations, waitlist entries, and idempotency records in a transactional database.
- Add tenant scoping for multiple restaurants and locations.
- Support service calendars, holidays, dining areas, pacing rules, deposits, and cancellation policies.
- Add staff override workflows for VIPs, table merges, and manual table reassignment.
- Integrate SMS/email notifications for hold expiry and waitlist offers.

## Reliability Improvements

- Enforce no-overlap booking constraints with database transactions and exclusion locks.
- Move hold expiry to a scheduled worker or delayed queue.
- Add durable idempotency with request hashes to reject key reuse with different payloads.
- Add outbox events for reservation notifications and analytics.
- Track waitlist offer expiry so stale offers do not block guests indefinitely.

## Scaling Improvements

- Partition booking data by restaurant ID and service date.
- Cache read-heavy availability snapshots and invalidate on booking writes.
- Precompute service slots for each restaurant configuration.
- Add rate limits for public booking endpoints.
- Use event streams to feed occupancy metrics without overloading the booking write path.

## Security Improvements

- Add authentication and role-based access for staff operations.
- Protect guest phone numbers and notes with encryption at rest.
- Add audit metadata for staff user, client app, and source IP.
- Validate CORS origins per environment.
- Add abuse detection for repeated public booking attempts.

## Testing Improvements

- Unit test overlap detection, best-fit table assignment, hold expiry, and waitlist promotion.
- Add API tests for idempotency replay and duplicate confirmation attempts.
- Add frontend component tests for capacity and state transition rendering.
- Add load tests for popular reservation release windows.
- Add integration tests backed by a real database transaction model.
