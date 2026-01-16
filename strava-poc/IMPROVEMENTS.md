# Improvements and Next Steps: Strava POC

## Core Features
- Persist activities in Postgres or H2 with a real repository layer.
- Add athletes, profiles, and follower relationships.
- Support activity splits, elevation gain, and GPX uploads.
- Add feed pagination and filtering by type.

## UX & Insights
- Add charts for weekly mileage, pace trends, and personal bests.
- Add map previews for routes and a route explorer.
- Add likes, comments, and kudos notifications.
- Add rich validation messages and inline hints for pace goals.

## API & Integrations
- Add REST endpoints for activities and athlete stats.
- Add webhook simulation for device sync.
- Provide export endpoints for CSV/GPX.

## Reliability & Ops
- Add Dockerfile and CI for tests.
- Add health check endpoint and basic metrics.
- Add caching for feed summary stats.

## Security
- Add authentication and per-athlete authorization.
- Add rate limiting and request logging.

## Testing
- Unit tests for summary stats and pace calculations.
- MVC tests for create and detail flows.
- Contract tests for API responses.
