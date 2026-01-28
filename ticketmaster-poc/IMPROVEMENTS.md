# Improvements and Next Steps: Ticketmaster POC

## Core Features
- Add seat maps with section-level inventory and row/seat selection.
- Introduce promotions, presale codes, and fan verification windows.
- Support multi-event bundles and season ticket packages.
- Add order cancellation, refunds, and transfer flows.

## UX & Insights
- Add event search, filters by city/date/category, and sort by price.
- Show price history and demand-based surge indicators.
- Display seat-view previews and accessibility flags.

## API & Integrations
- Add webhooks for hold expiry and order confirmation.
- Integrate payment providers and fraud checks.
- Add venue timezone normalization with IANA TZ data.

## Reliability & Ops
- Persist data in Postgres and add caching for popular events.
- Add rate limiting and queues for high-demand onsales.
- Add health checks, metrics, and load test scripts.

## Security
- Add authentication for staff operations and audit trails.
- Implement hold anti-bot protections and CAPTCHA hooks.

## Testing
- Unit tests for hold expiry and availability calculations.
- MVC tests for tier creation and order validation.
- Contract tests for API responses.
