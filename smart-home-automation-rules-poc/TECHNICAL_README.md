# Technical README

## Problem Statement

Smart-home automation systems must react quickly to events while avoiding unsafe or duplicate commands. A leak event should close a valve even during manual override, but a routine energy-saving rule should be suppressible. Replayed events should not turn devices off repeatedly, and device gateway failures should retry without losing auditability.

## Architecture Overview

```text
React dashboard
      |
      v
Express API
      |
      +--> KafkaJS producer/consumer or memory broker
      |
      +--> SmartHomeAutomation domain core
      |       - event idempotency
      |       - rule evaluation
      |       - cooldown checks
      |       - command dedupe
      |       - retry/ack lifecycle
      |
      +--> PostgreSQL snapshots and event log or memory
      |
      +--> Redis queued command mirror or memory
```

The domain core has no dependency on Express, Kafka, PostgreSQL, or Redis. Infrastructure adapters handle optional persistence and broker connectivity.

## Core Data Model

| Model | Purpose |
| --- | --- |
| `Device` | Smart-home device with type, room, status, and mutable state. |
| `HomeEvent` | Idempotent event from presence sensors, utility monitors, garage doors, or APIs. |
| `Rule` | Conditions, action, cooldown, safety level, and trigger counters. |
| `DeviceCommand` | Queued command with dedupe key, retry state, attempts, and acknowledgement timestamps. |
| `AuditEvent` | Human-readable decision and lifecycle history. |

## Event Flow

1. Client publishes a home event to `/api/events/publish`.
2. KafkaJS publishes to `home.automation.events`, or memory mode appends to an in-process broker.
3. A Kafka consumer or `/api/kafka/drain` passes the event to the domain core.
4. `processedEvents` rejects duplicate event keys.
5. Event state is applied to home mode or device state.
6. Enabled rules evaluate conditions against event, device, time, and home mode.
7. Matching rules enqueue commands unless cooldown or manual override suppresses them.
8. Command worker sends, retries, or marks commands dead.
9. Device acknowledgement updates device state and audit history.

## Idempotency

Event keys are:

```text
eventType:eventId
```

Command dedupe keys are:

```text
ruleId:eventId:deviceId:command
```

This lets the system replay old events without creating duplicate commands for the same rule/event/action combination.

## Safety Model

Rules have safety levels:

- `routine`: normal convenience or savings automation.
- `guarded`: user-visible actions like garage notifications.
- `critical`: safety actions like closing a water valve.

Manual override suppresses routine and guarded rules. Critical rules bypass override because blocking leak protection would be the less safe behavior.

## Failure Handling

- Duplicate events are ignored.
- Cooldown violations create suppressed command records for visibility.
- Simulated device timeouts move commands to `RETRY`.
- Commands move to `DEAD` after max attempts.
- Successful sends require acknowledgement before device state changes.
- Infrastructure adapters fall back independently to memory mode.

## Scaling Path

- Split API, event consumer, and command dispatcher into separate services.
- Use Kafka partitions keyed by household or device ID.
- Persist immutable events and materialized read models separately.
- Store rules in PostgreSQL with versioned definitions.
- Use Redis for distributed cooldown/rate-limit state.
- Add DLQ topics for invalid events and permanently failing commands.

## Key Tradeoffs

- The POC uses deterministic rules instead of a general rule language to keep behavior inspectable.
- Snapshot persistence is simple and demo-friendly, but production should use event history plus read models.
- The command dispatcher is single-process. Production would use leases or consumer groups.
- Device integrations are simulated to focus on orchestration semantics.

## What Is Intentionally Simplified

- No authentication or household membership.
- No real vendor APIs for smart devices.
- No schema registry for event contracts.
- No distributed locks around command dispatch.
- No websocket push; the UI refreshes after actions.

## Test Coverage

Backend tests cover seed state, idempotency keys, duplicate event handling, rule triggers, command dispatch, acknowledgements, retry behavior, cooldown suppression, manual override safety bypass, rule toggling, home mode updates, replay dedupe, and export/import.
