# Returns and Refunds Tracker Improvements

## Production Gaps

1. Normalize PostgreSQL tables for purchases, line items, returns, events, refunds, and alerts.
2. Integrate real merchant, carrier, and payment-provider APIs.
3. Store receipts, labels, and inspection evidence in object storage.
4. Add customer identity, household tenancy, and role-based support access.
5. Support taxes, discounts, gift cards, and multiple currencies.

## Reliability Improvements

1. Add a durable queue between webhook receipt and projection processing.
2. Wrap refund ledger writes and return-state changes in one transaction.
3. Use a transactional outbox for email, SMS, and push alerts.
4. Add dead-letter handling for unsupported provider payloads.
5. Rebuild case projections by replaying immutable events.
6. Add scheduled settlement reconciliation against payment-provider reports.

## Scaling Improvements

1. Partition provider events by return ID.
2. Batch payment reconciliation jobs by provider account.
3. Cache support queue projections by merchant and SLA bucket.
4. Add incremental materialized views for financial exposure.
5. Archive closed cases and old event payloads by retention policy.

## Security Improvements

1. Verify webhook signatures for every provider.
2. Encrypt receipt references, payment metadata, and customer addresses.
3. Redact order numbers and payment identifiers in logs.
4. Add rate limits per provider and customer.
5. Retain immutable audit metadata for all manual actions.

## Testing Improvements

1. Add Express integration tests against ephemeral PostgreSQL and Redis.
2. Add property-based tests for arbitrary partial-refund sequences.
3. Add concurrent duplicate and over-refund tests.
4. Add contract tests for merchant and payment payload schemas.
5. Add infrastructure outage and recovery tests.
6. Add React interaction, accessibility, and visual regression tests.
