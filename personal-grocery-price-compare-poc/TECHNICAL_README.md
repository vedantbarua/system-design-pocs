# Technical Notes

## Architecture

The API owns a single `GroceryPriceCompare` domain model. Events enter through HTTP or Kafka, are deduplicated by `itemId:eventId`, applied to the in-memory projection, and persisted as a snapshot plus event rows when Postgres is configured.

Adapters are intentionally small:

- Kafka publishes/consumes grocery price events, or buffers messages in memory.
- Postgres stores `grocery_price_snapshots` and `grocery_price_events`.
- Redis stores the latest serialized snapshot.
- In-memory mode keeps the POC runnable without local infrastructure.

## Domain Model

Primary entities:

- `GroceryItem`: list item, category, quantity, unit, preferred brand, max price, and status.
- `Store`: grocery store metadata such as distance and pickup availability.
- `StorePrice`: item price, brand, unit, availability, previous price, and update time per store.
- `Recommendation`: single-store and split-store cart plans with totals and projected savings.
- `Alert`: deduped issue such as price drop, over budget, unavailable, substitution, duplicate item, or best-store change.
- `Job`: retryable background work for refreshes, checks, recommendation rebuilds, alerts, and retention.
- `Audit`: append-only UI-visible action history.

## Event Handling

Supported events:

- `ITEM_ADDED`
- `ITEM_UPDATED`
- `ITEM_BOUGHT`
- `PRICE_UPDATED`
- `AVAILABILITY_UPDATED`
- `SUBSTITUTION_FOUND`
- `STORE_SELECTED`
- `PRICE_SCAN`
- `REMINDER_SENT`

Each event is normalized into a full `PriceEvent`. If the event timestamp is older than the item's `updatedAt`, the event is recorded but not applied to the current projection.

## Cart Comparison

`storeCartTotal()` computes the total cost for all needed/substituted items at one store and tracks missing items. `buildRecommendations()` produces:

- best single-store cart plan
- cheapest split-store cart plan
- projected savings from splitting the cart

The split plan chooses the cheapest available store price for each item.

## Alerting

`scanPrices()` evaluates:

- price drops against previous price
- over-budget item/store combinations
- unavailable items

Duplicate list rows are detected by normalized item name, preferred brand, and unit. Substitutions and store selection changes emit their own deduped alerts.

## Job Semantics

Jobs are deduped per kind and hour. A job can be forced to fail with `/api/jobs/fail-next`, then the next dispatch moves it to `RETRY`. The following dispatch completes it unless another failure is armed.

Job kinds:

- `PRICE_REFRESH`
- `AVAILABILITY_CHECK`
- `RECOMMENDATION_BUILD`
- `ALERT_DISPATCH`
- `RETENTION`

## Failure Modes Covered

- Duplicate event delivery
- Late event delivery
- Duplicate grocery rows
- Price drops
- Store item unavailability
- Substitution suggestions
- Retryable job failure
- Snapshot export/import recovery
