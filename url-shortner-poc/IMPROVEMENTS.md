# Improvements and Next Steps: URL Shortener POC

## Core Behavior
- Add persistence (H2/Postgres) so codes survive restarts.
- Support link expiration windows or one-time use links.
- Allow updating/deleting links and enforcing slug character rules.
- Generate QR codes for each short link.

## API & UX
- Return structured error bodies for invalid URLs or collisions.
- Add rate limiting or CAPTCHA on form to prevent spam.
- Provide copy-to-clipboard + toast feedback in the UI.
- Add analytics page with charts for hit counts over time.

## Reliability & Ops
- Dockerfile and CI workflow to build/test.
- Health/liveness endpoints and Prometheus metrics (redirect counts, failures).
- Configurable base URL per environment (env var override).

## Security
- Validate and block dangerous schemes (javascript:, data:, file:).
- Optional domain allowlist/denylist before accepting targets.
- Add basic auth or API keys for the JSON endpoints.

## Testing
- Unit tests for URL normalization, collision handling, and redirects.
- MVC tests for `/shorten`, `/s/{code}`, and API endpoints (happy + failure cases).
- Basic UI smoke with Selenium/Cypress for form submission + redirect.
