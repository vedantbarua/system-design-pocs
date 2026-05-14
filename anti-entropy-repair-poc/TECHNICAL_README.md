# Anti-Entropy Repair Technical README

## Problem Statement

Eventually consistent systems can diverge when replicas miss writes, fall behind, lose data, or receive corrupted values. A full record-by-record comparison between replicas is expensive at scale. Anti-entropy repair reduces that cost by comparing hashes over key ranges and only drilling into ranges that differ.

This POC demonstrates the repair workflow with a compact in-memory replicated key-value dataset.

## Architecture Overview

The application is a single Spring Boot process that simulates three replicas:

- `replica-a`
- `replica-b`
- `replica-c`

Each replica owns a sorted map of keys to versioned values. The service builds a repair plan by splitting the global keyspace into fixed-size sorted ranges. For each range, it computes a hash per replica. Matching hashes mean the range is probably consistent; mismatched hashes identify ranges that need key-level inspection.

The main implementation lives in `AntiEntropyRepairService`.

Core responsibilities:

- maintain per-replica key-value state
- inject missed writes, corruption, deletion, and replica mode changes
- compute root hashes and range hashes
- identify divergent ranges and divergent keys
- repair selected keys from an explicit source or newest healthy version
- expose snapshots for the UI and JSON API

## Core Data Model

`ReplicaState`

- `replicaId`
- `mode`
- sorted `entries`

`StoredValue`

- `value`
- `version`
- `writerReplicaId`
- `updatedAt`

`RangeHashView`

- replica
- range start key
- range end key
- key count
- hash

`RangeDiffView`

- range boundaries
- consistency flag
- per-replica hashes
- divergent key IDs

`RepairPlanView`

- total ranges
- divergent ranges
- divergent key count
- range-level comparison details

## Request And Event Flow

### Write

1. `POST /api/write` receives a key and value.
2. A new monotonic version is assigned.
3. The write is applied to every `HEALTHY` replica except an optional skipped replica.
4. Range hashes are recomputed and the latest repair plan is updated.

### Compare

1. `POST /api/anti-entropy/compare` rebuilds the repair plan.
2. The service gathers the union of keys from reachable replicas.
3. Keys are chunked by `repair.range-size`.
4. Each replica computes a hash for each range.
5. Ranges with different hashes are marked divergent.
6. The service drills into those ranges to list exact divergent keys.

### Repair

1. `POST /api/anti-entropy/repair` optionally selects source, target, and range boundaries.
2. If no source is selected, the newest visible healthy value is used per key.
3. If no target is selected, every healthy replica is repaired.
4. Only keys in divergent matching ranges are copied.
5. The repair plan is recomputed after applying changes.

## Key Tradeoffs

- **Range hashes over full Merkle tree:** fixed ranges are easier to inspect in a small demo while preserving the main anti-entropy idea.
- **Newest healthy version as default source:** this gives a deterministic automatic repair path but is not always semantically correct for deletes or concurrent writes.
- **Manual compare and repair:** explicit controls make divergence and convergence visible.
- **In-memory state:** simple enough to run locally while still exposing the important consistency mechanics.

## Failure Handling

The POC can simulate:

- missed writes by skipping one replica
- stale replicas with `LAGGING` mode
- unavailable replicas with `DOWN` mode
- data corruption by overwriting one replica's value
- local data loss by deleting one key on one replica

Repair avoids `DOWN` replicas. After a replica returns to `HEALTHY`, the operator can compare and repair stale ranges.

## Scaling Path

A production version would add:

- durable storage and tombstones
- real Merkle trees with hierarchical drilldown
- partition ownership and vnode ranges
- streaming repair jobs with throttling
- resumable repair sessions
- checksums persisted per SSTable or segment
- background anti-entropy scheduling
- metrics for divergence age, repaired bytes, and repair latency
- safeguards for concurrent writes during repair

## What Is Intentionally Simplified

- No real network, disks, or storage engine.
- No quorum read/write path.
- No tombstone retention or delete reconciliation.
- No streaming chunk transfer.
- No hierarchical Merkle tree nodes.
- No background scheduler.
- No authentication or operator authorization.
