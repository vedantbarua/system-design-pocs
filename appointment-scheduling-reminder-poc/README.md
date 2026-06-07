# Appointment Scheduling Reminder POC

Python proof-of-concept for everyday appointment scheduling: providers, services, working hours, availability, expiring slot holds, conflict-safe booking, rescheduling, cancellation, waitlist promotion, reminders, no-shows, and utilization.

## Goal

Show a workflow used by clinics, salons, tutors, repair services, consultants, and public offices. The interesting system behavior is preventing double booking while still supporting temporary holds, waitlists, reminders, and calendar changes.

## What It Covers

- Provider registry with location and timezone
- Service catalog with duration and price
- Provider-to-service assignments
- Weekly working hours
- Available slot generation in 15-minute increments
- Five-minute slot holds with expiration
- Conflict-safe appointment booking
- Reschedule and cancellation workflows
- Waitlist entries with automatic oldest-first promotion
- Appointment states:
  - `BOOKED`
  - `COMPLETED`
  - `CANCELED`
  - `NO_SHOW`
- Email reminder log simulation
- Upcoming appointment reminders
- Provider daily utilization
- Audit history
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd appointment-scheduling-reminder-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8175
```

Open:

```text
http://127.0.0.1:8175
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Seed a provider, services, working hours, customers, and an appointment.
2. Query available slots around the existing booking.
3. Place a temporary slot hold.
4. Convert the hold into a confirmed appointment.
5. Add a customer to the waitlist.
6. Cancel an appointment and automatically promote the oldest compatible entry.
7. Generate reminders for appointments within 24 hours.
8. Inspect provider utilization, appointments, waitlist, reminders, and audit events.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /providers`
- `GET /services`
- `GET /appointments`
- `GET /waitlist`
- `GET /reminders`
- `GET /audit`
- `GET /availability?provider_id=...&service_id=...&date=...`
- `GET /utilization?provider_id=...&date=...`
- `POST /providers`
- `POST /services`
- `POST /customers`
- `POST /holds`
- `POST /appointments`
- `POST /waitlist`
- `POST /reminders/generate`
- `POST /appointments/{appointment_id}/cancel`
- `POST /appointments/{appointment_id}/reschedule`
- `POST /appointments/{appointment_id}/status`

Example hold:

```json
{
  "provider_id": "provider-maya",
  "service_id": "haircut",
  "customer_id": "cust-ben",
  "start_at": 1781002800
}
```

Example booking from a hold:

```json
{
  "provider_id": "provider-maya",
  "service_id": "haircut",
  "customer_id": "cust-ben",
  "start_at": 1781002800,
  "hold_id": "hold-example"
}
```

Example waitlist entry:

```json
{
  "provider_id": "provider-maya",
  "service_id": "haircut",
  "customer_id": "cust-ben",
  "preferred_start": 1781002800,
  "preferred_end": 1781006400
}
```

## Configuration

- `--db-path` defaults to `runtime/appointments.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8175`

## Notes and Limitations

- Timestamps are interpreted in UTC; provider timezone is stored but not used for conversion.
- Availability uses 15-minute start increments.
- Holds last five minutes.
- Email delivery is represented by reminder log rows.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
