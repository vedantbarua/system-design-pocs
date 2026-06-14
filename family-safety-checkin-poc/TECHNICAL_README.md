# Family Safety Check-in Technical README

## Problem Statement

A safety check-in system combines wall-clock deadlines, mobile command replay, temporary location data, trusted-contact escalation, notification delivery, and realtime household visibility. The system must avoid duplicate escalations, accept acknowledgements that were created offline, reject stale location updates, and expire sensitive location data predictably.

## Architecture Overview

```text
React safety workspace
        |
        +-- HTTP commands and snapshots
        +-- WebSocket realtime updates
        |
        v
FastAPI control plane
        |
        +-- check-in state machine
        +-- offline event synchronization
        +-- location TTL and sequence validation
        +-- scheduler and notification worker
        +-- role authorization and incident timeline
        |
        +--> PostgreSQL JSONB state snapshot
        +--> Redis job mirror + event publication
```

`backend/core.py` contains infrastructure-independent domain behavior. `backend/adapters.py` activates PostgreSQL and Redis together when both URLs are configured. `backend/app.py` owns HTTP and WebSocket transport concerns.

## Core Data Model

### Check-in

- Household, member, and creator identity
- Title, destination, and note
- Open time, due time, and grace period
- Lifecycle state and acknowledgement details

### Location Share

- Member and check-in identity
- Latitude, longitude, accuracy, and display label
- Monotonic sequence number
- Capture, expiration, and stop timestamps

### Offline Client Event

- Stable client event ID
- Original occurrence timestamp
- Event type and payload
- Server-side accepted, duplicate, or rejected result

### Notification Job

- Check-in event type and structured payload
- Stable deduplication key
- Ready, processing, retry, completed, or dead state
- Attempt count and provider error

### Delivery Receipt

- Recipient and channel
- Check-in and job identity
- Recipient-specific deduplication key
- Delivered timestamp

## Check-in State Machine

```text
SCHEDULED
    |
    v
  OPEN ------> ACKNOWLEDGED
    |
    v
  LATE ------> ACKNOWLEDGED
    |
    v
ESCALATED ---> ACKNOWLEDGED

Any active state can be CANCELED by an authorized actor.
```

The scheduler is replay-safe because each lifecycle notification uses a key derived from check-in ID and transition. Re-running a time window does not create duplicate jobs.

## Acknowledgement Flow

1. A member or trusted contact submits an acknowledgement with an idempotency key.
2. The service returns the previous result when that command key already exists.
3. The check-in transitions to acknowledged.
4. Any active location share associated with the check-in is stopped.
5. A safe-confirmation job is created once.
6. A normal or late-acknowledgement timeline event is appended.
7. FastAPI broadcasts a snapshot update over WebSockets.

Late and escalated acknowledgements are accepted because safety confirmation is more important than preserving an unresolved incident state.

## Offline Synchronization

Mobile clients submit stable client event IDs and original occurrence timestamps. The service sorts a batch by occurrence time, deduplicates previously accepted event IDs, and reports accepted, duplicate, and rejected events independently. A stale location event can fail without discarding an acknowledgement in the same batch.

## Location Ordering and Expiration

Each member's location stream uses a strictly increasing sequence number and timestamp. Older events are rejected even if they arrive later. A share is visible only while:

- it has not been explicitly stopped;
- its expiration timestamp is in the future; and
- it belongs to the active check-in being viewed.

The scheduler marks expired shares stopped and appends an audit event.

## Notification Delivery

1. Lifecycle transitions create jobs with deterministic deduplication keys.
2. A worker claims a ready or retry job.
3. Simulated provider failure moves the job to retry or dead after three attempts.
4. Escalations fan out to owners and trusted contacts over push and SMS.
5. Other notifications target the check-in member over push.
6. Recipient and channel keys prevent duplicate delivery receipts.

## Realtime Updates

FastAPI keeps an in-process connection group per household. Mutating HTTP requests broadcast `snapshot.updated`; clients then fetch the authoritative snapshot. Initial WebSocket connection sends a complete snapshot and presence count.

Redis event publication is included as the cross-process boundary. A production deployment would run a Redis Pub/Sub or Streams subscriber in every API instance and fan messages into its local WebSocket connections.

## Authorization Model

- `OWNER`: manage all household check-ins
- `TRUSTED_CONTACT`: manage another member's check-ins and receive escalations
- `MEMBER`: create, acknowledge, cancel, and share location for their own check-ins

Production authorization should add explicit consent, invitation acceptance, revocation, emergency-access review, and device trust.

## Key Tradeoffs

- Clients refetch snapshots after invalidation messages instead of applying partial WebSocket patches.
- JSONB snapshots keep infrastructure activation compact but are not a normalized production schema.
- Location history remains in memory for demonstration, although visibility is TTL-bound.
- Redis mirrors pending jobs while the deterministic worker executes in process.
- The map is a fictional generated asset rather than a third-party map provider.

## Failure Handling

- Command idempotency prevents duplicate acknowledgements.
- Scheduler transition keys suppress duplicate escalation jobs.
- Client event IDs suppress offline replay.
- Location sequence and capture time reject out-of-order updates.
- Location shares expire automatically.
- Notification jobs retry and eventually become dead.
- Recipient/channel keys suppress duplicate sends.
- Missing PostgreSQL or Redis falls back to memory mode.
- WebSocket disconnects do not affect HTTP command durability.

## Scaling Path

- Normalize household, membership, check-in, location, job, delivery, and timeline tables.
- Use a transactional outbox for lifecycle events.
- Move notifications to Redis Streams with consumer groups, leases, and dead-letter handling.
- Partition scheduler scans by due-time range and household shard.
- Subscribe every API instance to Redis event fanout for WebSocket invalidations.
- Store only current location in the hot path and apply strict retention to history.
- Add device-specific sequence epochs and signed mobile commands.
- Build incident projections from immutable events.

## What Is Intentionally Simplified

- No real authentication, device enrollment, or consent capture
- No native push, SMS, or telephony provider
- No emergency-services integration
- No background scheduler process
- No normalized PostgreSQL schema
- No multi-region WebSocket routing
- No geocoding or real map provider
- No production-grade sensitive-location retention policy
