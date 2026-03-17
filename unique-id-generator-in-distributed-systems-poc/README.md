# Unique ID Generator in Distributed Systems POC

Spring Boot proof-of-concept for a Snowflake-like distributed ID generator.

## Goal

Generate positive 64-bit, time-ordered, unique IDs across multiple workers without relying on a central auto-increment counter.

## What It Covers

- 64-bit layout with sign bit, timestamp bits, worker bits, and sequence bits
- Bit masking and shifting to encode and decode IDs
- Multi-worker generation and round-robin simulation
- Natural sort order by timestamp-heavy bit layout
- Clock drift handling with a configurable backward-drift tolerance
- Worker state inspection for timestamps, sequence counters, and regression events

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd unique-id-generator-in-distributed-systems-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8087`.

## UI Flows

- Generate a batch for one worker
- Decode an existing ID into timestamp, worker, and sequence fields
- Simulate several workers issuing IDs concurrently
- Inspect the binary slices used in the final 64-bit number
- Review worker-local state and clock regression counters

## JSON Endpoints

- `POST /api/ids` generate a batch
- `GET /api/ids/{id}` decode an ID
- `POST /api/simulate` simulate multiple workers
- `GET /api/nodes` inspect worker state
- `GET /api/config` inspect generator config

Example batch request:

```json
{
  "nodeId": 7,
  "count": 3
}
```

Example simulation request:

```json
{
  "nodeIds": [1, 2, 3],
  "idsPerNode": 2
}
```

## Configuration

- `id.epoch-millis`: custom epoch used for timestamp packing
- `id.node-bits`: worker-id width
- `id.sequence-bits`: per-millisecond counter width
- `id.max-batch`: max IDs returned in one request
- `id.default-node-id`: fallback worker ID for UI/API requests
- `id.max-backward-drift-millis`: how much backward clock movement is tolerated before generation is rejected

Default layout:

- `1` sign bit
- `41` timestamp bits
- `10` worker bits
- `12` sequence bits

## Notes

- Worker ID range is `0..(2^nodeBits - 1)`.
- Sequence range is `0..(2^sequenceBits - 1)` within the same millisecond.
- Small backward clock drift is absorbed by pinning generation to the last safe timestamp.
- Large backward clock drift is rejected to avoid collisions or out-of-order IDs.

## Technologies

- Spring Boot 3.2
- Thymeleaf
- Java 17
- In-memory worker state
