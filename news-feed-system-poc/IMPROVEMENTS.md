# Improvements and Next Steps: News Feed System POC

## Core Behavior
- Add persistence (Postgres/H2) for users, follows, and posts.
- Implement unfollow, post deletion, and edit history.
- Add per-feed pagination or cursor-based scroll for large timelines.
- Support media attachments and link previews.

## Ranking & Personalization
- Add ranking signals (recency, engagement, affinity weights).
- Include resharing and boosts for popular posts.
- Introduce a separate "For You" feed with exploration.

## UX & Realtime
- Add WebSocket/SSE push for new posts.
- Improve validation errors with inline field messaging.
- Add profile pages with follower counts and post history.

## API & Integrations
- Add endpoints for following lists and follower counts.
- Provide batch endpoints for fetching multiple feeds at once.
- Add rate limiting for post creation.

## Reliability & Ops
- Add Dockerfile and CI pipeline for builds/tests.
- Add health check endpoint and basic metrics.
- Add caching for feed aggregation.

## Security
- Add authentication and authorization for posting/following.
- Add moderation pipeline for abusive content.
- Add audit logging for feed actions.

## Testing
- Unit tests for `NewsFeedService` (ordering, caps, validation).
- MVC tests for UI flows and JSON endpoints.
- Contract tests for feed sorting and limit behavior.
