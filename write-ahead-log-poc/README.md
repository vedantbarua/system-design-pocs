# Write-Ahead Log POC

Spring Boot proof-of-concept for a write-ahead log that records ordered commands before applying state, then supports checkpointing, crash recovery replay, idempotent command handling, and log compaction.

## Goal

Make the durability path behind databases, queues, and replicated state machines easy to inspect. The app keeps a small materialized key-value state, appends each mutation to a WAL first, and exposes the operational controls normally hidden inside storage engines.

## What It Covers

- Monotonic log sequence numbers
- Append-before-apply mutation flow
- Idempotent command IDs
- Point-in-time checkpoints
- Crash recovery from checkpoint plus replay
- Log compaction after a checkpoint
- Small UI and JSON API for automation

## Quick Start

```bash
cd write-ahead-log-poc
mvn spring-boot:run
```

Open:

```text
http://localhost:8116
```

## UI Flows

1. Append a `PUT` command and watch it appear in the WAL before the materialized state changes.
2. Submit the same command ID again and see it ignored as a duplicate.
3. Create a checkpoint to capture the current state image and checkpoint LSN.
4. Append more commands after the checkpoint.
5. Click `Crash + Recover` to rebuild state from the checkpoint plus newer log entries.
6. Click `Compact` to remove log entries covered by the checkpoint while preserving command idempotency history.

## JSON Endpoints

```http
GET /api/state
```

Returns the current materialized state, retained WAL entries, checkpoint, recent events, command count, and next LSN.

```http
POST /api/entries
Content-Type: application/json

{
  "commandId": "cmd-500",
  "key": "profile:123",
  "value": "active"
}
```

Appends and applies a `PUT`.

```http
DELETE /api/entries
Content-Type: application/json

{
  "commandId": "cmd-501",
  "key": "profile:123"
}
```

Appends and applies a `DELETE`.

```http
POST /api/checkpoint
POST /api/recover
POST /api/compact
```

Creates a checkpoint, simulates crash recovery, or compacts checkpointed log entries.

## Configuration

`src/main/resources/application.properties` sets:

```properties
server.port=8116
spring.application.name=write-ahead-log-poc
```

## Notes And Limitations

- State, WAL entries, checkpoints, and command IDs are in memory for local demonstration.
- The WAL is capped to keep the UI readable.
- There is one logical writer guarded by synchronized service methods.
- Compaction removes retained log entries through the checkpoint but keeps command IDs so older duplicate commands are still rejected.

## Technologies Used

- Spring Boot 3.2
- Spring Web
- Thymeleaf
- Bean Validation
- JUnit 5 and AssertJ
