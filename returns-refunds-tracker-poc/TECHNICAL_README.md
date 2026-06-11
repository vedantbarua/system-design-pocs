# Returns and Refunds Tracker Technical README

## Problem Statement

A return crosses several independently updated systems: the original purchase, merchant authorization, reverse logistics, warehouse inspection, and payment settlement. Provider events may be duplicated or delayed, while the customer-facing system must maintain one consistent view of deadlines and money owed.

## Architecture Overview

```text
React operations dashboard
          |
          v
Express workflow API
          |
          +-- return state machine
          +-- line-item approval rules
          +-- SLA projection
          +-- refund reconciliation
          +-- provider event validation
          |
          +--> PostgreSQL JSONB snapshot
          +--> PostgreSQL immutable event log
          +--> Redis webhook dedupe keys
          +--> Redis hot snapshot
          +--> Redis operational stream
```

Domain rules live in `backend/src/core.js`. Infrastructure is isolated behind the repository contract in `backend/src/repository.js`, allowing unit tests and local demos to use memory mode.

## Core Data Model

### Purchase

- Merchant and order number
- Purchase date and payment method
- Receipt reference
- Line items with quantity and integer-cent unit price

### Return Case

- RMA and lifecycle state
- Requested line-item quantities
- Approved quantities and fees
- Return-window, ship-by, and refund deadlines
- Reverse carrier and tracking number
- Expected, posted, and outstanding refund cents

### Provider Event

- Stable provider event ID
- Source, type, occurrence time, and receipt time
- Applied flag and ignored reason
- User-facing audit message

### Refund Ledger Entry

- Return and payment-provider identifiers
- Provider refund ID
- Integer-cent amount
- Posting timestamp and status

## State and Event Flow

1. A customer selects purchased line items and quantities.
2. The merchant authorizes or rejects the request.
3. A label is issued and reverse-carrier events move the case to received.
4. Inspection approves full or partial quantities and optional fees.
5. The approved value becomes the maximum refundable amount.
6. Payment webhooks append ledger entries.
7. Reconciliation derives `REFUND_PENDING`, `PARTIALLY_REFUNDED`, or `REFUNDED`.
8. SLA projection compares the current date with the relevant case deadline.

## Financial Invariants

- Every monetary value is an integer number of cents.
- Return quantity cannot exceed purchased quantity.
- Approved quantity cannot exceed returned quantity.
- Fees cannot exceed approved merchandise value.
- Cumulative refunds cannot exceed expected refund value.
- Duplicate payment events cannot change balances twice.

## Ordering and Idempotency

Provider event keys use provider plus stable event ID. Redis claims those keys using `SET NX EX` for cross-process duplicate suppression, while the domain store also retains processed keys.

Events older than a case's latest applied event remain in audit history with `OUT_OF_ORDER` and do not change the projection. Invalid state transitions are retained similarly.

## Persistence Design

PostgreSQL contains:

- A JSONB aggregate snapshot for compact POC persistence
- An immutable provider-event table keyed by event key

Redis contains:

- Expiring idempotency claims
- A five-minute hot snapshot
- A bounded operational event stream

A production design would normalize purchases, return cases, line items, refunds, and alerts into relational tables and update them transactionally.

## Failure Handling

- Missing PostgreSQL or Redis falls back to memory mode at startup.
- Unsupported provider states fail before mutation.
- Duplicate events return a successful suppression result.
- Over-refund attempts fail validation.
- Stale events remain available for investigation.
- SLA alerts are deterministically rebuildable from deadlines.

## Scaling Path

- Partition return cases by customer or merchant.
- Put incoming provider events on Kafka or a durable queue.
- Process merchant, carrier, and payment streams independently.
- Use a transactional outbox for alerts and customer notifications.
- Build materialized queue views for support teams.
- Reconcile payment settlements in scheduled batches.
- Store receipts and evidence in object storage.

## Intentionally Simplified

- No actual merchant, carrier, or payment credentials
- No tax or currency allocation
- No receipt image storage or OCR
- No exchange workflow
- No authentication or customer tenancy
- No background workers
- No chargeback integration
