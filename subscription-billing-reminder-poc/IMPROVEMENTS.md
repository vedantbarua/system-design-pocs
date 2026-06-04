# Subscription Billing Reminder Improvements

## Next Engineering Steps

- Add payment provider idempotency keys.
- Add invoice line items, tax, and discounts.
- Add retry schedules with configurable backoff.
- Add customer-level billing portal actions.
- Add plan upgrade/downgrade and proration.
- Add entitlement activation/deactivation events.
- Add webhook ingestion for asynchronous payment results.
- Add email/SMS template rendering and provider status tracking.

## Production Hardening

- Lock subscription rows during invoice generation.
- Add unique indexes for invoice idempotency.
- Add distributed job workers for billing, retries, and reminders.
- Add dead-letter handling for failed provider calls.
- Encrypt payment method references.
- Add metrics for payment failure rate, recovery rate, churn, and invoice aging.
- Alert on billing job failures and spikes in failed payments.
- Add backup and restore tests for billing ledgers.

## Product Extensions

- Add coupons, free trials, and promotional credits.
- Add annual plans and calendar-month billing.
- Add refund and credit-note workflows.
- Add customer-facing invoice PDFs.
- Add self-service cancellation and pause.
- Add usage-based billing line items.
- Add revenue dashboard by plan and cohort.
- Add churn-risk reporting from dunning status.

## Testing Gaps

- Add HTTP endpoint tests for all routes.
- Add concurrency tests for duplicate billing jobs.
- Add calendar-boundary tests for monthly billing.
- Add payment provider webhook replay tests.
- Add large customer-volume billing run tests.
- Add property tests for dunning state transitions.
