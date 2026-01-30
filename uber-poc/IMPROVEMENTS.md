# Improvements and Next Steps: Uber POC

## Core Behavior
- Add live driver location tracking and rider ETA updates.
- Support pooled rides with multiple pickups and dropoffs.
- Add driver acceptance/decline flows and re-matching.
- Track actual trip duration, distance, and final fare adjustments.

## Pricing
- Model surge based on supply/demand windows and time of day.
- Add tolls, tips, minimum fare, and cancellation fees.
- Expose a pricing breakdown per trip.

## API & UX
- Provide a map view with driver pins and active trips.
- Add filters for zone, status, and product.
- Offer a driver/rider profile detail view.

## Reliability & Ops
- Persist state in a database or Redis.
- Add background cleanup for stale trips.
- Provide a Dockerfile and CI workflow.

## Security
- Add authentication and role-based access (ops vs. driver vs. rider).
- Audit assignment actions and status transitions.

## Testing
- Unit tests for matching and status transitions.
- MVC tests for API responses and error handling.
