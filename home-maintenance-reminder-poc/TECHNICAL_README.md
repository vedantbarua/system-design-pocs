# Home Maintenance Reminder Technical README

## Architecture

```text
React dashboard
      |
      v
Express JSON API
      |
      +-- schedule state derivation
      +-- recurrence transitions
      +-- asset-health projection
      +-- service-cost aggregation
      +-- reminder generation
      +-- in-memory domain store
```

The backend keeps maintenance rules in `backend/src/core.js` and HTTP routing in `backend/src/server.js`. Domain behavior can therefore be tested without starting Express.

## Scheduling Model

Tasks use one of two schedules:

- Date based: next due date, recurrence in days, and a lead window
- Usage based: current usage, next service threshold, recurrence units, and a lead threshold

Status is derived rather than stored:

- `UPCOMING`: outside the configured lead window
- `DUE`: inside the lead window or usage threshold
- `OVERDUE`: past the date or usage threshold
- `SKIPPED`: explicitly skipped for the current response cycle

Completing a date task advances from the completion date. Completing a usage task advances from its current usage reading. This prevents a late service from immediately appearing overdue again.

## Service History

Completion and skip operations append service-history records. Completed records include:

- Completion date
- Integer-cent cost
- Vendor or responsible person
- Notes
- Related task and asset identifiers

Annual spending is projected from completed history for the selected property and year.

## Asset Health

The POC calculates a simple explainable score:

- Start at 100
- Subtract 25 per overdue linked task
- Subtract 10 per due linked task
- Subtract 5 for an expired asset warranty

This is a product signal, not a predictive-failure model. A production score should use asset type, age, failure history, inspection results, and manufacturer service guidance.

## Reminder Idempotency

Reminder generation covers due or overdue tasks and warranties or documents nearing expiry. Each pending reminder has a deduplication key built from the target and current due value. Re-running the job does not queue the same reminder twice, while a newly advanced task can generate a new reminder.

## Consistency Considerations

The in-memory implementation is synchronous. A production service should:

- Persist properties, assets, schedules, history, and reminders in PostgreSQL.
- Update task recurrence and append service history in one transaction.
- Enforce idempotency keys on completion and skip writes.
- Run reminder scans through a durable scheduler and queue.
- Store document files in object storage.
- Apply property-level authorization.
- Retain an immutable audit log for schedule and service changes.
