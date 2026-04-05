# Technical README

## Problem Statement

Once a request crosses multiple services, local logs are no longer enough to explain latency, failures, or broken propagation. This POC makes trace context visible across a multi-service checkout flow and shows what happens when one hop drops headers.

## Architecture Overview

The POC models a single simulated request flow across five services:

- `api-gateway`
- `checkout-service`
- `inventory-service`
- `payment-service`
- `notification-service`

One Spring service owns the in-memory trace store, builds synthetic spans for each simulation request, and computes service-level metrics from the resulting traces. The UI triggers new traces and renders both span trees and aggregate metrics.

## Core Data Model

- `TraceView`: one trace with metadata, anomalies, propagation status, and ordered spans
- `SpanView`: one service hop with parent-child relationships, status, timing, attributes, and logs
- `ServiceMetricView`: per-service span count, error count, average latency, p95 latency, and active trace count
- `SimulationRequest`: requested flow parameters including region, payment failure, and propagation break target

## Request and Event Flow

### Healthy path

1. The UI posts a simulation request.
2. The service creates a root trace and gateway span.
3. Each downstream service span is appended with the previous span as parent.
4. The completed trace is stored and included in summary metrics.

### Broken propagation path

1. A simulation can declare a `breakPropagationAt` service.
2. The service marks the primary trace as propagation-broken.
3. A detached trace starts at the break point with no parent context.
4. The snapshot exposes both the original trace and the orphaned continuation.

### Error path

1. Payment failure marks the payment span as `ERROR`.
2. Notification is skipped and recorded as an anomaly.
3. Service metrics reflect the error count and the trace shows the truncated downstream path.

## Key Tradeoffs

- Synthetic traces keep the topology easy to explain, but they do not model real network transport or sampling.
- In-memory storage makes the dashboard fast and deterministic, but there is no retention or cross-instance aggregation.
- Metrics are derived from the current trace set, which is enough for the demo but not for long-lived observability trends.
- Broken propagation is intentionally explicit and deterministic rather than intermittent as it often is in production.

## Failure Handling

- Invalid simulation requests are rejected before trace generation.
- Broken propagation produces detached traces rather than silently hiding downstream work.
- Payment failure surfaces both span-level errors and missing downstream notifications.
- Reset clears the in-memory store and reseeds baseline scenarios.

## Scaling Path

To move toward production:

- instrument real service boundaries with trace headers
- export spans to an external collector such as OpenTelemetry
- store traces and metrics in durable backends
- add sampling, cardinality controls, and trace search
- correlate traces with logs, errors, and deployment versions

## What Is Intentionally Simplified

- one process simulates all services
- no real RPC calls or network timing variance
- no baggage propagation or span links
- no persistent retention or query language
- no cross-service authentication or multi-tenant isolation
