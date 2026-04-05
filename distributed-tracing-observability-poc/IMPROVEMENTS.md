# Improvements

## Production Gaps

- Replace synthetic span generation with real OpenTelemetry-style instrumentation.
- Export traces to an external collector and durable storage backend.
- Add search, filtering, and retention controls for longer-lived trace data.

## Reliability Improvements

- Add validation around trace-id propagation and missing-header detection at each hop.
- Add health indicators for collector saturation, dropped spans, and storage failures.
- Add correlation between traces and service error logs for easier incident triage.

## Scaling Improvements

- Add sampling policies that adapt to traffic volume and error rate.
- Add partitioned trace ingestion and batched export pipelines.
- Add high-cardinality tag controls so metrics remain cheap under load.

## Security Improvements

- Remove or redact sensitive attributes before storing spans.
- Add authentication and authorization for trace inspection endpoints.
- Add tenant and environment scoping for stored trace data.

## Testing Improvements

- Add controller tests for simulation validation and reset behavior.
- Add trace-topology tests for healthy, broken-propagation, and payment-failure flows.
- Add metric-calculation tests for average latency, p95, and error counts.
