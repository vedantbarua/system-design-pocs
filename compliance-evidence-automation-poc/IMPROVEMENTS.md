# Compliance Evidence Automation Improvements

## Next Engineering Steps

- Add real collectors for consent logs, retention decisions, DSAR receipts, access reviews, and incident records.
- Add scheduled collection jobs with leases and retry handling.
- Add control versioning so packages identify the exact control text assessed.
- Add framework crosswalks for shared controls across SOC2, GDPR, HIPAA, and ISO-style mappings.
- Add evidence attachment storage for larger artifacts.
- Add package export to signed JSON and PDF summaries.
- Add exception approval workflow with risk acceptance.
- Add evidence expiry notifications for owners.

## Production Hardening

- Authenticate collectors and API users.
- Add role-based access for control owners, compliance operators, and auditors.
- Store evidence payloads in immutable object storage.
- Anchor checksums in tamper-evident audit logs.
- Add idempotency keys for evidence collection and package generation.
- Add backup and restore tests for the evidence ledger.
- Add metrics for collection latency, missing evidence, stale evidence, and framework readiness.
- Add alerts for overdue exceptions and controls moving to `FAIL`.

## Product Extensions

- Build an auditor-facing package review portal.
- Add control-owner dashboards by team.
- Add Jira/Linear ticket sync for exceptions.
- Add Slack/email notifications for upcoming evidence expiry.
- Add audit period filters and sample windows.
- Add evidence source health monitoring.
- Add policy-as-code checks before controls are changed.
- Add drilldown from audit package to raw source systems.

## Testing Gaps

- Add HTTP endpoint tests for all routes.
- Add concurrency tests for repeated package generation.
- Add property tests for package checksum stability.
- Add migration tests for evolving control and evidence schemas.
- Add large evidence volume tests.
- Add scheduler tests for recurring collection windows.
