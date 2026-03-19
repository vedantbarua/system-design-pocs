# Message Queue POC

Spring Boot proof-of-concept for a Kafka-style message queue with topics, partitions, offsets, consumer groups, retries, replay, and a dead-letter queue.

## Goal

Demonstrate the core mechanics behind a durable event backbone without introducing actual brokers or networked storage.

## What It Covers

- Topic creation with configurable partition counts
- Ordered offsets within each partition
- Key-based partition routing plus round-robin fallback
- Consumer groups with independent cursors
- At-least-once delivery using ack and retry flows
- Redelivery and dead-lettering after max delivery attempts
- Offset reset for replay and backfill demos
- Dashboard for topic state, lag, in-flight deliveries, DLQ entries, and recent events

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd message-queue-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8111`.

## UI Flows

- Create a topic with 1 to 8 partitions
- Publish messages with an optional ordering key
- Poll a consumer group and inspect delivery attempts
- Ack successful offsets
- Retry failed deliveries until they redeliver or move to the DLQ
- Reset a partition cursor to replay older offsets

## JSON Endpoints

- `GET /api/topics` inspect all topics, consumer groups, lag, DLQ entries, and events
- `POST /api/topics` create a topic
- `POST /api/messages` publish a message
- `POST /api/consumers/poll` poll up to `maxMessages`
- `POST /api/consumers/ack` ack an in-flight delivery
- `POST /api/consumers/retry` request redelivery or DLQ
- `POST /api/consumers/reset` rewind a consumer group partition cursor

Example topic request:

```json
{
  "topic": "orders",
  "partitions": 3
}
```

Example publish request:

```json
{
  "topic": "orders",
  "key": "order:123",
  "payload": "{\"event\":\"OrderPlaced\",\"orderId\":\"123\"}"
}
```

Example poll request:

```json
{
  "topic": "orders",
  "groupId": "billing-worker",
  "maxMessages": 3
}
```

## Notes

- This is a single-process simulation, not a production queue.
- Messages are retained in memory and reset on restart.
- Ordering is preserved within a partition because each group tracks one in-flight delivery per partition.
- DLQ behavior is modeled per consumer group, not globally.

## Technologies

- Spring Boot 3.2
- Thymeleaf
- Java 17
- In-memory topic log and group cursor state
