# Improvements and Next Steps: Price Tracker POC

## Core Behavior
- Add scheduled background checks with configurable polling intervals.
- Track price history and percentage drop from the initial price.
- Support per-item currency and localization.
- Allow separate alert thresholds (absolute and percent).

## API & UX
- Add bulk import/export (CSV or JSON) for tracked items.
- Provide webhook or email notifications for deals.
- Add tags and filtering by retailer or category.
- Include sparkline charts for price history.

## Reliability & Ops
- Persist items in a database or Redis for multi-instance deployments.
- Add a cleanup task for stale items and soft deletes.
- Add a Dockerfile and CI workflow.

## Security
- Restrict who can add/update/delete items with authentication.
- Validate URLs with an allowlist of retailers.

## Testing
- Unit tests for price validation and alert logic.
- MVC tests for API responses and error handling.
