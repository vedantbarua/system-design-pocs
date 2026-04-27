# Grocery-to-Meal Optimizer Improvements

## Production Gaps

- Persist inventory, recipe catalog, user preferences, and plan history in a database.
- Add household/user accounts with separate pantry state and preference profiles.
- Integrate a normalized grocery product catalog for prices, units, packages, and substitutions.
- Add recipe import and moderation workflows instead of relying only on seeded recipes.
- Track actual consumption so the system learns which planned meals were skipped.

## Reliability Improvements

- Store optimizer jobs in a durable queue for long-running plan generation.
- Add idempotency keys for inventory mutations and optimizer requests.
- Keep an audit trail for every pantry quantity change.
- Add validation schemas for API payloads.
- Add fallback behavior when a recipe references unavailable or malformed ingredient data.

## Scaling Improvements

- Partition pantry and plan data by household ID.
- Precompute recipe feature vectors for common scoring dimensions.
- Cache candidate sets by dietary filters and meal type.
- Replace the greedy selector with a solver for larger planning horizons.
- Add pagination and search to the recipe and inventory APIs.

## Security Improvements

- Add authentication and authorization before exposing household inventory.
- Rate-limit write endpoints and optimizer runs.
- Validate and escape all user-entered names and tags.
- Add CORS allowlists for deployed environments.
- Avoid logging sensitive household metadata in operational events.

## Testing Improvements

- Unit test the scoring function across budget, expiry, and tag-filter scenarios.
- Unit test shopping-list aggregation and inventory consumption.
- Add API tests for CRUD, seed reset, and simulation endpoints.
- Add React component tests for optimizer controls and error states.
- Add end-to-end tests that verify a plan updates after inventory changes.
