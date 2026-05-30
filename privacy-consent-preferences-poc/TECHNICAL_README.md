# Privacy Consent Preferences Technical README

## Architecture

The POC is a small privacy control plane with one process and a SQLite database. The important design point is that data processors do not embed privacy rules locally. They call the decision layer with a `user_id` and `purpose`, and the service returns an allow/deny answer with the reason and consent version that justified it.

```text
Product UI / APIs
       |
       v
Consent Preference Service
       |
       +-- users
       +-- append-only consent ledger
       +-- processing events
       +-- DSAR requests
       +-- audit events
```

## Data Model

### Users

`users` stores privacy subjects with region and lightweight metadata. Region drives default behavior when there is no explicit consent record.

### Consents

`consents` is append-only. Each row has:

- `user_id`
- `purpose`
- monotonic `version`
- `status`
- `source`
- `policy_version`
- optional expiration
- notes and timestamp

The latest row for `(user_id, purpose)` is authoritative. This makes revocation and historical analysis straightforward because old consent rows are not overwritten.

### Processing Events

`processing_events` records every attempted data use that goes through the service. The row stores the decision, reason, and consent version. Denied events are counted as policy violations in the dashboard snapshot.

### DSAR Requests

`dsar_requests` models export and delete workflows. A request starts as `REQUESTED`, receives a 30-day due date, and can be completed. Completing a delete request revokes all non-essential purposes for that user.

### Audit Events

`audit_events` records writes and decision checks so operators can explain how preferences changed and why a processing event was allowed or blocked.

## Decision Rules

Decision evaluation follows this order:

1. `essential` is always allowed.
2. A latest unexpired `GRANTED` consent allows the purpose.
3. A latest `DENIED` or `REVOKED` consent blocks the purpose.
4. An expired grant blocks the purpose.
5. Strict regions such as `EU`, `UK`, and `CA` require explicit consent.
6. Non-strict regions allow first-party `analytics` by default until opt-out.
7. Other non-essential purposes require explicit opt-in.

The result always includes `allowed`, `reason`, `region`, and `consent_version`.

## API Shape

Read endpoints expose the current state:

- `/snapshot`
- `/users`
- `/consents`
- `/processing-events`
- `/dsar`
- `/audit`

Write endpoints model the main workflows:

- `POST /users`
- `POST /consents`
- `POST /consents/revoke`
- `POST /decisions/check`
- `POST /processing-events`
- `POST /dsar`
- `POST /dsar/{request_id}/complete`

## Consistency and Idempotency

This POC uses one SQLite writer, so transaction boundaries are simple. In a production system, idempotency keys should be required for consent updates, processing events, and DSAR creation. The append-only consent ledger makes replay and audit easier, but duplicate client submissions still need explicit protection.

## Operational Tradeoffs

- Central decision service keeps privacy logic consistent across processors.
- Append-only consent history improves auditability but grows over time.
- Denied processing events are useful evidence, but high volume systems may sample or stream them.
- Region rules are coded in process for clarity; production systems usually externalize them into policy configuration.
- DSAR workflows are simplified to status transitions and consent revocation.

## Failure Modes

- If the service is unavailable, processors need a default behavior. Privacy-sensitive systems typically fail closed for non-essential purposes.
- Clock drift can affect consent expiration and DSAR due dates.
- Missing or stale region data can cause incorrect defaults.
- A processor that bypasses the service can violate user preferences.
- Bulk DSAR deletion requires coordination with downstream stores beyond this POC.

## Production Extensions

- Strong authentication and scoped service identities
- Idempotency keys for all writes
- Event stream publication for consent changes
- Policy-as-code integration for regional rules
- Region and residency validation from authoritative profile services
- Per-purpose data inventory mapping
- DSAR orchestration across downstream systems
- Retention policy automation
- Tamper-evident audit log storage
- Metrics and alerts for denied processing spikes
