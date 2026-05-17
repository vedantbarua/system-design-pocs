# Feature Store Improvements

## Production Gaps

- Add a declarative feature registry with owners, descriptions, and versions.
- Split offline and online stores into separate storage backends.
- Add streaming materialization for low-latency features.
- Add scheduled batch backfills.
- Add entity definitions beyond `user_id`.
- Persist training-set generation jobs and outputs.

## Reliability Improvements

- Add idempotency keys for event ingestion.
- Add retry and checkpointing for backfill jobs.
- Add data quality validation for feature ranges and null rates.
- Add feature freshness alerts.
- Add online/offline skew thresholds and alerting.
- Add recovery jobs for failed materialization runs.

## Scaling Improvements

- Move historical computation to Spark, Flink, Ray, or DuckDB.
- Use Redis, Cassandra, DynamoDB, or RocksDB for online serving.
- Partition raw events by entity and event date.
- Add pagination for event and feature listing APIs.
- Cache repeated point-in-time training lookups.
- Support incremental backfills by changed partitions.

## Security Improvements

- Require authentication for ingest and serving endpoints.
- Add authorization by feature set and entity type.
- Redact or tokenize sensitive payload fields.
- Add audit identity to materialization jobs.
- Encrypt online and offline feature storage.
- Add tenant isolation to all feature queries.

## Testing Improvements

- Add HTTP API tests around all endpoints.
- Add property tests for point-in-time correctness.
- Add randomized event-order tests.
- Add skew detection tests across many feature types.
- Add browser smoke tests for the dashboard.
- Add load tests for online lookup latency.
