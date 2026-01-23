# Improvements and Next Steps: Tinder POC

## Core Features
- Persist profiles, swipes, and matches in Postgres or Redis.
- Add full chat flows with message read receipts and typing indicators.
- Support geo filters, age ranges, and visibility preferences.
- Add boosts, super-like inventory, and daily swipe limits.

## UX & Insights
- Introduce swipe animations and card stacks.
- Add photo carousels and richer prompts.
- Add recommendations based on mutual interests and proximity.
- Provide weekly swipe and match analytics.

## API & Integrations
- Expose GraphQL/REST endpoints for feed personalization.
- Add event streaming for swipe events.
- Integrate push notifications for new matches.

## Reliability & Ops
- Add rate limiting and abuse detection.
- Add health checks, metrics, and structured logging.
- Introduce background jobs for ranking updates.

## Security
- Add auth, profile verification, and content moderation tooling.
- Add audit logging for swipes and reports.

## Testing
- Unit tests for matching logic and summary counts.
- MVC tests for swipe and create flows.
- Contract tests for the JSON API.
