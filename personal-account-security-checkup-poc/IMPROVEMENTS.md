# Production Improvements

## Product

- Add account import from browser password managers without storing passwords.
- Add passkey, hardware-key, and authenticator app setup workflows.
- Add household/family sharing with account ownership and emergency access.
- Add security review schedules for critical accounts.
- Add encrypted recovery checklist export downloads.

## Backend

- Replace full snapshots with event-sourced projections and periodic compacted snapshots.
- Add schema validation for all event payloads.
- Add optimistic concurrency for account updates.
- Split projections for risk register, breach findings, alerts, and checklist exports.
- Add real breach-feed integrations with provider-specific backoff.

## Data

- Store only metadata; never store raw passwords or secrets.
- Normalize provider domains, aliases, and account categories.
- Track risk-score reasons separately from the aggregate score.
- Add retention policies for archived accounts, old events, and generated exports.

## Reliability

- Move retry attempts to durable job storage.
- Add dead-letter handling for invalid Kafka events.
- Add consumer lag and projection freshness metrics.
- Add load tests for large account inventories and long event histories.
- Add export checksum verification and tamper-evident audit records.

## Security

- Add authentication and user-level authorization.
- Encrypt recovery metadata and breach details at rest.
- Add field-level redaction in logs and audit events.
- Separate read-only, account-editor, and export-capable roles.
- Add rate limiting and abuse detection around event ingestion.
