# Write-Ahead Log POC Technical README

## Problem Statement

Systems that need recoverable state usually cannot apply mutations directly to memory and hope the process survives. They first record intent in an ordered durable log, then apply that intent to the materialized state. This POC demonstrates that flow with a compact key-value state machine.

## Architecture Overview

The app is a single Spring Boot MVC application:

- `WriteAheadLogController` exposes the Thymeleaf UI and JSON API.
- `WriteAheadLogService` owns the WAL, materialized state, checkpoint image, command index, and recent event list.
- `WalModels` contains request and response records.
- `index.html` renders state, retained log entries, checkpoint contents, and recovery controls.

All state is intentionally in memory. The important behavior is the sequencing:

```text
client command
  -> validate commandId/key/value
  -> reject duplicate command IDs
  -> append WAL entry with next LSN
  -> apply entry to materialized state
  -> expose event and updated snapshot
```

## Core Data Model

- `WalEntry`: immutable log record with LSN, command ID, operation, key, optional value, and append timestamp.
- `state`: materialized `Map<String, String>` rebuilt from checkpoint plus WAL replay.
- `checkpoint`: last captured state image and the highest LSN covered by that image.
- `commandIndex`: command ID to original WAL entry. It remains populated after log compaction so duplicate command IDs stay rejected.
- `WalEvent`: recent operational timeline for UI inspection.

## Request And Recovery Flow

### PUT or DELETE

1. Normalize and validate command ID and key.
2. Check the command index.
3. If the command ID already exists, return the original entry as a duplicate result.
4. Append a new `WalEntry` with the next LSN.
5. Apply the operation to the materialized map.

### Checkpoint

1. Find the highest LSN currently in the log.
2. Copy the materialized state into the checkpoint image.
3. Record the checkpoint timestamp and covered LSN.

### Crash Recovery

1. Clear runtime state by replacing it with the checkpoint image.
2. Replay retained WAL entries with LSN greater than the checkpoint LSN.
3. Rebuild the materialized state deterministically from those replayed entries.

### Compaction

1. Require a checkpoint.
2. Remove retained WAL entries with LSN less than or equal to the checkpoint LSN.
3. Keep command IDs in the command index to preserve idempotency across compaction.

## Key Tradeoffs

- Synchronized service methods keep the demo deterministic and easy to reason about.
- The POC models one writer rather than a concurrent storage engine.
- The command index is retained separately from the compacted log to show the difference between replay history and idempotency history.
- The UI exposes internal state directly because the goal is learning, not encapsulation.

## Failure Handling

- Duplicate commands are ignored and reported without mutating state.
- Invalid keys, command IDs, and oversized values are rejected before appending to the log.
- Compaction is rejected until at least one checkpoint exists.
- Recovery is deterministic because entries are replayed in LSN order.

## Scaling Path

Production versions would usually add:

- Durable segment files or a replicated log instead of in-memory lists
- Fsync or group commit policy for write latency versus durability
- Segment indexes for faster recovery and random inspection
- Background checkpointing
- Snapshot upload to object storage
- Retention policies for command idempotency keys
- Checksums and corruption detection per segment
- Leader election if multiple replicas can accept writes

## What Is Intentionally Simplified

- No disk I/O, fsync, or partial-write recovery
- No concurrent writers
- No binary log format
- No snapshot delta encoding
- No retention expiration for command IDs
- No authentication or authorization
