# Improvements and Next Steps: Netflix POC

## Core Behavior
- Add personalized ranking models with watch history embeddings.
- Support episodic progress per season/episode for series.
- Introduce regional catalogs and licensing windows.
- Add multi-device concurrency rules and stream limits.

## API & UX
- Add full-text search, fuzzy matching, and autocomplete.
- Provide batch ingest endpoints for catalog updates.
- Surface “because you watched” explanations in the UI.
- Add profile avatars and parental controls UI.

## Reliability & Ops
- Persist catalog, watchlists, and playback in a database.
- Add distributed caching for recommendations and trending lists.
- Add metrics (playback starts, completion rate, watchlist adds).
- Add Dockerfile and CI workflow.

## Security
- Require auth tokens per profile and scope write endpoints.
- Rate-limit playback events and watchlist updates.

## Testing
- Unit tests for scoring, maturity filtering, and watchlist behavior.
- MVC tests for JSON validation and bad input handling.
