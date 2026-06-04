# Subscription Billing Reminder Technical README

## Architecture

The POC is a small subscription billing service. Customers subscribe to plans. Billing jobs generate invoices, payment jobs attempt collection, dunning jobs retry failed payments, and reminder jobs notify customers about upcoming or failed billing events.

```text
Customers + Plans
       |
       v
Subscription Billing Service
       |
       +-- subscriptions
       +-- invoices
       +-- payment attempts
       +-- reminder log
       +-- audit events
```

## Data Model

### Customers

`customers` stores contact information and simulated payment behavior.

### Plans

`plans` defines price, billing interval, and trial days.

### Subscriptions

`subscriptions` tracks plan, customer, state, trial end, next bill date, grace period, dunning count, retry limit, and cancellation time.

### Invoices

`invoices` stores billable amounts, status, due date, and paid date. Invoice generation is idempotent for `(subscription_id, due_at)`.

### Payment Attempts

`payment_attempts` records every attempt against an invoice. The result is either `SUCCEEDED` or `FAILED`.

### Reminders

`reminders` is a notification log for trial ending, renewal upcoming, payment failed, grace ending, and canceled messages.

## Billing Cycle

`run_billing_cycle` performs three steps:

1. Generate invoices for subscriptions due within the horizon.
2. Attempt payment for open invoices that are due now or overdue.
3. Generate reminders for trial, renewal, and grace-period windows.

The separate endpoints allow each step to be exercised independently.

## Status Transitions

Successful payment:

```text
TRIALING/ACTIVE/PAST_DUE/GRACE_PERIOD -> ACTIVE
invoice OPEN -> PAID
dunning_count -> 0
next_bill_at -> now + interval_days
```

First failed payment:

```text
ACTIVE -> GRACE_PERIOD
invoice OPEN -> FAILED
dunning_count -> 1
send PAYMENT_FAILED reminder
```

Subsequent failed retries:

```text
GRACE_PERIOD -> PAST_DUE
dunning_count increments
```

Retry exhaustion:

```text
PAST_DUE/GRACE_PERIOD -> CANCELED
send CANCELED reminder
```

## Reminder Rules

Reminder generation scans current subscriptions:

- Trial ending when trial ends within 3 days.
- Renewal upcoming when next bill date is within 5 days.
- Grace ending when grace period ends within 1 day.
- Payment failed and canceled reminders are emitted by payment handling.

## API Shape

Read endpoints:

- `/snapshot`
- `/customers`
- `/plans`
- `/subscriptions`
- `/invoices`
- `/payments`
- `/reminders`
- `/audit`

Write endpoints:

- `POST /customers`
- `POST /plans`
- `POST /subscriptions`
- `POST /invoices/generate`
- `POST /billing/run`
- `POST /payments/retry`
- `POST /reminders/generate`

## Failure Modes

- Duplicate reminder sends need stronger idempotency in production.
- Payment retries should use backoff and provider idempotency keys.
- Invoice generation should lock subscription rows in a concurrent system.
- Timezone-sensitive billing needs local calendar semantics, not only epoch seconds.
- Cancellation should coordinate with entitlement access.

## Production Extensions

- Payment provider integration with idempotency keys
- Tax calculation and invoice line items
- Proration for plan changes
- Coupons and discounts
- Account credits and refunds
- Webhook handling for asynchronous payment results
- Email/SMS provider integration
- Entitlement service integration
- Customer billing portal
- Revenue metrics and churn reporting
