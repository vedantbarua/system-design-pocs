# Multi-Region Active-Active Technical README

## Problem Statement

Active-active systems improve write availability and latency by allowing users to write to a nearby region. The tradeoff is that regions may temporarily disagree while asynchronous replication catches up. If two regions update the same logical record before seeing each other, the system must detect or resolve the conflict.

This POC models that problem with shopping carts because cart state is easy to inspect and has realistic conflict scenarios.

## Architecture Overview

The application is a single Spring Boot process that simulates a three-region deployment:

- `us-east`
- `us-west`
- `eu-central`

Each region has independent local cart state and a local logical clock. A write is accepted only by the selected active region. The service snapshots the changed cart into replication events, one event per peer region. Draining replication applies those queued events to reachable target regions.

The central class is `MultiRegionReplicationService`.

Main responsibilities:

- validate region/cart/SKU inputs
- apply local cart writes
- increment the writing region's vector-clock entry
- enqueue replication events to peer regions
- apply or skip remote events based on vector-clock comparison
- record conflicts when concurrent versions are detected
- expose read-only snapshots for the UI and JSON API

## Core Data Model

`RegionState`

- `regionId`
- `active`
- `localClock`
- `carts`

`CartState`

- `cartId`
- `items`
- `vectorClock`
- `version`
- `lastWriterRegion`
- `updatedAt`

`ReplicationEvent`

- source region
- target region
- cart snapshot
- vector clock at write time
- simulated version
- pending status and reason

`ConflictRecord`

- target region
- local cart version
- incoming cart version
- detected timestamp

Public records such as `SystemSnapshot`, `RegionView`, `CartView`, `ReplicationEventView`, and `ConflictView` keep controller responses stable and UI-friendly.

## Request And Event Flow

### Local Write

1. `POST /api/carts/items` selects a write region.
2. The service rejects the write if the region is down.
3. The cart is created or updated in that region.
4. The region's local clock increments.
5. The cart vector clock stores the new local clock value.
6. The service queues one replication event for each other region.

### Replication Drain

1. `POST /api/replication/drain` selects an optional target region and max event count.
2. Matching pending events are removed from the queue when the target region is active.
3. The target compares its local cart vector clock with the incoming vector clock.
4. Dominating incoming versions replace local state.
5. Older incoming versions are skipped.
6. Concurrent versions are handled according to the requested strategy.

### Conflict Detection

Vector clocks are compared across the union of known regions:

- local dominates incoming: skip the event
- incoming dominates local: apply the event
- equal: skip duplicate state
- both have greater entries: concurrent update

With `VECTOR_CLOCK`, concurrent updates are recorded as unresolved conflicts. With `LAST_WRITE_WINS`, the newer simulated version wins. With `CART_MERGE`, item maps are merged and vector clocks are combined by max region clock.

## Key Tradeoffs

- **Availability over immediate consistency:** active regions accept local writes without waiting for remote acknowledgement.
- **Manual replication:** the POC uses explicit draining so reviewers can see lag and convergence.
- **Vector clocks over single versions:** vector clocks distinguish stale updates from truly concurrent updates.
- **Domain merge is explicit:** the cart merge strategy shows that conflict resolution is business logic, not only infrastructure logic.
- **Single process simulation:** this keeps the demo runnable while preserving the important state transitions.

## Failure Handling

Region failures are simulated by marking a region down:

- local writes to that region are rejected
- replication events targeting that region stay queued
- restoring the region allows queued events to drain

Message loss is simulated by dropping queued replication events. The POC does not automatically repair dropped events; a production system would need periodic anti-entropy, version scans, or repair jobs.

## Scaling Path

A production version would replace the in-memory process with:

- regional databases or partitioned storage
- durable event logs per region
- cross-region replication streams
- idempotent event application
- background replication workers
- anti-entropy repair
- conflict queues and operator tooling
- tenant-aware routing and auth
- metrics for lag, conflict rate, apply latency, and data divergence

## What Is Intentionally Simplified

- No real network, WAN latency, TLS, or service discovery.
- No durable storage or database transactions.
- No partitioned cart ownership or tenant-level routing.
- No automatic background replication worker.
- No full CRDT implementation.
- No guaranteed exactly-once delivery.
- No production-grade conflict policy for every cart operation.
