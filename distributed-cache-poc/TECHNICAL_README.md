# Technical README: Distributed Cache POC

This document explains the architecture, flow, and file-by-file purpose of the distributed cache proof-of-concept.

## Architecture Overview

- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for a server-rendered control plane.
- **Placement**: Consistent hashing ring with virtual nodes to assign primary and replica owners.
- **Storage**: In-memory per-node `LinkedHashMap` stores configured for access-order, enabling LRU eviction.
- **Replication**: Each write is copied to the current owner set; reads repair stale replicas when needed.
- **Failover**: If the preferred primary is down, the first alive replica becomes the active primary.
- **Observability**: Cluster snapshot exposes key placement, shard samples, node-local entries, and event history.

## File Structure

```text
distributed-cache-poc/
├── pom.xml
├── README.md
├── TECHNICAL_README.md
├── IMPROVEMENTS.md
└── src
    ├── main
    │   ├── java/com/randomproject/distributedcache
    │   │   ├── DistributedCachePocApplication.java
    │   │   ├── DistributedCacheController.java
    │   │   ├── DistributedCacheService.java
    │   │   ├── CacheWriteRequest.java
    │   │   ├── HotKeyRequest.java
    │   │   ├── RebalanceRequest.java
    │   │   └── ...response/view records...
    │   └── resources
    │       ├── application.properties
    │       └── templates/index.html
    └── test
        └── java/com/randomproject/distributedcache/DistributedCacheServiceTest.java
```

## Flow

1. **Home**: `GET /` renders the dashboard with the full cluster snapshot.
2. **Write**: `POST /cache/write` validates the key, chooses owners from the ring, and replicates the value.
3. **Read**: `POST /cache/read` or `GET /api/cache/{key}` returns the freshest active copy and repairs stale replicas.
4. **Delete**: `POST /cache/delete` or `DELETE /api/cache/{key}` removes the key from all node stores.
5. **Failover**: `POST /cluster/nodes/{nodeId}/toggle` marks a node down or restores it, triggering replica recovery.
6. **Traffic / Rebalance**: dedicated forms and JSON APIs simulate hot keys and preview ownership changes for a new node.

## Notable Implementation Details

- **Consistent hashing**: MD5-derived 64-bit tokens are used for the ring, matching the pattern used in the existing consistent hashing POC.
- **LRU eviction**: Each node keeps entries in access-order and evicts the eldest entry when the local capacity is exceeded.
- **Replica repair**: Reads and node recovery reuse the freshest version found across existing copies.
- **Failover visibility**: Placement views distinguish the preferred primary from the currently active primary.
- **Bounded event log**: The dashboard shows the latest topology, write, eviction, replication, and traffic events.

## Configuration

- `server.port=8107`
- `cache.virtual-nodes=64`
- `cache.replication-factor=2`
- `cache.node-capacity=12`
- `cache.default-ttl-seconds=180`
- `cache.max-ttl-seconds=3600`
- `cache.initial-nodes=cache-a,cache-b,cache-c,cache-d`

## Build / Run

- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
- `mvn test`
