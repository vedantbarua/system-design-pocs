# Package Delivery Tracker Technical README

## Problem Statement

Carriers expose different event names, delivery states, polling behavior, and webhook guarantees. Events can be duplicated, delayed, or delivered out of order. A unified tracker must retain the raw history while preventing stale updates from regressing the customer-visible package state.

## Architecture Overview

```text
Carrier webhooks ----+
                     |
Carrier poller ------+--> Express ingestion API
                              |
                              +--> carrier status normalization
                              +--> event idempotency check
                              +--> transition and ordering validation
                              +--> package projection update
                              +--> notification decision
                              |
                              +--> Redis dedupe keys
                              +--> Redis snapshot
                              +--> Redis Stream + Pub/Sub
                                      |
                                      v
                                React dashboard
```

The domain model in `backend/src/core.js` is independent of Express and Redis. `backend/src/repository.js` supplies compatible Redis and in-memory persistence adapters.

## Core Data Model

### Package

- Household, carrier, and tracking number
- Merchant, description, and recipient
- Current normalized state
- ETA, delivery window, and last known location
- Last applied event timestamp
- Notification preferences

### Carrier Event

- Stable carrier event ID or derived event key
- Raw carrier status
- Normalized status
- Occurrence and receipt timestamps
- Projection-applied flag
- Ignored reason
- Source: webhook, poll, or seed

### Notification

- Package and household IDs
- Delivery event type
- Channel and queued status
- User-facing title

## Request and Event Flow

1. The API builds an idempotency key from carrier plus event ID.
2. Redis claims that key with `SET NX EX`.
3. The raw carrier status is mapped to a normalized delivery state.
4. The event occurrence time is compared with the package's latest applied event.
5. The state machine validates the proposed transition.
6. Every unique event is appended to audit history.
7. Valid current events update the package projection.
8. Notification preferences determine whether an alert is queued.
9. The latest state is persisted and the event is appended to a Redis Stream.
10. The event is also published for future real-time subscribers.

## Ordering and Idempotency

An event older than `lastEventAt` is retained with `projectionApplied=false` and `ignoredReason=OUT_OF_ORDER`. This preserves evidence without overwriting newer state.

Delivered packages reject state regression. Exceptions may recover to in-transit or out-for-delivery because carriers commonly clear temporary delays.

The domain store retains processed event keys, while Redis provides cross-process suppression. Exactly-once processing is not claimed; the design makes at-least-once delivery effects idempotent.

## Key Tradeoffs

- One JSON snapshot keeps the Redis adapter understandable but creates a large write unit.
- A strict timestamp comparison is easy to explain but does not resolve carrier clock skew.
- The state machine prevents obvious regressions but cannot model every carrier-specific correction.
- Polling is user-triggered so the queue and scheduler concerns stay visible rather than hidden in timers.

## Failure Handling

- Redis connection failure at startup falls back to memory mode.
- Duplicate carrier events return a successful suppressed result.
- Unsupported status codes fail validation before projection changes.
- Out-of-order and invalid transitions remain visible in the event stream.
- Redis stream retention is bounded to prevent unlimited POC growth.

## Scaling Path

- Partition ingestion by tracking-number hash.
- Store immutable events in Kafka, Kinesis, or a durable log.
- Materialize package projections in PostgreSQL or DynamoDB.
- Use Redis only for hot projections, locks, and deduplication.
- Move polling into a distributed scheduler with carrier-specific rate limits.
- Consume notification decisions through a transactional outbox.
- Fan out live updates through WebSockets backed by Redis Pub/Sub.

## Intentionally Simplified

- No real carrier credentials or webhook signatures
- No household authentication
- No address normalization
- No timezone model per delivery destination
- No proof-of-delivery images
- No background poll workers
- No notification provider integration
