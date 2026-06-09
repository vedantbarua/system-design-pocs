# Home Maintenance Reminder Improvements

## Production Hardening

- Persist the domain model in PostgreSQL.
- Add authentication and property-level roles.
- Use transactions for task completion and recurrence updates.
- Add idempotency keys and optimistic concurrency controls.
- Move reminders to a durable job queue.
- Integrate email, SMS, and push providers with delivery status.
- Store manuals, receipts, and warranty files in object storage.
- Add timezone-aware scheduling per property.
- Add audit metadata for every mutation.

## Product Extensions

- Add mobile photo capture for receipts and equipment labels.
- Extract model, serial, and warranty details with OCR.
- Import manufacturer maintenance recommendations.
- Support seasonal schedules and weather-triggered work.
- Add vendor contacts, estimates, and appointment booking.
- Add household assignments and completion approvals.
- Track consumable inventory such as filters and batteries.
- Export maintenance records for resale or insurance claims.
- Add budget forecasts and replacement-cost planning.

## Testing Gaps

- Add Express integration tests.
- Add React interaction and accessibility tests.
- Add timezone and daylight-saving boundary tests.
- Add concurrent completion tests.
- Add reminder-provider retry and dead-letter tests.
- Add browser visual regression tests.
