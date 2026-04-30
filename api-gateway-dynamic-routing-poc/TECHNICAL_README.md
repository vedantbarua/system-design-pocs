# Technical README

## Problem Statement

An API gateway is the front door for a service ecosystem. It has to map public paths to internal services, keep clients insulated from service topology, aggregate calls when that reduces client round trips, and avoid amplifying downstream failures.

This POC models those gateway responsibilities with dynamic route registration, proxy forwarding, an aggregation endpoint, service health checks, and per-service circuit breakers.

## Architecture Overview

The POC has four runtime processes:

1. `backend/server.js` runs the gateway on port `9100`.
2. `backend/services/user-service.js` runs a mock user service on port `9101`.
3. `backend/services/order-service.js` runs a mock order service on port `9102`.
4. `frontend/` runs a React + Vite dashboard for route, health, breaker, and chaos visibility.

The gateway owns the route registry and circuit-breaker state. The downstream services expose small domain APIs plus admin chaos endpoints so gateway behavior can be exercised without external dependencies.

## Core Data Model

- `routeRegistry`: in-memory list of service routes with `id`, `name`, `prefix`, and `target`.
- `CircuitBreaker`: per-service state machine with `CLOSED`, `OPEN`, and `HALF_OPEN` states.
- `breakerConfig`: shared thresholds for trip and recovery behavior.
- `chaos`: per-downstream-service settings for `failureRate`, `delayMs`, `jitterMs`, and `down`.

Routes are sorted by longest prefix first. That keeps more specific route prefixes from being shadowed by broader prefixes when dynamic routes are added.

## Request And Event Flow

### Dynamic route registration

1. A caller submits `POST /api/routes` with route id, prefix, and target.
2. The gateway validates the required fields and normalizes the prefix.
3. Existing routes are replaced by id; new routes are appended.
4. The route registry is sorted by prefix length for deterministic matching.

### Proxy routing

1. A request enters the gateway under `/api`.
2. The gateway resolves the first route whose prefix matches the request path.
3. The matching service's circuit breaker is checked before proxying.
4. `http-proxy-middleware` forwards the request to the route target.
5. The route prefix is stripped before the request reaches the downstream service.
6. Proxy responses update breaker success or failure counters.

Example:

`GET /api/users/u-1001` routes to `http://localhost:9101/users/u-1001`.

### Aggregation

1. A client calls `GET /api/aggregate/:userId`.
2. The gateway fetches user details and order history concurrently.
3. Each downstream call goes through `fetchWithBreaker`.
4. Successful responses are merged into one payload.
5. Failed dependencies are reported in `warnings` instead of failing the full aggregate response.
6. The response includes breaker snapshots so the UI can show the dependency state that shaped the result.

### Health checks

1. The dashboard polls `GET /api/routes`, `GET /api/health/services`, and `GET /api/circuit`.
2. The gateway checks each downstream service's `/health` endpoint through the same breaker-aware fetch path.
3. Failed or blocked checks are marked `degraded`.
4. Breaker timestamps and counters are returned with each service health result.

### Circuit breaker lifecycle

1. Breakers start `CLOSED` and allow traffic.
2. Three failures trip a breaker to `OPEN`.
3. Open breakers reject traffic until the open window expires.
4. After ten seconds, the next request moves the breaker to `HALF_OPEN`.
5. Two successful half-open requests close the breaker.
6. Any half-open failure trips the breaker back to `OPEN`.

## Key Tradeoffs

- In-memory routing makes dynamic registration easy to inspect, but routes disappear on restart and are not shared across gateway replicas.
- Aggregation improves client ergonomics, but it couples the gateway to downstream response shapes.
- The circuit breaker protects dependencies from repeated failing calls, but it is local to one process and does not coordinate across gateway nodes.
- Longest-prefix routing is simple and predictable, but a production gateway would need stricter route conflict validation.
- Health checks share the breaker path, which makes degraded state visible, but active probing can also contribute to failure counts in this demo.

## Failure Handling

- Missing route fields return `400`.
- Unknown routes return `404`.
- Open circuits return `503` with the affected service and `openUntil` timestamp.
- Downstream non-2xx responses, proxy errors, and timeouts count as breaker failures.
- Aggregated requests return partial data with warnings when one dependency fails.
- Chaos endpoints can simulate hard outages, randomized failures, and latency.

## Scaling Path

- Store route definitions in a durable config store and push route updates to gateway instances.
- Add service discovery integration so route targets can resolve to healthy instance pools.
- Use per-route policies for timeouts, retries, auth, rate limits, and breaker thresholds.
- Emit metrics and traces for route matches, upstream latency, breaker transitions, and aggregate fanout.
- Add canary and weighted routing for progressive rollout.
- Run multiple gateway replicas behind a load balancer with shared operational telemetry.

## What Is Intentionally Simplified

- Route registry and circuit breakers are process-local.
- Downstream services are mock services with fixed sample data.
- There is no authentication, authorization, or tenant isolation.
- There is no retry budget, backoff policy, or request hedging.
- There is no persistent audit log for route changes or breaker transitions.
- The dashboard is an operator view, not a full gateway administration product.
