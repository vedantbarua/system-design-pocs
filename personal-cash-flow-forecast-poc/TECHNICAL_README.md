# Personal Cash Flow Forecast: Technical Design

## Problem Statement

Bank feeds are not an ordered CRUD stream. Transactions arrive pending, change identifiers when posted, repeat after webhook retries, and can arrive late. A forecast is only useful when the underlying ledger avoids duplicate or stale money movements.

## Architecture Overview

```text
React dashboard -> Express API -> transaction domain
                                      |
                         Kafka / memory broker
                                      |
                            idempotent consumer
                                      |
                 PostgreSQL ledger + Redis projections
                                      |
             categorization / recurrence / forecast workers
```

The synchronous endpoint provides immediate demo feedback. The publish-only endpoint demonstrates delayed consumer processing through the same domain handler.

## Core Data Model

- `Account`: institution, account type, and opening balance in cents.
- `Transaction`: provider identity, event identity, lifecycle state, amount, merchant, category, and timestamps.
- `CategoryRule`: prioritized normalized-merchant match.
- `RecurringPattern`: inferred cadence, average amount, confidence, and next date.
- `Budget`: monthly category limit.
- `ForecastEntry`: expected recurring movement and resulting projected balance.
- `CashFlowJob`: retryable projection work.
- `AuditEvent`: structured domain and worker history.

## Request And Event Flow

### Ingestion

1. Validate the account, merchant, and integer-cent amount.
2. Deduplicate using `providerTransactionId:eventId`.
3. Reject a pending update when the same provider transaction is already posted.
4. For posted replacements, mark the referenced pending transaction reconciled.
5. Categorize the normalized merchant using highest-priority matching rules.
6. Append the new transaction and rebuild affected projections.

### Balance Semantics

Posted balance includes only `POSTED` transactions. Available balance also includes `PENDING` movements. `RECONCILED` and `REVERSED` rows remain auditable but do not affect either balance.

### Recurrence And Forecast

Posted transactions are grouped by account and normalized merchant. Groups with at least two events and an average 20-40 day interval become recurring patterns. The forecast advances each pattern through the configured horizon, orders expected events, and applies each amount to the current available balance.

## Key Tradeoffs

- Integer cents avoid binary floating-point errors but do not solve multi-currency conversion.
- Merchant rules are explainable but less flexible than a trained classifier.
- Statistical cadence detection is transparent but intentionally conservative.
- A snapshot simplifies restart behavior; production writes need transactional aggregate versions and an outbox.
- The forecast is deterministic and inspectable, but excludes uncertainty bands and non-recurring planned payments.

## Failure Handling

- Event keys absorb provider webhook retries.
- Lifecycle precedence blocks stale pending events.
- Pending references prevent temporary and posted charges from double-counting.
- Jobs retain attempts and last errors before dead-letter state.
- Projection rebuilds repair categorization, recurrence, and forecast views.
- Infrastructure adapters degrade to memory mode when dependencies are unavailable.

## Scaling Path

1. Partition Kafka and storage by user or household ID.
2. Persist transaction state and an outbox row atomically.
3. Add optimistic versions for provider transaction transitions.
4. Move projection workers into independent consumer groups.
5. Materialize account, budget, and forecast read models in dedicated tables.
6. Introduce model-versioned recurrence and categorization pipelines.
7. Archive old events while retaining reconciliation lineage.

## What Is Intentionally Simplified

- One user, one institution, two accounts, and USD only
- No authentication, bank-link flow, or secrets management
- Fixed seeded category rules and budgets
- No transfers, split transactions, refunds, or chargebacks
- No probabilistic forecast intervals
- In-process workers and JSON snapshot persistence
