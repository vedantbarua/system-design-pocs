# Production Improvements

## Product

- Add barcode scanning and voice entry for grocery list capture.
- Add user-specific favorite stores, distance limits, and pickup preferences.
- Add dietary constraints and preferred substitution rules.
- Add historical price charts by item and store.
- Add weekly meal-plan import from the meal planning POC.

## Backend

- Replace full snapshots with event-sourced projections and periodic compacted snapshots.
- Add schema validation for all event payloads.
- Add optimistic concurrency for grocery list updates.
- Split projections for grocery list, price book, cart recommendations, alerts, and audits.
- Add provider adapters for store APIs, scraped feeds, or receipt imports.

## Data

- Normalize brands, units, package sizes, and item aliases.
- Add unit-price conversion for apples by pound vs bag, detergent ounces, and meat package weights.
- Track store fees, coupons, fuel/travel cost, and pickup availability.
- Add retention policies for stale prices, old recommendations, and audit events.

## Reliability

- Move retry attempts to durable job storage.
- Add dead-letter handling for invalid Kafka events.
- Add consumer lag and projection freshness metrics.
- Add load tests for price-feed bursts.
- Add replay tests to prove deterministic cart recommendations.

## Security

- Add authentication and household-level authorization.
- Redact store account metadata from logs and audits.
- Rate-limit price update ingestion.
- Add signed import/export links for grocery list sharing.
