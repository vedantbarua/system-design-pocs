# Privacy Consent Preferences Improvements

## Next Engineering Steps

- Add idempotency keys to consent updates, processing events, and DSAR requests.
- Split decision rules into versioned policy configuration instead of hard-coded region logic.
- Publish consent-change events to a stream so downstream processors can update caches.
- Add service identity authentication and purpose-level authorization for processors.
- Store audit records in tamper-evident append-only storage.
- Add consent expiration renewal workflows and notification hooks.
- Model household, organization, and minor-user consent delegation.
- Add data inventory mappings from purpose to datasets, processors, and retention windows.

## Production Hardening

- Run the service behind an API gateway with mTLS or signed service tokens.
- Use a strongly consistent database for the consent ledger.
- Add optimistic concurrency checks for preference-center updates.
- Add retention and deletion jobs for old processing-event metadata.
- Emit metrics for decision latency, denials by purpose, revocations, and overdue DSAR requests.
- Add alerts for processors with unusual denied-processing volume.
- Support regional policy rollout through feature flags or policy-as-code.
- Add backups, point-in-time recovery, and disaster-recovery runbooks.

## Product Extensions

- Build a preference-center UI for users.
- Add consent receipts that users can export.
- Add per-device and per-channel marketing preferences.
- Add cookie-banner integration with source attribution.
- Add DSAR intake forms and operator queues.
- Add export bundle generation for completed access requests.
- Add deletion verification from downstream systems.
- Add privacy impact assessment metadata for new processors.

## Testing Gaps

- Add property tests around consent version ordering.
- Add concurrency tests for simultaneous consent updates.
- Add HTTP-level tests for all endpoints.
- Add migration tests for evolving the consent schema.
- Add large-volume tests for processing-event ingest.
- Add policy regression tests for each supported region.
