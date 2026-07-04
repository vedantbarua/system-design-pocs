# Technical README

## Architecture

```text
Booking/provider events -> Express API -> Kafka topic/fallback -> TravelItinerary
                                                   |
                                                   +-> Postgres event/snapshot tables
                                                   +-> Redis latest snapshot cache
                                                   +-> React dashboard
```

The backend runs without external services by default. `TRAVEL_DATABASE_URL`, `TRAVEL_REDIS_URL`, and `TRAVEL_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate itinerary events are ignored by `{reservationId}:{eventId}` keys.
- Out-of-order booking updates are stored in the event log but ignored by the projection.
- Timeline scans detect overlapping reservations, check-in windows, document deadlines, stale provider updates, and departure prep windows.
- Alerts and reminders are deduplicated by stable reservation-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, booking metadata changes, stale update protection, schedule conflicts, check-in reminders, document deadline reminders, stale booking alerts, cancellation/completion, reminder dedupe, dispatch, retention, job retries, and restore.
