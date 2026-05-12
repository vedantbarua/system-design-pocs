# Transactional Outbox POC Technical Notes

## Problem Statement

Services often need to update local state and publish an event for other services. If the service writes the order first and publishes afterward, a crash between those two steps loses the event. If it publishes first and then the database write fails, consumers may see an event for state that never committed.

The transactional outbox pattern solves this by writing the domain row and the event row in the same local database transaction. A separate relay publishes pending outbox rows later.

## Architecture Overview

The POC has five logical stores in one H2 database:

- `orders`: the business aggregate
- `outbox_events`: durable events committed with the aggregate
- `broker_messages`: a local stand-in for an external broker topic or queue
- `inbox_entries`: processed event ids for idempotent consumers
- `audit_events`: visible timeline for the UI

The Spring scheduler runs two loops:

- Relay loop: reads `PENDING` outbox rows, inserts broker messages, and marks the outbox row `PUBLISHED`.
- Consumer loop: reads `READY` broker messages, checks the inbox table, applies the side effect, and records the event id.

## Core Data Model

`orders` tracks the order lifecycle:

- `CREATED`: committed by the write transaction
- `EMAIL_SENT`: consumer side effect succeeded
- `POISONED`: message exceeded retry threshold and moved to DLQ

`outbox_events` tracks publish lifecycle:

- `PENDING`: committed but not yet published
- `PUBLISHED`: relay inserted a broker message

`broker_messages` tracks delivery lifecycle:

- `READY`: available to the consumer
- `CONSUMED`: processed successfully
- `DUPLICATE`: skipped because the inbox already contains the event id
- `DLQ`: exceeded poison-message retry threshold

## Request And Event Flow

1. `POST /orders` calls `createOrder`.
2. The service inserts an `orders` row and an `outbox_events` row inside one `@Transactional` method.
3. The relay loop reads pending outbox events.
4. If publish failure simulation is armed, the relay increments attempts and leaves the row pending.
5. Otherwise the relay inserts a broker message and marks the outbox event published.
6. The consumer loop reads ready broker messages.
7. If the inbox already has the event id, the broker message is marked duplicate.
8. Otherwise the consumer applies the side effect and inserts the event id into `inbox_entries`.

## Key Tradeoffs

- A database-backed outbox favors durability over immediate publish latency.
- The relay is eventually consistent; consumers see events after a short delay.
- Idempotent consumers are still required because relay crashes can cause duplicate delivery in real systems.
- Keeping the broker as a table makes the demo easy to run but does not model broker partitions, offsets, or retention.

## Failure Handling

- Relay publish failure: the outbox row remains `PENDING` and is retried.
- Duplicate publish: the same event id can appear more than once in the broker table.
- Consumer duplicate: the inbox table prevents the side effect from running twice.
- Poison message: failed handler attempts are counted and then moved to `DLQ`.
- Consumer pause: broker messages accumulate as `READY`.

## Scaling Path

Production versions usually add:

- Relay leasing with `select for update skip locked` or shard ownership
- Broker offsets and partition-aware publishing
- Event schema registry and versioned contracts
- Outbox cleanup or archival after safe retention windows
- Metrics for publish lag, retry count, DLQ count, and oldest pending event
- Tracing across command handling, relay publishing, and consumer processing

## What Is Intentionally Simplified

- The broker is a table, not Kafka, RabbitMQ, or SQS.
- There is only one process and one relay worker.
- JSON payload handling is minimal.
- The consumer side effect is local status mutation instead of an external email/provider call.
- There is no authentication or tenant boundary.

