# Improvements and Next Steps: YouTube Top-K POC

## Core Behavior
- Add sliding-window aggregation for "last 1h/24h" trending rankings.
- Maintain incremental top-K heaps per tag to avoid full sorts on every query.
- Incorporate additional signals (watch time, shares, comments) into score.
- Track per-region leaderboards with configurable fallbacks.

## API & UX
- Add pagination and cursor tokens for browsing all videos.
- Provide batch ingestion endpoints for uploads and metric updates.
- Add a "trend delta" view comparing previous intervals.
- Add client-side polling for live leaderboard refreshes.

## Reliability & Ops
- Persist video stats in Redis or a database for multi-instance deployments.
- Add metrics (query latency, hot tags, update throughput) and health checks.
- Add Dockerfile and CI workflow.

## Security
- Require API keys for write endpoints and throttle engagement events.
- Validate tag vocabularies to reduce spam and abuse.

## Testing
- Unit tests for ranking ties, tag filtering, and score calculation.
- MVC tests for JSON request validation and error handling.
