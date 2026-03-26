# Technical README: Distributed Stream Processing POC

This document explains the architecture, state model, and flow for the distributed stream processing proof-of-concept.

## Architecture Overview

- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for a server-rendered operator dashboard.
- **Source log**: Each stream owns in-memory partitions. Every partition is an append-only list of events with offsets.
- **Processor jobs**: A job is a consumer/operator pair. It tracks independent offsets for every partition of a stream.
- **Window state**: Each job stores keyed tumbling-window aggregates derived from processed records.
- **Checkpointing**: A checkpoint captures both partition offsets and window aggregates so the job can resume consistently.
- **Replay**: Jobs can restore a named checkpoint or manually rewind a partition cursor to reprocess source data.

## File Structure

```text
distributed-stream-processing-poc/
├── pom.xml
├── README.md
├── TECHNICAL_README.md
├── IMPROVEMENTS.md
└── src
    ├── main
    │   ├── java/com/randomproject/distributedstream
    │   │   ├── DistributedStreamProcessingPocApplication.java
    │   │   ├── DistributedStreamProcessingController.java
    │   │   ├── DistributedStreamProcessingService.java
    │   │   ├── StreamRequests.java
    │   │   └── StreamViews.java
    │   └── resources
    │       ├── application.properties
    │       └── templates/index.html
    └── test
        └── java/com/randomproject/distributedstream/DistributedStreamProcessingServiceTest.java
```

## Flow

1. **Create stream**: `POST /streams` or `POST /api/streams` allocates partitions and binds a default tumbling window size.
2. **Publish event**: `POST /events/publish` or `POST /api/events` appends an event to a partition and assigns the next offset.
3. **Create job lazily**: The first call to `POST /jobs/process` or `POST /api/jobs/process` creates the job and initializes per-partition cursors at offset 0.
4. **Process batch**: The service pulls events from each partition, advances the job offsets, and updates keyed window aggregates.
5. **Checkpoint**: `POST /jobs/checkpoints` or `POST /api/jobs/checkpoints` freezes offsets and operator state into a named snapshot.
6. **Replay**: `POST /jobs/replay` or `POST /api/jobs/replay` either restores a saved checkpoint or rewinds an offset for backfill/reprocessing.

## Notable Implementation Details

- **Consumer state**: Each job owns offsets per partition, which models how processors recover progress independently of other jobs.
- **Windowing**: Windows are event-time based and keyed by `(key, windowStart)`. Aggregates track count, sum, min, and max.
- **Checkpoint fidelity**: Restoring a checkpoint resets both offsets and aggregate state, not just cursors.
- **Replay semantics**: Manual offset rewind can optionally clear derived state, making it easy to demo full recomputation.
- **Fair partition scanning**: Processing rotates the starting partition to avoid always scanning partition 0 first.

## Configuration

- `server.port=8112`
- `stream.default-partitions=3`
- `stream.max-partitions=8`
- `stream.default-window-seconds=30`

## Build / Run

- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
- `mvn test`
