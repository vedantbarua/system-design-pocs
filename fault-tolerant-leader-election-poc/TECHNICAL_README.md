# Technical README — Fault-Tolerant Leader Election POC

## Architecture Overview
- **ClusterEngine** keeps the Raft-inspired state machine for a fixed set of nodes.
- **WebSocket broadcast** pushes `ClusterSnapshot` frames to all UI clients.
- **REST API** exposes a state snapshot and a leader kill action.
- **React UI** renders a live cluster map and per-node telemetry.

## Key Components
- `ClusterEngine`
  - Owns node state, election timers, and heartbeat logic.
  - Ticks every 100ms to simulate timeouts.
  - Randomizes election timeouts to reduce split votes.
  - Emits snapshots every 250ms to WebSocket listeners.
- `ClusterWebSocketHandler`
  - Broadcasts JSON snapshots on every tick interval.
- `ClusterController`
  - `GET /api/cluster/state` — initial state for UI bootstrap.
  - `POST /api/cluster/kill-leader` — marks the leader as down.

## Data Flow
1. Nodes start as followers with randomized election deadlines.
2. A follower times out, becomes candidate, requests votes.
3. Majority wins, candidate becomes leader, begins heartbeats.
4. Leader appends a new committed value on a fixed interval and replicates it.
5. If the leader is killed, followers time out and elect a new leader.

## Simplifications (Intentional)
- Single JVM simulates all nodes (no cross-process networking).
- No full Raft log. A single monotonic committed value represents replicated state.
- Vote logic is simplified; log matching is omitted.

## Extending This POC
- Add real log entries and conflict resolution.
- Introduce network partitions or delayed heartbeats.
- Persist node state to disk to simulate crashes and restarts.
