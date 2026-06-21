# Improvements

## Production Gaps

1. Integrate a bank aggregation provider with cursor-based sync and webhook verification.
2. Support transfers, refunds, chargebacks, split transactions, and multi-currency accounts.
3. Add editable rules, budgets, planned payments, goals, and forecast scenarios.
4. Add user authentication and consent-based account access.
5. Track provider sync health, account freshness, and disconnected institutions.

## Reliability Improvements

1. Persist lifecycle transitions with optimistic versions and database constraints.
2. Commit transaction updates and outbox records atomically.
3. Store processed event IDs durably with provider-specific retention.
4. Add retry topics, exponential backoff, dead-letter routing, and replay tooling.
5. Reconcile local balances against provider-reported balances on a schedule.

## Scaling Improvements

1. Partition event streams and tables by stable user ID.
2. Separate ingestion, categorization, recurrence, forecast, and alert workers.
3. Incrementally update projections instead of rebuilding after every event.
4. Batch historical sync and enforce provider-specific backpressure.
5. Archive cold ledger events and paginate all histories.

## Security Improvements

1. Encrypt provider tokens using envelope encryption and rotate keys.
2. Verify webhook signatures and reject replay outside a bounded window.
3. Enforce row-level user isolation and least-privilege service identities.
4. Redact merchant and account data from logs and traces.
5. Add immutable security audits for account linking and export operations.

## Testing Improvements

1. Add PostgreSQL, Redis, and Redpanda integration tests with Testcontainers.
2. Add property tests proving reconciliation never double-counts balances.
3. Add ordering tests for pending, posted, reversed, and replayed events.
4. Add model fixtures for irregular recurring patterns and amount drift.
5. Add Playwright coverage for ingestion, filtering, forecast, retries, and mobile layouts.
