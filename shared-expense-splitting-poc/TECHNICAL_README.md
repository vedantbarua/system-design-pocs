# Shared Expense Splitting Technical README

## Architecture

```text
React dashboard
      |
      v
Express JSON API
      |
      +-- expense validation
      +-- split allocation
      +-- immutable ledger
      +-- balance projection
      +-- settlement simplification
      +-- recurring/reminder jobs
```

The backend keeps domain logic in `src/core.js`, separate from Express routing. This allows the financial rules to be tested without starting an HTTP server.

## Money Model

Every monetary value is an integer number of cents. No balance or split calculation uses floating-point currency values.

Remainder cents from weighted splits are assigned deterministically by fractional remainder and user id, ensuring the allocated shares always equal the expense total.

## Ledger Model

Each expense creates:

- Positive entries for payer contributions
- Negative entries for member shares

The sum of entries for one expense is zero.

An edit never mutates financial history. The original expense is marked reversed, inverse entries are appended, and a replacement expense posts a new version.

## Balance Projection

A member balance is the sum of that member's ledger entries:

- Positive: the member should receive money
- Negative: the member owes money
- Zero: settled

Repayments append a positive entry for the payer and a negative entry for the receiver, reducing both open positions.

## Settlement Simplification

The simplifier separates positive balances into creditors and negative balances into debtors. It greedily matches the largest remaining amounts until all positions reach zero.

This produces a compact valid settlement plan, though it is not a general optimization solver for every possible objective.

## Split Types

- `equal`: identical weights
- `exact`: explicit cent values that must equal the expense total
- `percentage`: weights that must total 100
- `shares`: arbitrary positive relative weights

Multiple payer contributions must also sum exactly to the expense total.

## Consistency Considerations

The POC uses in-memory synchronous state. A production implementation should:

- Wrap expense and ledger writes in one database transaction
- Require idempotency keys
- Add optimistic locking for edits
- Store immutable ledger rows in a relational database
- Rebuild balance projections from the ledger
- Protect group membership and write operations with authorization
