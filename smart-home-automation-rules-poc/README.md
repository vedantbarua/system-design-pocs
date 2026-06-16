# Smart Home Automation Rules POC

React TypeScript, Node, Express, and Kafka proof-of-concept for an everyday smart-home automation rule engine. It turns home events into device commands with idempotency, cooldowns, safety overrides, retries, acknowledgements, and audit history.

## Goal

Show how a home automation platform can safely react to events like energy spikes, leak alerts, presence changes, and late-night garage activity without dispatching duplicate or unsafe device commands.

## What It Covers

- Kafka-style event ingestion for smart-home events
- Rule evaluation with conditions, cooldowns, and safety levels
- Device command queue with idempotent dedupe keys
- Manual override behavior that suppresses routine commands but allows critical safety commands
- Retryable command dispatch and device acknowledgements
- Device state updates from acknowledged commands
- Replay flow for previously ingested events
- PostgreSQL snapshots/event log and Redis command mirror when infrastructure is configured
- Memory fallback for fast local runs

## Quick Start

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5185`. The API defaults to `http://127.0.0.1:8185`.

## Run With Kafka, Postgres, And Redis

```bash
docker compose up -d
```

```bash
cd backend
AUTOMATION_KAFKA_BROKERS=127.0.0.1:9093 \
AUTOMATION_DATABASE_URL=postgres://automation:automation@127.0.0.1:5436/automation_rules \
AUTOMATION_REDIS_URL=redis://127.0.0.1:6383 \
npm run dev
```

Then start the frontend normally:

```bash
cd frontend
npm run dev
```

## Demo Flow

1. Review enabled rules and connected devices on the overview.
2. Open Event stream and publish an energy spike, leak, presence, or garage event.
3. In memory mode, drain Kafka to process buffered events.
4. Open Commands and drain the command queue.
5. Trigger a failure with Fail next and verify retry behavior.
6. Enable a manual override, publish a routine event, and observe suppression.
7. Publish a critical leak event and verify it still queues a valve-close command.
8. Review the audit log for rule decisions and command lifecycle events.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Shows memory/Kafka/Postgres/Redis mode and buffered messages. |
| `GET` | `/api/snapshot` | Returns home mode, devices, rules, events, commands, audit, and metrics. |
| `POST` | `/api/events` | Publishes and ingests a home event immediately. |
| `POST` | `/api/events/publish` | Publishes an event to Kafka or the memory broker. |
| `POST` | `/api/kafka/drain` | Drains memory broker events. |
| `POST` | `/api/rules/:ruleId/toggle` | Enables or disables a rule. |
| `POST` | `/api/home-mode` | Changes home mode to `home`, `away`, or `night`. |
| `POST` | `/api/manual-override` | Enables or clears manual override by minutes. |
| `POST` | `/api/commands/fail-next` | Makes the next command dispatch fail once. |
| `POST` | `/api/commands/tick` | Processes one queued or retry command. |
| `POST` | `/api/commands/drain` | Processes queued commands and acknowledges successful sends. |
| `POST` | `/api/commands/:commandId/ack` | Acknowledges a sent command and updates device state. |
| `POST` | `/api/replay` | Re-evaluates stored events for a time range. |
| `POST` | `/api/reset` | Restores seeded demo state. |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8185` | API port. |
| `HOST` | `127.0.0.1` | API host. |
| `AUTOMATION_EVENT_TOPIC` | `home.automation.events` | Kafka topic for home events. |
| `AUTOMATION_KAFKA_BROKERS` | `memory://` | Comma-separated Kafka brokers. |
| `AUTOMATION_DATABASE_URL` | `memory://` | PostgreSQL connection string. |
| `AUTOMATION_REDIS_URL` | `memory://` | Redis connection string. |

## Notes And Limitations

- Redpanda is used as a compact Kafka-compatible local broker.
- The API hosts the Kafka consumer for the POC. Production would split it into a worker service.
- Rule conditions are deterministic thresholds, not a full DSL.
- Device commands are simulated; real device vendor integrations are intentionally omitted.
- Authentication, household membership, and secrets handling are out of scope.

## Technologies Used

- React 19
- TypeScript
- Vite
- Node.js
- Express 5
- KafkaJS
- PostgreSQL
- Redis
- Redpanda
