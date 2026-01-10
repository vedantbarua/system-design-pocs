# Improvements and Next Steps: Unique ID Generator POC

## Core Behavior
- Add optional datacenter id bits to match classic Snowflake layouts.
- Persist node sequence state to disk to survive restarts.
- Support custom epochs and bit layouts per node.
- Implement a monotonic timestamp source to handle clock drift more gracefully.

## API & UX
- Add bulk decode endpoint for ID lists.
- Add a throughput simulator and chart for generated IDs per second.
- Provide a friendly error when sequence overflow causes wait.
- Add CSV export for generated batches.

## Reliability & Ops
- Add metrics for ids/sec and clock skew events.
- Provide a Dockerfile and CI workflow.
- Add health endpoints for node state and clock checks.

## Security
- Require API keys for generation endpoints.
- Support hashed node IDs when exposing snapshots.

## Testing
- Unit tests for sequence rollover and timestamp monotonicity.
- MVC tests for validation errors and 201 responses.
