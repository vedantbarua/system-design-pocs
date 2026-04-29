# Technical README: Ad Click Aggregator POC

## Problem Statement

Ad platforms need to ingest high-volume click events and expose near-real-time metrics for campaign performance, publisher quality, and spend monitoring. This POC keeps the implementation intentionally small while making the important mechanics visible: event ingestion, dimensional grouping, time-window filtering, and time-bucketed aggregation.

## Architecture Overview

The system has two runnable parts:

- Spring Boot API on port `8110`
- React + Vite dashboard on port `5173`

The backend exposes JSON endpoints under `/api`. Incoming clicks are validated by `ClickIngestRequest`, converted into immutable `ClickEvent` records, and appended to an in-memory `CopyOnWriteArrayList`. Read endpoints scan that event list, apply optional time filters, then compute aggregate responses.

The frontend calls the API directly from the Vite dev server. It provides controls for seeding synthetic clicks, submitting a single click, changing the grouping dimension, choosing a bucket interval, and applying local datetime filters.

## Core Data Model

`ClickEvent` is the source event:

- `id`: server-generated UUID
- `adId`: creative or ad identifier
- `campaignId`: campaign identifier
- `publisherId`: traffic source identifier
- `occurredAt`: event timestamp as `Instant`
- `costCents`: click cost stored as integer cents

The API returns three aggregate shapes:

- `ClickOverview`: total clicks, total spend, unique ads, unique campaigns, and unique publishers
- `ClickSummary`: grouped click and spend totals plus uniqueness counts
- `TimeSeriesPoint`: grouped click and spend totals for a truncated time bucket

Grouping is controlled by `GroupBy` with `ad`, `campaign`, and `publisher`. Bucket truncation is controlled by `BucketInterval` with `minute`, `hour`, and `day`.

## Request Flow

### Ingest Click

1. `POST /api/clicks` receives ad, campaign, publisher, optional timestamp, and cost.
2. Bean validation rejects blank IDs and negative costs.
3. The controller parses `occurredAt` as ISO-8601. If it is omitted, the server uses `Instant.now()`.
4. `ClickAggregationService.ingest` creates a UUID-backed `ClickEvent`.
5. The event is appended to the in-memory event list and returned to the caller.

### Seed Clicks

1. `POST /api/clicks/seed?count=120` validates that count is between `1` and `5000`.
2. The service generates synthetic events across fixed ad, campaign, and publisher IDs.
3. Seeded timestamps are distributed across the previous 24 hours.

### Overview

1. `GET /api/overview` parses optional `from` and `to` timestamps.
2. The service filters events where `occurredAt >= from` and `occurredAt < to`.
3. It computes total clicks, total spend, and unique dimension counts.

### Summary

1. `GET /api/summary` parses optional filters and `groupBy`.
2. Events are filtered, grouped by the selected dimension, and reduced into click and spend totals.
3. Results are sorted by descending click count.

### Time Series

1. `GET /api/timeseries` parses optional filters, `groupBy`, and `interval`.
2. Events are filtered and grouped by both selected dimension and truncated timestamp bucket.
3. Results are sorted by bucket start time.

## Key Tradeoffs

- **In-memory event store:** keeps the demo easy to run and inspect, but data disappears on restart and one process owns all state.
- **Append-only raw events:** preserves flexible grouping and time-window queries, but every read rescans matching events.
- **On-demand aggregation:** avoids background jobs and materialized views, but read cost grows with event volume.
- **Integer cents:** avoids floating-point money errors for spend, but does not model currency conversion or billing precision beyond cents.
- **`CopyOnWriteArrayList`:** makes concurrent reads simple for a small demo, but it is not suitable for high write throughput.

## Failure Handling

The POC handles basic client-side and API validation failures:

- Invalid timestamps return `400 Bad Request` with an ISO-8601 hint.
- Unknown `groupBy` values return `400 Bad Request`.
- Unknown intervals return `400 Bad Request`.
- Seed counts outside `1..5000` return `400 Bad Request`.
- Blank IDs and negative costs are rejected by validation.

Operational failure handling is intentionally limited. There is no ingestion retry queue, dead-letter path, durable storage, backpressure, idempotency, or duplicate suppression.

## Scaling Path

A production version would separate ingestion from query serving:

1. Accept clicks through a stateless ingestion API.
2. Validate, normalize, and publish events to a durable log such as Kafka.
3. Partition events by campaign, ad, publisher, or tenant depending on query and ownership needs.
4. Use stream processors to build minute-level aggregates.
5. Store raw events in object storage and materialized rollups in an analytical store.
6. Serve dashboards from precomputed rollups with late-event correction.
7. Add monitoring for lag, dropped events, invalid events, and aggregate freshness.

## What Is Intentionally Simplified

- No durable database or event log
- No multi-tenant account model
- No authentication or authorization
- No client-side event SDK
- No deduplication or idempotency key
- No bot filtering, fraud detection, or attribution window logic
- No late-arrival watermarking
- No approximate distinct counting
- No background aggregation jobs
- No tests yet for aggregation edge cases
