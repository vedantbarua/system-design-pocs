# Consistent Hashing POC

Spring Boot proof-of-concept for a consistent hashing ring with virtual nodes, a small UI, and JSON endpoints for automation. This is one of the core infrastructure demos in the repo because it makes key placement and minimal remapping easy to see.

## Why This POC Matters

Consistent hashing shows up in caches, storage systems, partitioned databases, and service routing layers. The important question is not just where a key lands today, but how much movement happens when capacity changes. This project makes that behavior tangible.

## What It Covers

- Add and remove nodes from a ring
- Use virtual nodes to smooth key distribution
- Assign keys to the next node clockwise on the ring
- Inspect ring entries and current node distribution in the UI
- Drive the same flows through JSON endpoints

## Quick Start

```bash
cd consistent-hashing-poc
mvn org.springframework.boot:spring-boot-maven-plugin:run
```

Open `http://localhost:8086`.

## Demo Flow

1. Add a few nodes to build the ring.
2. Assign several keys and note which node owns each one.
3. Remove a node and re-run the same assignments.
4. Observe that only a subset of keys remap instead of the full dataset.

## Endpoints

- `GET /` renders the ring UI
- `POST /nodes` adds a node from the form
- `POST /nodes/{nodeId}/remove` removes a node
- `POST /assign` assigns a key from the form
- `GET /api/nodes` lists nodes
- `POST /api/nodes` adds a node
- `DELETE /api/nodes/{nodeId}` removes a node
- `POST /api/assign` assigns a key
- `GET /api/ring` returns ring entries

## Configuration

- `server.port=8086`
- `hash.virtual-nodes=120`

## Design Notes

- MD5 is used to hash node replicas and keys.
- The first 64 bits of the digest become the ring position.
- Ring storage uses an ordered map so wraparound lookups stay straightforward.

## Limitations

- No weighted nodes
- No persistence
- No automatic rebalance planner
- Focused on ring mechanics rather than a full storage system

## Related Docs

- [TECHNICAL_README.md](TECHNICAL_README.md)
- [IMPROVEMENTS.md](IMPROVEMENTS.md)
