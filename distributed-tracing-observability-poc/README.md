# Distributed Tracing / Observability POC

Spring Boot proof-of-concept for end-to-end trace propagation across multiple services, with detached traces when context is dropped and simple service-level latency/error summaries.

## Goal

Show why distributed tracing matters once a request crosses several service boundaries. The POC makes propagation visible by simulating both healthy flows and broken header forwarding.

## What It Covers

- A checkout flow across `api-gateway`, `checkout-service`, `inventory-service`, `payment-service`, and `notification-service`
- In-memory trace and span storage
- Parent-child span relationships and end-to-end service chains
- Broken propagation scenarios that produce detached orphan traces
- Service-level observability metrics including average latency, p95 latency, and error counts
- Dashboard for triggering scenarios and inspecting the latest traces

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd distributed-tracing-observability-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8135`.

## UI Flows

- Emit a healthy checkout trace
- Break propagation at inventory, payment, or notification to create detached traces
- Simulate a payment failure to see an errored span and missing downstream work
- Reset the in-memory store back to seeded traces

## JSON Endpoints

- `GET /api/snapshot` list the current summary, recent traces, and service metrics
- `GET /api/traces` list traces in reverse chronological order
- `GET /api/traces/{traceId}` inspect one trace with all spans
- `GET /api/services` list service-level observability metrics
- `POST /api/simulations` create a new simulated request trace
- `POST /api/reset` clear and reseed the store

Example simulation request:

```json
{
  "flowName": "checkout",
  "userId": "user-808",
  "region": "us-central",
  "paymentFails": false,
  "breakPropagationAt": "inventory-service"
}
```

## Notes

- Storage is fully in memory and resets on restart.
- Detached traces intentionally represent missing trace-header propagation between services.
- The latency values are simulated to highlight topology and failure modes, not benchmark real service performance.
