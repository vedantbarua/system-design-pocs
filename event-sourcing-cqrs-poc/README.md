# Event Sourcing + CQRS POC

Spring Boot proof-of-concept for an order domain built on an append-only event store with optimistic concurrency, aggregate replay, snapshots, idempotent commands, and projection rebuilds.

## Goal

Demonstrate how a write model and read model diverge cleanly while still staying reconstructable from immutable domain events.

## What It Covers

- Command side for `create`, `add item`, `confirm`, and `cancel`
- Append-only event log with per-aggregate version checks
- Aggregate reconstruction from events plus snapshot acceleration
- Read-side projections for order summaries and event metrics
- Command idempotency using a caller-supplied `commandId`
- Full projection rebuild from the canonical event store
- Dashboard for event streams, snapshots, projection state, and recent command outcomes

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd event-sourcing-cqrs-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8136`.

## UI Flows

- Create a new order with an explicit expected version
- Append item events and see totals update in the read model
- Confirm or cancel an order from the command side
- Rebuild projections from the full event log
- Inspect aggregate snapshots and recent immutable events

## JSON Endpoints

- `GET /api/snapshot` inspect config, events, snapshots, projections, and recent command results
- `POST /api/commands/create-order` create a new order
- `POST /api/commands/add-item` append an `ItemAdded` event
- `POST /api/commands/confirm-order` append an `OrderConfirmed` event
- `POST /api/commands/cancel-order` append an `OrderCancelled` event
- `POST /api/projections/rebuild` rebuild all read models from the event log
- `GET /api/orders/{orderId}` query one projected order summary
- `GET /api/orders/{orderId}/events` inspect the aggregate event stream

Example create-order request:

```json
{
  "orderId": "order-101",
  "customerId": "cust-7",
  "expectedVersion": 0,
  "commandId": "cmd-create-101"
}
```

Example add-item request:

```json
{
  "orderId": "order-101",
  "sku": "sku-headphones",
  "quantity": 2,
  "unitPrice": 79.99,
  "expectedVersion": 1,
  "commandId": "cmd-add-101-a"
}
```

## Notes

- Storage is fully in memory and resets on restart.
- Commands must provide the current expected aggregate version to model optimistic concurrency.
- The read model is rebuilt from the canonical event log, not from current in-memory aggregate state.
- Snapshots are created automatically after every configured number of new aggregate events.

## Technologies

- Spring Boot 3.2
- Thymeleaf
- Java 17
- In-memory event store, snapshot store, and projection store
