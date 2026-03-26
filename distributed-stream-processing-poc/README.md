# Distributed Stream Processing POC

Spring Boot proof-of-concept for a Flink/Kafka-Streams-style processing layer built on top of append-only partitions, with tumbling windows, checkpointed consumer state, and replay.

## Goal

Demonstrate what comes after a message queue: operators that read partitioned event logs, maintain state, checkpoint progress, and replay deterministically.

## What It Covers

- Stream creation with configurable source partitions
- Event ingestion with explicit or derived partition routing
- Per-job consumer state with independent offsets per partition
- Tumbling window aggregation by event time and key
- Checkpoints that freeze both offsets and operator state
- Replay by restoring a checkpoint or rewinding offsets for backfills
- Dashboard for stream partitions, job lag, window state, checkpoints, and recent system events

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd distributed-stream-processing-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8112`.

## UI Flows

- Create a stream with 1 to 8 partitions and a tumbling window size
- Publish numeric events keyed by tenant, merchant, device, or account
- Start a processing job and consume records in batches
- Save a checkpoint after a stable processing point
- Restore that checkpoint or rewind a partition offset for replay
- Inspect per-partition consumer state, lag, and current window aggregates

## JSON Endpoints

- `GET /api/streams` inspect streams, jobs, checkpoints, windows, and events
- `POST /api/streams` create a stream
- `POST /api/events` publish an event into a source partition
- `POST /api/jobs/process` advance a processing job by up to `maxRecords`
- `POST /api/jobs/checkpoints` capture a checkpoint for a job
- `POST /api/jobs/replay` restore a checkpoint or reset partition offsets

Example stream request:

```json
{
  "stream": "payments",
  "partitions": 3,
  "windowSeconds": 30
}
```

Example publish request:

```json
{
  "stream": "payments",
  "key": "merchant:42",
  "value": 75,
  "eventTimeMillis": 1711456200000
}
```

Example process request:

```json
{
  "stream": "payments",
  "jobId": "fraud-aggregator",
  "maxRecords": 10
}
```

Example checkpoint restore request:

```json
{
  "stream": "payments",
  "jobId": "fraud-aggregator",
  "checkpointId": "before-backfill"
}
```

## Notes

- This is a single-process simulation, not a real distributed runtime.
- State is held in memory and resets on restart.
- Windowing is tumbling event-time windowing; late-event handling and watermarks are simplified.
- Replay from raw offsets can optionally clear state, which is useful for teaching backfills and reprocessing.

## Technologies

- Spring Boot 3.2
- Thymeleaf
- Java 17
- In-memory partition logs, operator state, and checkpoint snapshots
