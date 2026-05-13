# Multi-Region Active-Active POC

A Spring Boot proof-of-concept for accepting writes in multiple regions, replicating asynchronously, simulating regional outages, and handling conflicting cart versions.

## Goal

Show the system design tradeoffs behind active-active deployments: local write availability, replication lag, stale regional state, outage recovery, and conflict resolution.

## What It Covers

- Three in-memory regions: `us-east`, `us-west`, and `eu-central`
- Local shopping cart writes accepted by any active region
- Per-region vector clocks for causality tracking
- Async replication events queued between regions
- Region down/recovery simulation
- Manual replication draining to expose lag and convergence
- Conflict strategies:
  - `VECTOR_CLOCK` detects concurrent writes and records unresolved conflicts
  - `LAST_WRITE_WINS` resolves concurrent writes by newer simulated version
  - `CART_MERGE` merges concurrent cart contents by SKU
- Dashboard for region state, pending replication, conflicts, and audit events

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd multi-region-active-active-poc
   mvn spring-boot:run
   ```
3. Open `http://localhost:8157`.

## UI Flows

- Write `cart-42` in `us-east`, then drain replication and watch the cart appear in the other regions.
- Write the same cart in `us-east` and `us-west` before draining with `VECTOR_CLOCK` to create conflicts.
- Repeat concurrent writes with `CART_MERGE` to observe automatic convergence.
- Mark `us-west` down, write in `us-east`, drain replication, then restore `us-west` and drain its queued event.
- Drop queued replication events for a cart to simulate message loss.
- Resolve a detected conflict with cart merge or last-write-wins.

## JSON Endpoints

- `GET /api/snapshot` inspect regions, carts, vector clocks, pending replication, conflicts, and recent events
- `POST /api/carts/items` apply a local cart mutation in one region
- `POST /api/regions/mode` mark a region active or down
- `POST /api/replication/drain` apply queued replication events
- `POST /api/replication/drop` remove queued replication events matching optional filters
- `POST /api/conflicts/reconcile` resolve a recorded conflict

Example cart mutation:

```json
{
  "regionId": "us-east",
  "cartId": "cart-42",
  "sku": "sku-keyboard",
  "quantityDelta": 1,
  "strategy": "VECTOR_CLOCK"
}
```

Example replication drain:

```json
{
  "targetRegionId": "us-west",
  "maxEvents": 20,
  "strategy": "CART_MERGE"
}
```

Example region outage:

```json
{
  "regionId": "us-west",
  "active": false
}
```

## Configuration

- `server.port` defaults to `8157`
- `regions.initial` defaults to `us-east,us-west,eu-central`
- `replication.history-limit` controls retained audit events

## Notes and Limitations

- All state is in memory and resets on restart.
- Replication is manual rather than background scheduled so lag is easy to inspect.
- Event delivery is modeled as an in-process queue, not Kafka, Pulsar, SQS, or a real WAN link.
- `CART_MERGE` uses a simplified max-quantity merge for concurrent SKU values.
- Last-write-wins uses a simulated monotonically increasing version, not real wall-clock timestamps.
- There is no authentication, tenant isolation, persistent storage, or automatic anti-entropy repair loop.

## Technologies Used

- Spring Boot 3.2
- Spring MVC
- Thymeleaf
- Java 17
- JUnit 5
- In-memory region state and replication queues
