# Household Chore Coordinator: Technical Design

## Problem Statement

Recurring household tasks become a coordination problem when several people can act at once, devices can be offline, schedules must expand safely, and assignments should remain fair. The system needs deterministic task creation, short-lived ownership, replay-safe completion, and projections that can be rebuilt.

## Architecture Overview

```text
React dashboard
      |
Express command API
      |
chore coordinator domain
   |          |          |
claim leases  scheduler   overdue/reminder workers
   |          |          |
   +----- completion events ----> Kafka / memory broker
                         |
                    event consumer
                         |
                  PostgreSQL + Redis
                  ledger/state  projections
```

The synchronous completion endpoint keeps the demo responsive, while the publish-only endpoint models offline delivery. Both paths converge on the same idempotent completion handler.

## Core Data Model

- `Member`: active household participant and display metadata.
- `ChoreDefinition`: recurrence interval, anchor time, area, effort points, and eligible members.
- `TaskInstance`: one materialized occurrence with assignment, status, lease, completion, and escalation state.
- `ClaimLease`: holder, expiration, and monotonically increasing fencing token.
- `CompletionEvent`: immutable, replay-safe completion with source and optional fencing token.
- `Reminder`: deduplicated overdue or escalation notification.
- `ChoreJob`: retryable scheduler, scanner, dispatcher, or projection work.
- `AuditEvent`: structured trace of domain and worker decisions.

## Request And Event Flow

### Occurrence Materialization

1. Select active chore definitions.
2. Advance each anchor by its fixed recurrence interval into the requested window.
3. Build the occurrence key as `choreId:dueAt`.
4. Skip an existing key to make repeated materialization idempotent.
5. Assign new work to the eligible member with the lowest open effort points.
6. Store tasks sorted by due time.

### Claim Lease

1. Validate the member, task, and requested TTL.
2. Return the current lease when the same member retries an active claim.
3. Reject another member while that lease remains active.
4. Replace an expired lease and issue a higher fencing token.
5. Require that token when a claimed task is completed or released.

### Offline Completion

1. A client queues a completion with a stable event ID and its lease token.
2. Kafka or the memory broker retains the event until consumption.
3. The consumer deduplicates `taskId:eventId`.
4. The domain compares the supplied token with the task’s current lease token.
5. A completion from a superseded lease is rejected as stale.
6. An accepted completion updates task state and appends the completion event.

### Overdue Escalation

The scanner marks unfinished tasks overdue. Tasks under 24 hours late receive level-one reminders; tasks over 24 hours late move to level two. Reminder dedupe keys prevent repeated scans from creating duplicate notifications.

## Key Tradeoffs

### Fixed Intervals Instead Of Calendar Rules

Integer day intervals make materialization transparent. Production recurrence needs timezone-aware calendar semantics, skipped dates, exceptions, and daylight-saving handling.

### Effort-Based Assignment

Open effort points provide a deterministic and understandable fairness heuristic. It does not account for availability, preferences, historical inequity, or chore-specific skills.

### Lease Fencing

Expiration alone cannot stop an old offline client from completing work after a takeover. Fencing tokens let the aggregate identify and reject stale ownership even when messages arrive late.

### Snapshot Plus Completion Ledger

The POC persists a full snapshot for simple restart behavior and separately appends completion events. A production write model would transactionally update aggregate versions and an outbox, then build read models asynchronously.

## Failure Handling

- Occurrence keys absorb repeated scheduler runs.
- Completion event keys absorb at-least-once delivery.
- Fencing tokens reject stale offline writers.
- Reminder keys absorb repeated overdue scans.
- Worker jobs retry and retain the last failure.
- Kafka, PostgreSQL, and Redis failures degrade to memory adapters.
- Projection rebuild jobs provide an explicit repair mechanism.

## Scaling Path

1. Partition task and completion events by household ID.
2. Add optimistic household aggregate versions to command writes.
3. Persist state changes and outbox records in one transaction.
4. Move scheduling, overdue scanning, and notifications to separate worker pools.
5. Bucket recurrence scans by date and household shard.
6. Materialize task and workload read models in dedicated tables.
7. Add retry topics, dead-letter handling, and operator replay tooling.

## What Is Intentionally Simplified

- One household and three seeded members
- Fixed-interval recurrence without timezone calendars or exceptions
- No authentication, invitations, roles, or household isolation
- No push provider or delivery receipt integration
- No transaction spanning snapshots and completion events
- No WebSocket fanout across household devices
- In-process workers and in-memory lease timing
