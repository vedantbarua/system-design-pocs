# Transactional Outbox POC Improvements

## Production Gaps

- Replace the broker table with Kafka, RabbitMQ, SQS, or another real broker.
- Add relay ownership so multiple app instances can publish without double-claiming rows.
- Store event schema version, trace id, correlation id, and causation id on each outbox row.
- Add outbox retention and archival policies after downstream processing is safe.

## Reliability Improvements

- Claim outbox rows with leases or `skip locked` semantics before publishing.
- Add exponential backoff for relay and consumer retries.
- Separate transient failures from permanent poison messages.
- Persist DLQ reason codes and replay controls.
- Add reconciliation that compares committed orders to emitted events.

## Scaling Improvements

- Partition outbox rows by aggregate id or event type.
- Batch broker publishing while preserving per-aggregate ordering.
- Add indexes for pending outbox rows, ready broker messages, and processed inbox ids.
- Track publish lag and oldest pending event age.
- Move audit data to an append-only log or observability backend.

## Security Improvements

- Add authentication for control endpoints.
- Hide raw payloads or redact sensitive fields in the UI.
- Validate event payloads against explicit contracts.
- Add authorization around replay and DLQ controls.

## Testing Improvements

- Add integration tests for transaction rollback behavior.
- Add concurrent relay tests that prove only one worker claims an outbox row.
- Add duplicate-delivery tests around the inbox constraint.
- Add poison-message retry and DLQ threshold tests.
- Add browser tests for the operational UI.

