# Technical README

## Problem Statement

A distributed lock by itself only answers who currently owns a lease. It does not stop a paused or slow worker from resuming after lease expiry and performing a stale write. This POC makes that failure mode explicit and demonstrates fencing tokens as the guardrail.

## Architecture Overview

The system has three moving parts:

- Redis stores lock leases, fencing counters, and the final protected resource state
- two backend instances simulate independent application processes competing on the same resource
- a small React UI triggers the race and shows which write won

Each backend uses the same Redis keys for a given resource:

- `dlm:lock:<resource>` stores the current lease owner id with TTL
- `dlm:fence:<resource>` stores the monotonic fencing counter
- `dlm:resource:<resource>` stores the accepted payload and token

## Core Data Model

- lock owner id: random UUID identifying the process that acquired the lease
- fencing token: increasing integer assigned only on successful lock acquisition
- resource state: latest accepted token, payload, writer id, and update timestamp

## Request and Event Flow

### Acquire path

1. A backend calls Redis `SET key value NX PX ttl`.
2. If successful, the same Lua script increments the fencing counter.
3. The backend returns a lock handle containing owner id, token, acquisition time, and TTL.

### Release path

1. The backend calls a Lua script with the resource lock key and owner id.
2. The script deletes the lock only if the stored owner matches.
3. A late worker cannot release a newer owner's lock.

### Protected write path

1. The worker finishes simulated work and submits `{token, payload}` to the resource write script.
2. The Lua script reads the currently stored token.
3. The write is accepted only if the incoming token is greater than the stored one.
4. The response exposes whether the write was accepted or rejected.

## Key Tradeoffs

- Redis centralizes coordination, which keeps the demo small but creates a single coordination dependency.
- Fencing makes stale writes safe even when lock expiry is unavoidable, but it assumes the downstream resource validates tokens.
- Lease TTL is fixed and intentionally short so the race is easy to reproduce.
- The design favors clarity over completeness; there is no lock extension or fairness policy.

## Failure Handling

- If lock acquisition fails, the request returns `acquired: false` and no work is performed.
- If the worker outlives its lease, another backend can acquire a newer token.
- If the original worker resumes later, the write script rejects the stale token.
- Release is owner-safe, so one worker cannot accidentally delete another worker's lease.

## Scaling Path

To move this toward production:

- separate lock coordination from the protected storage service
- add lease renewal with bounded heartbeats for long-running work
- add metrics for acquisition latency, contention, expiry rate, and stale-write rejection
- model multi-resource lock ordering or lock striping for broader workloads
- decide whether Redis single-primary semantics are acceptable or whether a stronger coordination system is required

## What Is Intentionally Simplified

- one Redis instance instead of replicated coordination
- one lock per request and one protected resource record
- no wait queues, fairness, or backoff strategy
- no persistent audit log
- no authentication or per-tenant isolation
