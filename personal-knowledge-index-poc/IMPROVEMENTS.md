# Improvements

## Production Gaps

- Replace in-memory index with durable full-text search infrastructure.
- Add real PDF parsing, OCR, and bookmark fetchers.
- Add account authentication and device-scoped ingestion credentials.
- Store documents, grants, search audits, and index metadata in normalized tables.
- Split API, Kafka consumers, and index workers into separate services.

## Reliability Improvements

- Add DLQ topics for malformed document changes.
- Add Redis leases for distributed indexing workers.
- Persist every job state transition as an immutable event.
- Add index snapshotting and checksum validation.
- Add backpressure when rebuilds compete with incremental indexing.

## Scaling Improvements

- Partition Kafka by account or collection ID.
- Add sharded index segments by collection and visibility.
- Add incremental folder-level reindex planning.
- Cache hot query results in Redis with dependency-based invalidation.
- Add offline index compaction for deleted or superseded documents.

## Security Improvements

- Add folder inheritance and deny rules.
- Encrypt document content and index payloads at rest.
- Add signed ingestion events from trusted devices.
- Add search audit exports for sensitive folders.
- Add per-principal query rate limits.

## Testing Improvements

- Add API route integration tests.
- Add browser tests for search, grants, and rebuild flows.
- Add property tests for tokenization and ranking invariants.
- Add Kafka integration tests with a real broker.
- Add chaos tests for worker crashes during full rebuilds.
