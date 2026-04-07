# Technical README

## Problem Statement

A request router needs more than a flat list of hosts. It needs to know which instances are still alive, which ones should stop taking new traffic, which ones are temporary canaries, and when to fall back across zones without losing deterministic behavior for sticky sessions.

This POC models that control-plane logic in one process.

## Architecture Overview

The application has three main parts:

1. Registry management for instance registration, status updates, and heartbeats
2. Routing logic for zone preference, sticky-session selection, and weighted fallback
3. A dashboard plus JSON API for inspecting state transitions and recent routing decisions

All state lives in memory inside `ServiceDiscoveryService`.

## Core Data Model

- `InstanceState`: service name, instance id, zone, version, weight, canary flag, lifecycle, heartbeat time, ejection window, metadata
- `RegistryEventState`: audit entry for register, heartbeat, status change, route, and ejection activity
- `RoutingDecision`: returned view of how the router selected an instance for a request

Each instance has two related but different concepts:

- Lifecycle: `UP`, `DRAINING`, or `DOWN`
- Effective state: derived from lifecycle, lease expiry, and temporary ejection

An instance can be `UP` at the lifecycle level but still be effectively unroutable because its lease expired or it is currently ejected.

## Request Or Event Flow

### Registration

1. A caller registers a service instance with service, zone, version, weight, and canary metadata.
2. The registry stores the instance with lifecycle `UP`.
3. The initial heartbeat time starts the lease window.

### Heartbeat

1. A caller renews the lease for an instance.
2. The service updates `lastHeartbeatAtMillis`.
3. Future snapshot and routing operations treat the instance as healthy until the lease expires again.

### Routing

1. The router filters instances by service name.
2. It removes instances that are draining, down, expired, or temporarily ejected.
3. It optionally removes canary instances if the caller disables canary traffic.
4. It prefers the caller's zone if healthy local instances exist.
5. It chooses an instance:
   - weighted rendezvous hashing when a session key is present
   - weighted round robin when no session key is present
6. It records the routing decision for the dashboard.

### Failure Feedback

1. A caller records success or failure on an instance.
2. Success clears the consecutive failure count.
3. Two consecutive failures trigger temporary ejection for a fixed window.
4. After the ejection window passes and the instance resumes heartbeats, it can re-enter routing.

## Key Tradeoffs

- Lease expiry is simple and explicit, but it depends on heartbeat cadence and can temporarily misclassify slow instances.
- Weighted rendezvous hashing keeps sticky behavior stable without storing session maps, but it assumes the router sees a consistent candidate set.
- Temporary ejection is useful for local failure suppression, but a real system would need richer signals than just consecutive request failures.
- Zone preference reduces cross-zone traffic, but it may sacrifice perfect weight distribution when one zone is heavily favored.

## Failure Handling

- Missing heartbeats cause lease expiry and automatic removal from the routable pool.
- Draining removes instances from new traffic while leaving them visible in the registry.
- Repeated failures trigger temporary ejection instead of immediate permanent removal.
- If a requested zone has no healthy capacity, the router falls back to any healthy zone and records that fact in the route note.

## Scaling Path

- Replace the in-memory registry with a replicated config store or consensus-backed membership layer
- Push registry deltas to routers instead of serving only pull snapshots
- Add active health checks, latency-aware load balancing, and outlier detection
- Partition services across shards once the registry becomes large
- Introduce per-service routing policies rather than one global algorithm

## What Is Intentionally Simplified

- There is no distributed consensus or replicated state
- Heartbeats, routing, and failure signals happen in the same process
- Weighted round robin is implemented locally rather than with a shared distributed cursor
- Security, identity, and service authentication are out of scope
