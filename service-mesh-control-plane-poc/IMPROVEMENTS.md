# Improvements

## Control Plane

- Add explicit policy versions and staged rollout state.
- Add policy validation that rejects traffic splits without matching sidecars.
- Add a config generation endpoint that emits proxy-ready route clusters.
- Add watch streams so sidecars can receive policy updates.
- Add per-tenant or per-namespace isolation.

## Data Plane Simulation

- Model separate inbound and outbound proxy filters.
- Add request headers, path matching, and method-based routing.
- Add fault injection policies for latency, aborts, and partial failures.
- Add connection pools, max pending requests, and load-shed behavior.
- Add locality-aware routing with zone failover.

## Security

- Add certificate records with expiry and rotation windows.
- Add identity-to-service binding validation.
- Add authorization policies alongside traffic policies.
- Add policy signatures and tamper-evident audit logs.
- Add deny-by-default namespace boundaries.

## Reliability

- Add retry-budget refill windows.
- Add half-open circuit breaker probes.
- Add success-rate and latency-based outlier detection.
- Add brownout behavior when all upstreams are ejected.
- Add historical trace replay for policy simulation.

## Observability

- Export request metrics by source, destination, version, and decision.
- Track p50, p95, and p99 latency from simulated attempts.
- Add service graph visualization.
- Add trace filtering by service pair, identity, and outcome.
- Add event logs for policy changes, ejections, and circuit state transitions.

## Distributed Systems

- Split state storage from route-evaluation nodes.
- Add leader election for policy writes.
- Add multi-region control-plane replication.
- Add sidecar lease expiry and garbage collection.
- Add eventual consistency scenarios for stale proxy configs.
