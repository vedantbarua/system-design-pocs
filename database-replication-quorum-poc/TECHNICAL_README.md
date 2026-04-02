# Technical README

## Problem Statement

Modern replicated databases trade latency, consistency, and availability against each other. The point of this POC is to make those tradeoffs concrete by showing when a write is fully acknowledged, when a read can observe stale state, and how repair closes the gap.

## Architecture Overview

The POC models a single coordinator and a fixed three-replica cluster:

- `replica-a`, `replica-b`, and `replica-c` each maintain an in-memory key-value map
- each replica also keeps a pending replication queue used for lagged delivery or hinted handoff
- writes produce monotonically increasing logical versions
- reads query a chosen `R` count of reachable replicas and return the highest visible version
- repair paths reconcile reachable replicas to the latest visible version

There is no physical network layer. Replica modes stand in for network and node behavior:

- `HEALTHY`: applies writes immediately and participates in reads
- `LAGGING`: remains readable but defers write application into a pending queue
- `DOWN`: cannot serve reads and only accumulates hinted-handoff style pending work

## Core Data Model

- `VersionedValue`: key, value, logical version, commit timestamp, and coordinator id
- `ReplicaNode`: replica mode, visible key-value store, and pending replication list
- `PendingReplication`: versioned value plus a reason such as `replication-lag`, `hinted-handoff`, or `repair-handoff`
- `OperationEventView`: recent audit event for writes, reads, topology changes, drains, and repairs

## Request and Event Flow

### Write path

1. Validate the key and requested write quorum `W`.
2. Increment the cluster logical clock and build a new `VersionedValue`.
3. Fan the write out to all replicas:
   - healthy replicas apply immediately
   - lagging replicas queue pending replication
   - down replicas queue hinted handoff
4. Count immediate acknowledgements and compare them to `W`.
5. Record a success or quorum-failure event without hiding partial application.

### Read path

1. Validate the key and requested read quorum `R`.
2. Select the first `R` reachable replicas.
3. Compare visible versions for the requested key across those replicas.
4. Return the highest visible version.
5. If enabled, read repair updates stale contacted replicas to that winning version.

### Repair path

- `drainPending(replica)`: applies queued replication to one reachable replica
- `repairKey(key)`: finds the latest visible version for a key and copies it to reachable stale replicas
- `repairAll()`: repeats the same logic for every visible key

## Key Tradeoffs

- The design intentionally keeps coordinator logic simple so quorum semantics stay obvious.
- Failed writes are not rolled back if some replicas already applied them; this exposes the partial-write problem clearly.
- Version ordering is logical-clock based rather than vector-clock based, so conflict resolution is simplified.
- Deterministic replica selection for reads makes demos reproducible, but real systems would usually randomize or optimize selection.

## Failure Handling

- If fewer than `W` replicas apply a write immediately, the write returns as quorum-failed.
- If fewer than `R` replicas are reachable, the read returns as quorum-failed.
- Lagging or down replicas retain pending work until a drain or repair path catches them up.
- Read repair only affects the contacted replicas in that read, which mirrors a common production pattern.

## Scaling Path

To move toward a production-grade design:

- partition keys with consistent hashing instead of a single fixed cluster
- separate coordinators from storage replicas
- persist a write-ahead log rather than relying on memory
- use gossip or membership service for topology state
- add background anti-entropy and Merkle-tree style divergence detection
- replace simple logical versions with richer causality metadata

## What Is Intentionally Simplified

- no durable storage
- no real transport or RPC timeouts
- no leader election
- no replica-to-replica streaming replication
- no tombstones, deletes, or compaction
- no rack awareness or multi-region placement
