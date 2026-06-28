# Improvements

## Scheduling

- Add timezone-aware recurrence generation.
- Import official municipal holiday calendars.
- Support per-stream service windows and route-specific cutoff times.
- Add one-off bulk pickup booking and cancellation workflows.

## Reliability

- Move schedule scans and dispatch jobs to background workers.
- Partition Kafka by service zone and route ID.
- Add schema registry checks for route event versions.
- Persist consumer offsets and projection checkpoints.

## Product Behavior

- Add multi-household support and shared property managers.
- Add photo evidence for missed or blocked pickups.
- Add calendar export and smart speaker reminders.
- Add outage maps and route-level progress estimates.

## Operations

- Add structured logs, metrics, and tracing.
- Add alert provider integrations with retry budgets.
- Add database migrations and backup/restore runbooks.
- Add load tests for high-volume municipal route events.

## Frontend

- Add calendar and map views.
- Add quick filters by waste stream and status.
- Add notification preference controls.
- Add accessibility and visual regression tests.
