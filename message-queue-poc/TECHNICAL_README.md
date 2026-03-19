# Technical README: Message Queue POC

This document explains the architecture, flow, and file-by-file purpose of the message queue proof-of-concept.

## Architecture Overview

- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for a server-rendered operations dashboard.
- **Storage**: Each topic owns in-memory partitions, and each partition stores an append-only list of message records.
- **Routing**: Producers may target a partition explicitly, hash by key, or fall back to round-robin placement.
- **Consumption**: Every consumer group maintains an independent cursor and optional in-flight delivery per partition.
- **Reliability model**: Ack advances the cursor, retry keeps the same offset live for redelivery, and the DLQ captures exhausted deliveries.
- **Replay**: Offset reset rewinds a group-partition cursor to demonstrate reprocessing and backfills.

## File Structure

```text
message-queue-poc/
├── pom.xml
├── README.md
├── TECHNICAL_README.md
├── IMPROVEMENTS.md
└── src
    ├── main
    │   ├── java/com/randomproject/messagequeue
    │   │   ├── MessageQueuePocApplication.java
    │   │   ├── MessageQueueController.java
    │   │   ├── MessageQueueService.java
    │   │   ├── QueueRequests.java
    │   │   └── QueueViews.java
    │   └── resources
    │       ├── application.properties
    │       └── templates/index.html
    └── test
        └── java/com/randomproject/messagequeue/MessageQueueServiceTest.java
```

## Flow

1. **Create topic**: `POST /topics` or `POST /api/topics` allocates the requested number of partitions.
2. **Publish**: `POST /messages/publish` or `POST /api/messages` appends a record to the chosen partition and assigns the next offset.
3. **Poll**: `POST /consumers/poll` or `POST /api/consumers/poll` lazily creates the consumer group and leases at most one message per partition.
4. **Ack**: `POST /consumers/ack` advances the group cursor to the next offset for that partition.
5. **Retry / DLQ**: `POST /consumers/retry` increments the delivery attempt; once the configured limit is exceeded, the delivery moves to the DLQ and the cursor advances.
6. **Replay**: `POST /consumers/reset` rewinds the cursor to an earlier offset so the group can re-read historical messages.

## Notable Implementation Details

- **Ordering**: The service allows only one in-flight record per group-partition, so a later offset cannot overtake an earlier one.
- **At-least-once semantics**: A delivery remains active until acked or dead-lettered, so a retried message is redelivered at the same offset.
- **Lag accounting**: Lag is computed as `partitionEndOffset - groupNextOffset`, which intentionally includes the in-flight offset until it is acked.
- **Fair polling**: Topics rotate the starting partition for each poll call so repeated polling does not always begin from partition 0.
- **Bounded observability**: Recent messages, DLQ entries, and events are capped to keep the dashboard readable.

## Configuration

- `server.port=8111`
- `queue.default-partitions=3`
- `queue.max-partitions=8`
- `queue.max-delivery-attempts=3`

## Build / Run

- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
- `mvn test`
