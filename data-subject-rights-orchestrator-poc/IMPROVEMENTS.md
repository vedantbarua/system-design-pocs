# Data Subject Rights Orchestrator Improvements

## Next Engineering Steps

- Add idempotency keys for request creation and task fanout.
- Add task leases so multiple workers can process safely.
- Add per-service retry policies, backoff, and dead-letter queues.
- Add task cancellation when a request is blocked or withdrawn.
- Add request deduplication by subject, type, and time window.
- Add signed service callbacks for asynchronous task completion.
- Persist export bundles and deletion receipts as immutable evidence.
- Add operator assignment for blocked and overdue requests.

## Production Hardening

- Authenticate request intake and downstream service calls.
- Add subject identity verification before request fanout.
- Encrypt request payloads, export artifacts, and receipt metadata.
- Store audit events in tamper-evident storage.
- Add metrics for overdue requests, failed tasks, blocked deletes, and retry volume.
- Alert when a request approaches SLA breach.
- Add backups and point-in-time recovery for the request ledger.
- Add migration tests for evolving service capabilities and request schemas.

## Product Extensions

- Build an operator queue for privacy teams.
- Add self-service user portal request status.
- Add legal hold review and override workflow.
- Add data inventory integration to route only relevant services.
- Add retention lifecycle integration for delete orchestration.
- Add consent preference integration for restrict-processing requests.
- Add export bundle download links with expiration.
- Add correction preview and approval before downstream writes.

## Testing Gaps

- Add HTTP endpoint tests for all routes.
- Add concurrency tests for duplicate fanout and worker races.
- Add retry exhaustion tests with dead-letter behavior.
- Add large service inventory fanout tests.
- Add SLA boundary tests around due dates.
- Add property tests for request status rollup.
