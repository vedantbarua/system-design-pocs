# Distributed Cache POC

Spring Boot proof-of-concept for a Redis-cluster-style distributed cache with sharding, replicas, TTLs, failover, and LRU eviction.

## Goal

Demonstrate how a cache cluster assigns keys to nodes, replicates copies, promotes replicas on node failure, and estimates rebalance cost when capacity grows.

## What It Covers

- Consistent hashing with virtual nodes
- Primary plus replica ownership for each key
- TTL-based expiration
- Per-node LRU eviction when capacity is exceeded
- Replica promotion when the preferred primary is down
- Hot-key traffic simulation
- Rebalance preview for a candidate node join
- Dashboard for key placement, sampled shard ownership, node-local state, and recent failover events

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd distributed-cache-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8107`.

## UI Flows

- Write or update a cached value with a TTL
- Read a key and inspect which node served the request
- Delete a key across the cluster
- Mark a node down and watch reads fail over to a replica
- Simulate a hot key to see which node absorbs the traffic
- Preview how many keys would move if a new node were added

## JSON Endpoints

- `GET /api/cluster` inspect the full cluster snapshot
- `POST /api/cache` write a value
- `GET /api/cache/{key}` read a value
- `DELETE /api/cache/{key}` delete a value
- `GET /api/placement?key=...` inspect owners for a key
- `POST /api/cluster/nodes/{nodeId}/toggle?active=false` mark a node down or up
- `POST /api/traffic` simulate repeated reads on a key
- `POST /api/rebalance/preview` estimate moved keys for a new node

Example write request:

```json
{
  "key": "session:123",
  "value": "cart:v2",
  "ttlSeconds": 180
}
```

Example rebalance request:

```json
{
  "candidateNodeId": "cache-e"
}
```

## Configuration

- `cache.virtual-nodes`: virtual nodes per physical node in the ring
- `cache.replication-factor`: number of owners per key
- `cache.node-capacity`: max entries stored by each node before LRU eviction
- `cache.default-ttl-seconds`: default TTL used by the UI when none is provided
- `cache.max-ttl-seconds`: upper bound for a write request
- `cache.initial-nodes`: comma-separated boot nodes for the cluster

## Notes

- This is a single-process simulation, not a real networked cluster.
- Failover is modeled by selecting the first alive owner in the replica chain.
- Replica repair happens when a node comes back or when a read detects a fresher copy elsewhere.

## Technologies

- Spring Boot 3.2
- Thymeleaf
- Java 17
- In-memory node stores
