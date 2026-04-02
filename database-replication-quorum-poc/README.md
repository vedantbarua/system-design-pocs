# Database Replication + Quorum POC

Spring Boot proof-of-concept for a replicated key-value database that exposes quorum reads and writes, stale replicas, hinted handoff, manual repair, and read repair through both a UI and JSON API.

## Goal

Demonstrate how `R`, `W`, and `N` interact under replica lag and node failure, and make the difference between visible success, stale reads, and background repair explicit.

## What It Covers

- Three-replica in-memory cluster with per-replica state: `HEALTHY`, `LAGGING`, or `DOWN`
- Quorum writes with configurable `W`
- Quorum reads with configurable `R`
- Partial writes when immediate acknowledgements fall below quorum
- Pending replication queues for lagging replicas and hinted handoff for down replicas
- Manual repair for one key or all keys
- Read repair that updates stale contacted replicas
- Operational dashboard for replica contents, pending queues, key-level consistency, and audit events

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd database-replication-quorum-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8143`.

## UI Flows

- Commit a write with quorum `W=2`
- Mark one replica as `LAGGING` and write again to create queued replication
- Mark one replica as `DOWN` and write with `W=3` to observe quorum failure
- Read with `R=1` versus `R=2` and compare stale-read risk
- Turn on read repair to update stale replicas while serving a read
- Drain pending replication after bringing a replica back to `HEALTHY`
- Repair one key or run a full reachable-cluster repair sweep

## JSON Endpoints

- `GET /api/snapshot` inspect cluster config, metrics, replicas, keys, and recent events
- `POST /api/write` commit a value with a chosen write quorum
- `POST /api/read` read a key with a chosen read quorum and optional read repair
- `POST /api/replicas/mode` switch a replica between `HEALTHY`, `LAGGING`, and `DOWN`
- `POST /api/replicas/drain` apply queued replication to one reachable replica
- `POST /api/repairs/key` reconcile one key across reachable replicas
- `POST /api/repairs/all` reconcile all visible keys across reachable replicas

Example write request:

```json
{
  "key": "cart-42",
  "value": "paid",
  "writeQuorum": 2
}
```

Example read request:

```json
{
  "key": "cart-42",
  "readQuorum": 2,
  "repairOnRead": true
}
```

Example replica mode request:

```json
{
  "replicaId": "replica-b",
  "mode": "DOWN"
}
```

## Configuration

- `server.port` defaults to `8143`
- `cluster.replica-count` defaults to `3`
- `cluster.default-read-quorum` defaults to `2`
- `cluster.default-write-quorum` defaults to `2`
- `cluster.history-limit` controls how many recent audit events are retained

## Notes and Limitations

- All state is in memory and resets on restart.
- Replica placement is fixed to a single three-node cluster.
- Conflict resolution is simplified to last visible logical version wins.
- Read quorums contact the first reachable replicas in deterministic order; this keeps the demo predictable rather than realistic.
- There is no real network, disk persistence, or background anti-entropy loop.

## Technologies Used

- Spring Boot 3.2
- Thymeleaf
- Java 17
- In-memory replicated key-value state with pending replication queues
