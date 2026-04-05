# Improvements

## Production Gaps

- Add durable ingestion and storage instead of keeping logs and alerts in memory.
- Add indexed search, retention policies, and archived storage tiers.
- Support outbound integrations for paging and incident tooling rather than only console and local-memory sinks.

## Reliability Improvements

- Decouple ingestion from alert evaluation with a queue so slow sinks do not affect write latency.
- Add time-windowed alert counters instead of restart-sensitive global counters.
- Add dead-letter handling for malformed or failed log transformations.

## Scaling Improvements

- Partition log ingestion by service, tenant, or topic.
- Add batching and asynchronous processing for higher throughput.
- Add sampling and cardinality controls for noisy sources and metadata explosion.

## Security Improvements

- Add authentication and authorization for log ingestion and alert inspection APIs.
- Strengthen PII detection and make scrub rules configurable per field and source.
- Add request-size limits and rate limiting to protect the ingestion endpoint.

## Testing Improvements

- Add integration tests for the full ingest-transform-alert flow.
- Add filter-composition tests for threshold and keyword rules.
- Add tests that verify PII scrubbing on sensitive patterns before storage.
