# Technical Notes

## Architecture

- `EventSourcingService` owns the command side, event store, snapshot store, and projection rebuild path.
- Commands validate against the current aggregate version before appending new events.
- Aggregates are reconstructed by replaying events after the latest stored snapshot.
- Projections are maintained as denormalized order summaries plus portfolio-style counters.

## Domain Model

- Aggregate: `Order`
- Commands:
  - `CreateOrder`
  - `AddItem`
  - `ConfirmOrder`
  - `CancelOrder`
- Events:
  - `OrderCreated`
  - `ItemAdded`
  - `OrderConfirmed`
  - `OrderCancelled`

## CQRS Split

- Write side:
  - validates invariants
  - checks optimistic version
  - appends immutable events
  - creates snapshots
- Read side:
  - projects the append-only log into order summaries
  - tracks counts by status
  - can be rebuilt from scratch without touching command logic

## Snapshotting

- Each aggregate snapshot stores:
  - aggregate id
  - aggregate version
  - status
  - customer id
  - item state
  - total quantity
  - total amount
- Replay starts at the latest snapshot version and applies only newer events.

## Idempotency

- A client-provided `commandId` is remembered with the previous command outcome.
- Repeating the same command with the same `commandId` returns the original outcome instead of appending duplicate events.

## Limitations

- Single-process, in-memory state only
- No durable broker or external database
- Projection rebuild is synchronous
- Only one aggregate type is modeled in this POC
