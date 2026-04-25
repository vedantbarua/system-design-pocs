# LedgerFlow Improvements

## Production Gaps

- Add a real double-entry ledger with journal entries, chart of accounts, and close-period controls.
- Replace browser-only persistence with a backend API and durable database.
- Add invoice PDF generation, email delivery, payment links, and customer statements.
- Support accrual and cash-basis reporting modes.

## Reliability Improvements

- Use idempotency keys for invoice payment, bill payment, and bank-feed ingestion.
- Add immutable audit events for every financial mutation.
- Introduce background reconciliation jobs with retry and dead-letter queues.
- Add data export and restore tooling.

## Scaling Improvements

- Materialize financial report read models instead of recalculating from raw transactions.
- Partition ledger events by company ID.
- Add incremental bank-feed sync with cursor tracking.
- Cache commonly viewed dashboards and invalidate on ledger events.

## Security Improvements

- Add authentication, company membership, and role-based permissions.
- Encrypt sensitive bank connection metadata.
- Add approval workflows for vendor payments above configured thresholds.
- Log administrative actions and protect report exports.

## Testing Improvements

- Add unit tests for financial calculations, status transitions, and reconciliation suggestions.
- Add browser tests for invoice payment, bill payment, and matching flows.
- Add accessibility checks for navigation, forms, and table controls.
- Add regression fixtures for overdue dates and report calculations.
