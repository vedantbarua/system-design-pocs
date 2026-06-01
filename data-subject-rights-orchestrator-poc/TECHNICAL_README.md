# Data Subject Rights Orchestrator Technical README

## Architecture

The POC is a small orchestration control plane for privacy requests. It accepts a request, finds downstream services that support that request type, creates one task per service, and rolls task outcomes up into request status.

```text
Privacy request intake
        |
        v
DSAR Orchestrator
        |
        +-- service inventory
        +-- request ledger
        +-- per-service tasks
        +-- export bundles
        +-- deletion receipts
        +-- audit events
```

## Data Model

### Services

`services` represents downstream systems that hold or process subject data. Each service has:

- `service_id`
- `owner_team`
- supported request types
- data scope
- timeout
- legal hold flag
- simulated failure behavior

### Requests

`requests` stores user rights requests with subject, request type, SLA due date, status, payload, and notes.

Supported types:

- `EXPORT`
- `DELETE`
- `CORRECT`
- `RESTRICT_PROCESSING`

### Tasks

`tasks` stores one unit of work per request and downstream service. A task tracks status, attempt count, max attempts, due date, result, error, and completion time.

### Audit Events

`audit_events` records service registration, request intake, task fanout, task transitions, export bundle reads, and deletion receipt reads.

## Request Flow

1. Client creates a DSAR request.
2. Orchestrator persists the request.
3. Orchestrator finds active services that support the request type.
4. Orchestrator creates one task per service.
5. Worker runs pending or retryable failed tasks.
6. Each task completes, fails, times out, or blocks.
7. Request status is recalculated from child task states.
8. Export bundles or deletion receipts can be read after enough task data exists.

## Status Rollup

Request status is derived from task status:

- Any `BLOCKED` task makes the request `BLOCKED`.
- All `COMPLETED` tasks make the request `COMPLETED`.
- Pending, in-progress, or retryable failed tasks keep the request `IN_PROGRESS`.
- A request with no target tasks is `FAILED`.

This is intentionally conservative: one blocker prevents a false completion.

## Retry and Timeout Model

Each task has `attempt_count` and `max_attempts`. Simulated services can fail until a configured attempt number. Workers reprocess failed tasks until attempts are exhausted.

Task due dates are based on the lower of request due date and service timeout. Processing after a task due date marks the task failed with a timeout error.

## Export Bundle Assembly

Completed export tasks return service-scoped records. The bundle endpoint combines those records into a single response with request id, subject id, assembly time, service count, and records.

The bundle is only available after the export request is `COMPLETED`.

## Deletion Receipts

Completed delete tasks return receipt ids. A delete request can still be `BLOCKED` if one service has legal hold while other services have completed deletion. Receipt reads expose the completed subset.

## Failure Modes

- A service that does not register supported request types is skipped.
- A legal hold can block a delete request while other services complete.
- A flaky downstream system can leave a request in progress until retries are exhausted.
- Task timeouts may require manual operator escalation.
- Export bundle assembly is incomplete until every export task completes.

## Production Extensions

- Durable queue and worker fleet for task execution
- Idempotency keys for request intake and task transitions
- Service authentication and signed callbacks
- Per-service retry policy and dead-letter queues
- Evidence storage for export bundles and deletion receipts
- Legal hold integration with retention systems
- SLA alerts and operator assignment
- Tamper-evident audit log storage
- Webhook/event publication for task transitions
- Request deduplication and subject identity verification
