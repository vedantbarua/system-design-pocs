# Subscription Billing Reminder POC

Python proof-of-concept for a practical recurring subscription workflow: customers, plans, subscriptions, invoice generation, payment attempts, failed-payment dunning, grace periods, cancellations, reminder notifications, and audit history.

## Goal

Show a backend workflow used by everyday products like SaaS apps, gyms, streaming services, newsletters, and mobile apps: bill customers on a schedule, remind them before important dates, recover failed payments, and cancel only after retries.

## What It Covers

- Customer registry with payment behavior simulation
- Plan registry with price, billing interval, and trial days
- Subscription states:
  - `TRIALING`
  - `ACTIVE`
  - `PAST_DUE`
  - `GRACE_PERIOD`
  - `CANCELED`
- Upcoming invoice generation
- Idempotent invoice generation per subscription due date
- Payment attempts with success/failure simulation
- Failed-payment dunning retries
- Grace period handling
- Cancellation after retry exhaustion
- Reminder notification types:
  - `TRIAL_ENDING`
  - `RENEWAL_UPCOMING`
  - `PAYMENT_FAILED`
  - `GRACE_ENDING`
  - `CANCELED`
- Notification log simulation
- Audit log for billing events
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd subscription-billing-reminder-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8174
```

Open:

```text
http://127.0.0.1:8174
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Seed basic and pro monthly plans.
2. Seed trialing, active, and due subscriptions.
3. Generate renewal and trial-ending reminders.
4. Generate invoices for upcoming and overdue subscriptions.
5. Attempt due payments.
6. Move failed payments into grace/dunning flow.
7. Retry failed payments until cancellation.
8. Inspect `/snapshot`, `/subscriptions`, `/invoices`, `/payments`, `/reminders`, and `/audit`.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /customers`
- `GET /plans`
- `GET /subscriptions`
- `GET /invoices`
- `GET /payments`
- `GET /reminders`
- `GET /audit`
- `POST /customers`
- `POST /plans`
- `POST /subscriptions`
- `POST /invoices/generate`
- `POST /billing/run`
- `POST /payments/retry`
- `POST /reminders/generate`

Example customer:

```json
{
  "customer_id": "cust-ada",
  "email": "ada@example.com",
  "name": "Ada",
  "payment_behavior": "succeeds"
}
```

Example plan:

```json
{
  "plan_id": "pro-monthly",
  "name": "Pro Monthly",
  "price_cents": 2900,
  "interval_days": 30,
  "trial_days": 7
}
```

Example subscription:

```json
{
  "customer_id": "cust-ada",
  "plan_id": "pro-monthly"
}
```

Run billing:

```json
{}
```

## Configuration

- `--db-path` defaults to `runtime/billing.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8174`

## Notes and Limitations

- Payment behavior is simulated as `succeeds` or `fails`.
- Invoice generation is idempotent by subscription and due date.
- Reminders are logged as email records, not sent externally.
- Time is represented as epoch seconds.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
