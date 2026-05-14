# Anti-Entropy Repair POC

A Spring Boot proof-of-concept for detecting replica divergence with Merkle-style range hashes and repairing only inconsistent key ranges.

## Goal

Show how eventually consistent storage systems recover after missed writes, stale replicas, corrupted records, or regional outages without comparing every value on every repair pass.

## What It Covers

- Three in-memory replicas: `replica-a`, `replica-b`, and `replica-c`
- Consistent seed data across all replicas
- Writes that can intentionally skip one replica
- Replica modes: `HEALTHY`, `LAGGING`, and `DOWN`
- Single-replica corruption and local key deletion
- Merkle-style range hashes over sorted key ranges
- Divergence reports with mismatched ranges and keys
- Targeted repair for a selected range, source replica, and target replica
- Automatic repair using the newest visible healthy replica version
- Dashboard for replica contents, root hashes, range hashes, repair plans, and audit events

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd anti-entropy-repair-poc
   mvn spring-boot:run
   ```
3. Open `http://localhost:8158`.

## UI Flows

- Write `cart:2001` while skipping `replica-c`, then compare range hashes to find the missing key.
- Repair all divergent keys using the newest healthy version.
- Corrupt `cart:1002` on `replica-b`, compare, then repair from `replica-a` to `replica-b`.
- Delete `profile:42` from one replica and repair only the affected range.
- Mark `replica-c` as `DOWN`, write a key, then observe that automatic repair avoids the down replica.
- Restore the replica to `HEALTHY` and repair the stale keys.

## JSON Endpoints

- `GET /api/snapshot` inspect replicas, keys, range hashes, latest repair plan, and audit events
- `POST /api/write` write a key to healthy replicas, optionally skipping one replica
- `POST /api/replicas/corrupt` overwrite one key on one replica
- `POST /api/replicas/delete-key` remove one key from one replica
- `POST /api/replicas/mode` set a replica to `HEALTHY`, `LAGGING`, or `DOWN`
- `POST /api/anti-entropy/compare` rebuild the range-hash comparison plan
- `POST /api/anti-entropy/repair` repair divergent keys

Example missed-write request:

```json
{
  "key": "cart:2001",
  "value": "headphones=1",
  "skipReplicaId": "replica-c"
}
```

Example corruption request:

```json
{
  "replicaId": "replica-b",
  "key": "cart:1002",
  "value": "monitor=99"
}
```

Example targeted repair request:

```json
{
  "sourceReplicaId": "replica-a",
  "targetReplicaId": "replica-b",
  "rangeStart": "cart:1002",
  "rangeEnd": "cart:1002"
}
```

Example automatic repair request:

```json
{
  "sourceReplicaId": null,
  "targetReplicaId": null,
  "rangeStart": null,
  "rangeEnd": null
}
```

## Configuration

- `server.port` defaults to `8158`
- `cluster.replicas` defaults to `replica-a,replica-b,replica-c`
- `repair.range-size` controls how many logical keys are grouped into one range hash
- `repair.history-limit` controls retained audit events

## Notes and Limitations

- All state is in memory and resets on restart.
- The Merkle tree is simplified into sorted fixed-size range hashes to keep the demo readable.
- Writes do not use quorum acknowledgement; the focus is repair after divergence.
- Deletes are modeled as local key removal, not durable tombstones.
- Automatic repair chooses the highest visible version from healthy replicas.
- There is no background scheduler, persistent storage, or real network transport.

## Technologies Used

- Spring Boot 3.2
- Spring MVC
- Thymeleaf
- Java 17
- JUnit 5
- In-memory replica maps and range-hash comparison
