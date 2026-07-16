# Production Improvements

## Product

- Add household profiles with separate nutrition targets, restrictions, and preferences.
- Support calendar import for busy nights and meal-prep windows.
- Add barcode or receipt ingestion for pantry updates.
- Generate recipe suggestions from pantry availability, budget, and leftovers.
- Track leftovers as first-class inventory with consume-by dates.

## Backend

- Replace full snapshots with event-sourced projections and periodic compacted snapshots.
- Add schema validation for all event payloads.
- Use optimistic concurrency on meal updates.
- Split projections for meal plan, grocery list, pantry, and alerts.
- Add real notification providers for SMS, email, and push reminders.

## Data

- Store ingredient aliases and units in normalized tables.
- Add nutrition-source metadata and confidence scores.
- Track grocery prices by store and region.
- Add retention policies for historical meal and pantry events.

## Reliability

- Move retry attempts to durable job storage.
- Add dead-letter handling for invalid Kafka events.
- Add consumer lag and projection freshness metrics.
- Add idempotency tests at the adapter boundary.
- Add load tests for large household plans and long event histories.

## Security

- Add authentication and household-level authorization.
- Encrypt sensitive dietary and health preference fields at rest.
- Add audit views for plan changes and notification sends.
- Separate read-only and write-capable API tokens.
