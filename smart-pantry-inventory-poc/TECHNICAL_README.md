# Smart Pantry Inventory: Technical Design

## Problem Statement

Household stock appears simple until the system must reconcile repeated scans, partial consumption, multiple expiration dates, shared shopping updates, and delayed events. A useful design needs a durable ledger, deterministic allocation rules, and projections that can be rebuilt after failure.

## Architecture Overview

```text
React dashboard
      |
Express API ---- barcode lookup
      |
stock command validation
      |
Kafka / memory broker ---> stock-event consumer
      |                         |
      +------> pantry domain ledger
                         |      |
                    PostgreSQL  Redis
                    snapshot +  shopping/jobs
                    event log   projections
```

The API supports synchronous event application for a responsive demo and asynchronous publication for broker-focused flows. Both paths reach the same idempotent domain handler.

## Core Data Model

- `Product`: barcode, category, unit, default location, and low-stock threshold.
- `InventoryLot`: remaining and initial quantity, expiry, received time, location, and unit cost.
- `StockEvent`: immutable business movement with a stable event key and lot allocations.
- `ShoppingItem`: manual or low-stock-derived demand with a small status machine.
- `PantryJob`: retryable expiration scans and shopping projection rebuilds.
- `AuditEvent`: actor, action, timestamp, and structured details.

## Request And Event Flow

### Receive Stock

1. Validate product, event ID, and positive quantity.
2. Build the idempotency key as `productId:eventId`.
3. Reject a processed key as a successful duplicate.
4. Create a new inventory lot.
5. Append the stock event and refresh the low-stock projection.
6. Persist state and mirror projections.

### Consume Or Waste Stock

1. Verify total stock can satisfy the requested quantity.
2. Sort active lots by expiry and then received time.
3. Allocate quantity across lots in first-expire-first-out order.
4. Record exact lot allocations on the event.
5. Refresh the low-stock projection and audit the mutation.

### Asynchronous Ingress

The producer partitions stock events by product ID. The consumer calls the same handler used by the synchronous API. Stable event keys make replay and at-least-once delivery safe for already-applied events.

### Background Work

Expiration scans and projection rebuilds are deduplicated by time window. Jobs transition through `QUEUED`, `RUNNING`, `RETRY`, `COMPLETED`, or `DEAD`. The failure control demonstrates retry behavior without external fault injection.

## Key Tradeoffs

### Snapshot Plus Event Table

The POC persists a full state snapshot for simple restart behavior and separately appends stock events for traceability. A production system would make the event append and aggregate version update transactional, then derive projections asynchronously.

### Synchronous Demo Path

`POST /api/stock/events` publishes and applies immediately so the UI remains deterministic. `POST /api/stock/events/publish` exposes the true delayed-consumer path. Production would normally acknowledge broker acceptance and let consumers own projection updates.

### FEFO Allocation

First-expire-first-out reduces waste and is deterministic. It requires lot-level state and makes a single product quantity insufficient as the source of truth.

### Automatic Shopping Projection

Low-stock items are derived from inventory. Manual items coexist in the same view but remain independently managed, avoiding accidental deletion during a projection rebuild.

## Failure Handling

- Duplicate Kafka delivery is absorbed by stable processed-event keys.
- Insufficient stock rejects the whole command before any lot changes.
- Job attempts retain errors and retry up to a fixed maximum.
- Kafka, PostgreSQL, and Redis connection failures fall back to in-memory adapters.
- Projection rebuild jobs can repair low-stock shopping state.
- Audit records expose stock mutations and worker outcomes.

## Scaling Path

1. Partition the stock topic by household and product while preserving per-product order.
2. Add optimistic aggregate versions to reject concurrent stale writes.
3. Store stock events and an outbox row in one PostgreSQL transaction.
4. Move workers into separate consumer processes with retry topics and a dead-letter topic.
5. Materialize inventory and shopping views in dedicated read tables.
6. Shard households by stable household ID and route commands consistently.
7. Archive cold stock events while retaining periodic aggregate snapshots.

## What Is Intentionally Simplified

- One seeded household and a fixed product catalog
- No authentication, household invitations, or row-level access policy
- No unit conversion, decimal quantities, recipes, or nutrition data
- No real barcode-provider integration
- No transaction spanning the snapshot and appended event table
- No WebSocket fanout between household devices
- Jobs run inside the API process
