# Improvements

## Production Gaps

- Add a write-ahead log and replay path so engine state can recover after restart.
- Add cancel, replace, and partial-fill lifecycle handling for orders.
- Add pre-trade risk checks and account-level controls before orders enter the matcher.

## Reliability Improvements

- Persist inbound commands before they reach the matching thread.
- Add snapshotting so order books can recover without replaying the full history.
- Add failure-injection tests around backpressure, slow consumers, and WebSocket fanout.

## Scaling Improvements

- Partition symbols across multiple matching engines.
- Add gateway sharding and load-aware symbol routing.
- Introduce a binary market-data and order-entry path for lower latency than HTTP plus SockJS.

## Security Improvements

- Add authentication and authorization for order entry and market-data access.
- Add per-account position and notional limits.
- Audit every administrative or risk-control action against the engine.

## Testing Improvements

- Add deterministic matching tests for price-time priority and partial fills.
- Add replay tests that confirm identical state after WAL recovery.
- Add load and latency benchmarks for ingress, matching, and market-data broadcast.
