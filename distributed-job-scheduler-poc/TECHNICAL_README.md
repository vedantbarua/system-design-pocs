# Technical README

## Problem Statement

A scheduler has to decide when a job becomes runnable, which node is allowed to dispatch it, where it should execute, and what happens when a worker dies mid-flight. This POC focuses on those control-plane concerns rather than cron parsing or durable storage.

## Architecture Overview

The backend models a simplified scheduler in one process:

- a node registry stores heartbeats and lease expiry times
- leader election chooses the lexicographically smallest active node id
- a timing wheel delays jobs until they become due
- a sharded job store groups jobs by tenant-derived shard
- a dispatcher promotes due jobs into a queue and assigns them to active workers
- an execution tracker records running, failed, and completed attempts

The frontend polls operational endpoints to visualize leader state, wheel pressure, shard load, event history, and recent executions.

## Core Data Model

- `nodes`: backend instances with `id`, `startedAt`, and `expiresAt`
- `jobStore`: in-memory jobs keyed by job id
- `shardIndex`: mapping from shard id to job ids
- `wheel`: ring buffer of delayed jobs waiting for their target time
- `events`: bounded event log for scheduling and control activity
- `executions`: bounded execution history for worker runs

## Request and Event Flow

### Scheduling path

1. `POST /api/jobs` validates the request and hashes the tenant to a shard.
2. The backend creates a scheduled job record and inserts it into the wheel.
3. The periodic tick advances the wheel pointer and promotes due jobs to `queued`.

### Leader path

1. The frontend sends regular heartbeats with a node id.
2. Each heartbeat extends that node's lease expiry.
3. The scheduler elects the active node with the smallest id as leader.
4. Only the presence of a leader allows queued jobs to dispatch.

### Execution path

1. On each tick, the leader scans queued jobs.
2. Jobs are assigned to active workers based on shard id modulo active-node count.
3. The backend marks the job `running`, starts a simulated execution, and records lease expiry.
4. The completion timer either marks the job `completed` or `failed`.
5. Failed jobs with retries remaining are rescheduled into the wheel.

### Recovery path

1. A background lease check scans running jobs.
2. If a worker lease has expired, the job is rescheduled.
3. This makes at-least-once delivery visible, including possible duplicate execution after recovery.

## Key Tradeoffs

- The timing wheel is simpler and cheaper than scanning all jobs by timestamp, but it trades precision for coarse slotting.
- Leader election via leases keeps coordination obvious, but it only works here because every node is simulated in one process.
- At-least-once delivery is easier to achieve than exactly-once, but consumers must tolerate duplicates.
- Fixed shard routing shows placement and scaling logic, but rebalance behavior is not modeled.

## Failure Handling

- If no leader is active, queued jobs wait rather than dispatch.
- If a worker lease expires, the job is rescheduled with an incremented attempt count.
- Randomized failures trigger retry until `maxAttempts` is exhausted.
- Pause and resume controls let the UI simulate control-plane backpressure.

## Scaling Path

To move toward production:

- persist jobs and event history in a durable datastore
- separate scheduler, dispatcher, and worker roles into different processes
- replace local lease maps with a real coordination system
- add partition ownership transfer and shard rebalancing
- use a dead-letter queue and explicit retry policies per job class
- add cron parsing, recurring schedules, and idempotency keys

## What Is Intentionally Simplified

- one backend process represents the whole cluster state
- no durable timing wheel or write-ahead log
- no real worker fleet or external task queue
- no per-tenant quota enforcement
- no timezone-aware cron parsing or calendar semantics
