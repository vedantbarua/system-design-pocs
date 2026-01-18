# Improvements and Next Steps: Local Delivery Service POC

## Core Behavior
- Add automatic driver matching based on zone and priority.
- Support multi-stop routes and batch deliveries.
- Track pickup and dropoff timestamps for SLA reporting.
- Add order pricing and customer contact details.

## API & UX
- Provide map view with driver locations and order pins.
- Add bulk import/export for orders and drivers.
- Add filtering by status, zone, and driver.
- Add search for order id or customer name.

## Reliability & Ops
- Persist orders and drivers in a database or Redis.
- Add background cleanup for stale orders.
- Provide a Dockerfile and CI workflow.

## Security
- Require authentication for dispatch actions.
- Add role-based permissions for operators vs. drivers.

## Testing
- Unit tests for assignment rules and status transitions.
- MVC tests for API responses and error handling.
