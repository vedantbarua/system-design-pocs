# Appointment Scheduling Reminder Technical README

## Architecture

The POC is a compact scheduling service. Providers publish working hours and offered services. Customers query availability, hold a slot, book it, reschedule, cancel, or join a waitlist. Background-style operations expire holds and generate reminders.

```text
Provider calendar + service catalog
              |
              v
Appointment Scheduling Service
              |
              +-- slot holds
              +-- appointments
              +-- waitlist
              +-- reminders
              +-- audit events
```

## Data Model

### Providers and Services

`providers` stores the provider identity, location, and timezone. `services` stores duration and price. `provider_services` defines which provider can perform each service.

### Working Hours

`working_hours` stores one UTC working window per provider and weekday.

### Slot Holds

`slot_holds` temporarily reserves a provider interval for a customer. Holds start as `ACTIVE` and become `CONSUMED` or `EXPIRED`.

### Appointments

`appointments` stores the provider, service, customer, interval, state, notes, and timestamps.

### Waitlist

`waitlist` stores a preferred time range. When a compatible appointment is canceled or moved, the oldest waiting entry is booked automatically.

### Reminders

`reminders` records confirmation, upcoming, rescheduled, canceled, and waitlist-promotion notifications.

## Availability Algorithm

1. Resolve provider working hours for the requested UTC date.
2. Walk the working window in 15-minute increments.
3. Apply the selected service duration.
4. Exclude slots in the past.
5. Exclude overlaps with booked appointments.
6. Exclude overlaps with active, unexpired holds.

## Conflict Safety

Booking validates the interval and then starts a SQLite `BEGIN IMMEDIATE` transaction. It checks conflicts again before inserting the appointment. This second check models the required production pattern: availability queries are advisory, while booking must enforce exclusivity at write time.

## Waitlist Promotion

Cancellation and rescheduling expose the old interval. The system selects the oldest waiting entry whose preferred range includes that start time, books the slot, marks the waitlist entry `PROMOTED`, and records a notification.

## Reminder Rules

- Booking confirmation is sent immediately.
- Reschedule, cancellation, and waitlist promotion produce immediate notifications.
- Upcoming reminders are generated once for booked appointments starting within 24 hours.

## Utilization

Daily utilization compares scheduled minutes in `BOOKED`, `COMPLETED`, and `NO_SHOW` appointments against the provider's working minutes for that weekday.

## Failure Modes

- Availability can become stale between query and booking.
- Expired holds need regular cleanup.
- Provider-local time and daylight saving transitions require timezone-aware conversion.
- External notification delivery can fail after the appointment transaction commits.
- Waitlist promotion can need customer confirmation instead of immediate booking.

## Production Extensions

- PostgreSQL exclusion constraints or distributed slot locking
- IANA timezone conversion and daylight saving handling
- Multiple working windows and provider breaks
- Appointment buffers and resource/room constraints
- Idempotency keys for booking and cancellation
- Notification queue with retries
- Calendar provider synchronization
- Waitlist offer/accept expiration
- Payment or deposit collection
- Recurring appointments
