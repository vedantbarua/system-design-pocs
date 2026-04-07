# Improvements

## Production Gaps

- Replace the in-memory registry with a replicated backing store or consensus-backed membership system
- Add authenticated instance registration so arbitrary callers cannot publish fake endpoints
- Support explicit deregistration and graceful connection draining deadlines

## Reliability Improvements

- Combine heartbeats with active health probing and latency-based outlier detection
- Persist routing and registry events to durable storage for post-incident analysis
- Add jittered heartbeat expiry handling to reduce synchronized lease drops

## Scaling Improvements

- Shard registry state by service namespace
- Push incremental routing table updates to sidecars or edge routers instead of polling snapshots
- Add richer traffic policies such as percentage-based canary rollout and topology-aware failover

## Security Improvements

- Require mutual TLS or signed tokens for instance registration and heartbeat calls
- Isolate metadata fields and validate them against a schema to avoid untrusted config injection
- Add per-service authorization for administrative lifecycle changes

## Testing Improvements

- Add controller-level API tests for validation and error responses
- Add randomized routing-distribution tests to validate weight behavior over larger samples
- Add concurrency tests around registration, routing, and heartbeat updates
