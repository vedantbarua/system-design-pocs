# Improvements

## Production Gaps

- Move route definitions out of process memory into a durable configuration store.
- Add service discovery so a route can target a service name or pool instead of one static URL.
- Persist route changes, breaker transitions, and admin actions in an audit log.
- Split gateway configuration from demo-only chaos controls.

## Reliability Improvements

- Add per-route timeout, retry, and backoff policies with explicit retry budgets.
- Track circuit breakers per route or upstream cluster instead of using one shared global threshold.
- Add active and passive health checks with separate signals so dashboard polling does not distort breaker state.
- Return typed upstream error responses that distinguish timeout, unavailable service, bad gateway, and open circuit.
- Add graceful shutdown and readiness behavior for the gateway and mock downstream services.

## Scaling Improvements

- Push route updates to gateway replicas through a watch stream instead of relying on local writes.
- Support multiple upstream instances per route with weighted, least-latency, or zone-aware balancing.
- Add request coalescing or caching for high-read aggregation endpoints.
- Emit Prometheus-style metrics for route hit counts, upstream latency, breaker states, and error rates.
- Add distributed tracing across gateway fanout calls so aggregate latency can be explained end to end.

## Security Improvements

- Add authentication and role-based access for route management, breaker reset, and chaos endpoints.
- Validate target URLs against an allowlist to prevent open proxy behavior.
- Add request body limits, header normalization, and path validation per route.
- Add tenant-aware rate limits and quotas at the gateway boundary.
- Protect downstream admin endpoints so they cannot be reached through public gateway routes.

## Testing Improvements

- Add unit tests for route matching, prefix normalization, and longest-prefix precedence.
- Add unit tests for circuit-breaker state transitions, timeout handling, and manual reset.
- Add integration tests for proxy path rewriting and aggregate partial failure responses.
- Add dashboard tests for degraded service rendering and chaos-control updates.
- Add load and failure simulation tests that sweep latency, error rate, and route update scenarios.
