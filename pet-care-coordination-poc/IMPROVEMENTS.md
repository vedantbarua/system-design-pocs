# Improvements

## Scheduling

- Add timezone-aware recurrence generation.
- Support custom care windows per pet and task type.
- Add assignment swaps and acceptance tracking.
- Model sitter visits as multi-task bundles.

## Reliability

- Move schedule scans and reminder dispatch to background workers.
- Partition Kafka by household ID.
- Add schema registry checks for care event versions.
- Persist consumer offsets and projection checkpoints.

## Product Behavior

- Add care instructions, attachments, and medication dosage metadata.
- Add vet visit documents and vaccine expiration reminders.
- Add offline mobile sync conflict resolution.
- Add caregiver permissions and temporary access windows.

## Operations

- Add structured logs, metrics, and tracing.
- Add alert provider integrations with retry budgets.
- Add migrations, backups, and restore runbooks.
- Add load tests for many households and caregivers.

## Frontend

- Add calendar and timeline views.
- Add quick-complete controls for common tasks.
- Add caregiver preference settings.
- Add accessibility and visual regression tests.
