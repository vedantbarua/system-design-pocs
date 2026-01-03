# Improvements and Next Steps: Parking Meter POC

## Core Behavior
- Support multiple meters with unique IDs (in-memory map or persistent store).
- Add configurable coin types (dimes/nickels) and pricing rules.
- Handle paid extensions differently when meter is expired (grace periods, tickets).
- Add rate schedules (e.g., free hours, night rates, weekend pricing).

## Reliability & Data
- Persist state with a database (H2/Postgres) instead of in-memory.
- Add optimistic locking or per-meter synchronization if multiple meters are introduced.
- Expose clear error responses/validation for invalid inputs.

## API & UX
- JSON mutation endpoints (`/api/insert`, `/api/advance`) for automation.
- WebSocket or SSE stream for live countdown updates without manual refresh.
- Improve UI with timers counting down automatically on the page.
- Accessibility review (ARIA labels, focus states, keyboard shortcuts).

## Observability & Ops
- Add metrics (remaining minutes, expirations) via Micrometer/Prometheus.
- Structured logging for each action (insert, advance, tick).
- Dockerfile and GitHub Actions workflow to build/test on CI.

## Testing
- Unit tests for `ParkingMeter` edge cases (near cap, negative/zero inputs).
- Controller tests for happy/invalid paths.
- UI integration smoke tests with Selenium/Cypress (basic form submission).
