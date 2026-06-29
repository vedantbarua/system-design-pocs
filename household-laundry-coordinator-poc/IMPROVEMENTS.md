# Improvements

## Scheduling

- Add recurring laundry plans and room reservations.
- Add custom timers per fabric type and machine cycle.
- Support load splitting and combined loads.
- Add explicit handoff acceptance tracking.

## Reliability

- Move load scans and reminder dispatch to background workers.
- Partition Kafka by household ID and machine ID.
- Add schema registry checks for machine event versions.
- Persist consumer offsets and projection checkpoints.

## Product Behavior

- Add mobile push notifications and quiet hours.
- Add appliance integrations for real washer/dryer events.
- Add stale-load escalation by household member.
- Add shared laundry-room availability for apartments.

## Operations

- Add structured logs, metrics, and tracing.
- Add notification provider retry budgets.
- Add database migrations and backup/restore runbooks.
- Add load tests for high-frequency appliance telemetry.

## Frontend

- Add calendar and timeline views.
- Add quick controls for move-to-dryer and folded actions.
- Add household member preferences.
- Add accessibility and visual regression tests.
