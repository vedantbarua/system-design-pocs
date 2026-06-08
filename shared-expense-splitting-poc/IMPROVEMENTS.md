# Shared Expense Splitting Improvements

## Production Hardening

- Persist groups, expenses, and ledger entries in PostgreSQL.
- Use transactions for every expense, reversal, and repayment.
- Add idempotency keys for financial writes.
- Add authentication and group-level authorization.
- Add optimistic concurrency controls for edits.
- Add audit metadata such as actor, device, and request id.
- Support multiple currencies without mixing group ledgers.

## Product Extensions

- Add invitations and member management.
- Add receipt image uploads and OCR.
- Add comments and expense attachments.
- Add payment-provider links for settlements.
- Add recurring rule editing and pause controls.
- Add category budgets and monthly reports.
- Add CSV/PDF exports.
- Add offline-first mobile synchronization.

## Testing Gaps

- Add Express integration tests.
- Add React interaction tests.
- Add property-based tests for arbitrary split inputs.
- Add concurrent expense-edit tests.
- Add large-ledger balance reconstruction tests.
- Add browser visual regression tests.
