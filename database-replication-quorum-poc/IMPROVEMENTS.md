# Improvements

## Production Gaps

- Persist writes to a log or SSTable-backed storage layer instead of memory.
- Replace single-process coordination with explicit coordinator and storage-node processes.
- Add delete tombstones and background compaction so removed keys replicate safely.

## Reliability Improvements

- Add replica heartbeats and automatic liveness detection instead of manual mode toggles.
- Introduce durable hinted handoff queues so missed writes survive process restarts.
- Add background anti-entropy to detect divergence without waiting for manual repair or a read.

## Scaling Improvements

- Partition the keyspace across many replica groups instead of replicating every key to every node.
- Add token ownership and rebalancing so nodes can join or leave without full-cluster reshuffles.
- Parallelize quorum reads and writes with timeout budgets and speculative retry behavior.

## Security Improvements

- Add authentication and authorization for topology changes and repair endpoints.
- Protect operational endpoints with role-based access and audit retention.
- Add request validation limits for key/value size and rate-limit cluster mutation APIs.

## Testing Improvements

- Add controller tests for HTTP responses and invalid quorum values.
- Add property-based tests around stale-read and repair scenarios.
- Add fault-matrix tests that sweep combinations of `R`, `W`, and replica modes.
