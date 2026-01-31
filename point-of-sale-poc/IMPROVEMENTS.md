# Improvements and Next Steps: Point of Sale POC

## Core Behavior
- Support multiple tax rates by store or jurisdiction.
- Add discounts, coupons, and promo bundles.
- Include SKU inventory and low-stock alerts.
- Track returns, exchanges, and voided sales.

## API & UX
- Barcode scan input and type-ahead catalog search.
- Saved carts and split payments (cash + card).
- Receipt export (PDF/CSV) with printable layout.
- Operator shifts with per-user sales totals.

## Reliability & Ops
- Persist catalog, carts, and sales in a database.
- Add idempotency keys for checkout requests.
- Add a Dockerfile and CI workflow.

## Security
- Authenticate operators and require roles for refunds.
- Audit log of catalog and pricing changes.

## Testing
- Unit tests for tax and change calculations.
- MVC tests for checkout error conditions.
