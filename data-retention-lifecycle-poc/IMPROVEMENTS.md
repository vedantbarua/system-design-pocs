# Data Retention Lifecycle Improvements

## Next Engineering Steps

- Add idempotency keys to scans, job enqueue, and job completion.
- Add policy versioning so decisions can point to the exact policy revision used.
- Add dry-run mode for policy rollout and impact estimation.
- Add policy coverage reports for records without a matching policy.
- Add owner-service callbacks for deletion, anonymization, and archive verification.
- Add legal hold expiration, review cadence, and owner assignment.
- Add batch scan cursors for large record inventories.
- Add job retry count, backoff, and dead-letter handling.

## Production Hardening

- Move from in-process scans to scheduled distributed workers.
- Store lifecycle decisions and audit events in tamper-evident storage.
- Require service identity authentication and scoped write permissions.
- Add optimistic concurrency checks for record state transitions.
- Add metrics for queued jobs, failed jobs, blocked deletions, and overdue holds.
- Add alerts when records remain past retention without legal hold.
- Add backup and restore tests for the policy registry and audit trail.
- Add migration tests for evolving policy and record schemas.

## Product Extensions

- Build an operator dashboard for expiring records and blocked deletions.
- Add policy simulation before changing retention windows.
- Add dataset and table-level retention from a data catalog.
- Add object storage lifecycle integration.
- Add exportable deletion receipts for compliance evidence.
- Add DSAR integration so deletion requests can enqueue lifecycle jobs.
- Add privacy purpose mapping from consent preferences to retention policies.
- Add regional residency checks before archival.

## Testing Gaps

- Add HTTP endpoint tests for all routes.
- Add concurrency tests for repeated scans and job completion races.
- Add property tests for policy matching precedence.
- Add large-record-volume scan tests.
- Add retention boundary tests around day cutoffs.
- Add failure injection tests for downstream job callbacks.
