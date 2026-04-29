# Improvements and Next Steps: Ad Click Aggregator POC

## Production Gaps

- Replace the in-memory event list with a durable ingestion path backed by an append-only log.
- Add a persistent raw-event store so clicks can be replayed after deploys or aggregation bugs.
- Introduce tenant, advertiser, campaign, and publisher ownership boundaries.
- Add idempotency keys or click IDs supplied by the client SDK to suppress duplicates.
- Add late-event handling so clicks that arrive after a bucket closes can correct rollups.
- Separate ingestion APIs from query APIs so read load cannot starve writes.

## Reliability Improvements

- Put a queue or stream between ingestion and aggregation to absorb traffic spikes.
- Add retry and dead-letter handling for malformed or unprocessable events.
- Track ingestion lag, aggregate freshness, rejected events, and queue depth.
- Add backpressure or rate limits per publisher, tenant, and API key.
- Protect aggregation endpoints with query bounds to avoid unbounded scans.
- Add health checks that distinguish API health from aggregation freshness.

## Scaling Improvements

- Partition raw click events by tenant and campaign or by event time plus campaign.
- Materialize minute-level aggregates instead of rescanning raw events for every request.
- Roll minute buckets into hourly and daily buckets for cheaper dashboard queries.
- Use an analytical store or OLAP engine for high-cardinality dimensions.
- Add approximate distinct counters for unique ads, publishers, users, or devices at scale.
- Cache common dashboard queries with short TTLs and explicit invalidation on late corrections.

## Security Improvements

- Require API keys or signed ingestion requests.
- Scope dashboard reads by tenant and role.
- Validate allowed campaign, ad, and publisher IDs against owned entities.
- Add request size limits and structured validation errors.
- Protect CORS configuration by environment instead of hardcoding the dev origin.
- Add audit logging for manual seed, replay, and administrative actions.

## Testing Improvements

- Add unit tests for time filtering boundaries: inclusive `from`, exclusive `to`.
- Add unit tests for all grouping modes and bucket intervals.
- Add validation tests for invalid timestamps, invalid enum values, and seed count bounds.
- Add controller tests for response status codes and JSON shapes.
- Add frontend tests for query construction and form submission payloads.
- Add load-oriented tests that make the cost of on-demand aggregation visible.
