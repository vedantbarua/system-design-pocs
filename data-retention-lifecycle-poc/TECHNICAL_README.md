# Data Retention Lifecycle Technical README

## Architecture

The POC is a small retention control plane. Services register records with data type, region, purpose, owner, subject, and timestamps. A scheduled scan matches each record to a policy, records a lifecycle decision, and queues jobs for archive, anonymization, or deletion.

```text
Service-owned records
        |
        v
Retention Lifecycle Service
        |
        +-- policy registry
        +-- record registry
        +-- lifecycle decisions
        +-- action jobs
        +-- audit events
```

## Data Model

### Policies

`policies` define how long a category of data may live.

- `data_type`
- `region`
- `purpose`
- `retention_days`
- `archive_after_days`
- `terminal_action`

Region can be an exact value such as `EU` or the global fallback `*`. Terminal actions are `DELETE` or `ANONYMIZE`.

### Records

`records` represent service-owned data. Each record has lifecycle state, owner service, subject identifier, creation/access timestamps, legal hold fields, and metadata.

### Lifecycle Decisions

`lifecycle_decisions` is the explainability layer. Every scan writes the selected action, policy, record age, reason, and queued job id if one was created.

### Jobs

`jobs` represent work that would normally be performed by background workers or downstream service integrations. This POC supports:

- `ARCHIVE`
- `ANONYMIZE`
- `DELETE`

Jobs start as `QUEUED` and become `COMPLETED`.

### Audit Events

`audit_events` tracks policy writes, record writes, legal holds, scans, job enqueue, and job completion.

## Policy Matching

The matcher requires exact `data_type` and `purpose`. Region-specific policy wins over a global `*` policy.

```text
record(data_type=profile, purpose=marketing, region=EU)
  -> policy(data_type=profile, purpose=marketing, region=EU)

record(data_type=billing, purpose=finance, region=US)
  -> policy(data_type=billing, purpose=finance, region=*)
```

If no policy matches, the record is retained and the decision explains that no policy was found.

## Scan Algorithm

For each non-deleted record:

1. Match a policy.
2. If no policy matches, record `RETAIN`.
3. If legal hold is active, record blocked `LEGAL_HOLD`.
4. If record is already pending deletion or anonymized, record `RETAIN`.
5. If record age is at or beyond `retention_days`, queue the terminal action.
6. If record is active and age is at or beyond `archive_after_days`, queue `ARCHIVE`.
7. Otherwise record `RETAIN`.

This order makes legal hold override all destructive actions.

## Job Semantics

Archive jobs move records to `ARCHIVED`.

Anonymize jobs move records to `ANONYMIZED`, replace the subject with `anon`, and replace metadata with an anonymization marker.

Delete jobs move records to `DELETED` and replace metadata with a deletion marker. The row remains so the POC can display audit and state transitions.

## API Shape

Read endpoints:

- `/snapshot`
- `/policies`
- `/records`
- `/jobs`
- `/decisions`
- `/audit`

Write endpoints:

- `POST /policies`
- `POST /records`
- `POST /scan`
- `POST /jobs/run`
- `POST /jobs/{job_id}/complete`
- `POST /records/{record_id}/legal-hold`
- `POST /records/{record_id}/release-hold`

## Failure Modes

- Missing policies cause indefinite retention unless there is a separate safety default.
- Incorrect region or purpose metadata can match the wrong policy.
- Legal holds can block deletion indefinitely if not reviewed.
- Downstream systems may fail to execute queued actions.
- Re-running scans can create repeated retain decisions, so production systems need compaction or retention for decision history.

## Production Extensions

- Distributed job workers with retries and idempotency keys
- Policy-as-code review and deployment workflow
- Service callbacks for downstream deletion verification
- Record inventory ingestion from data catalogs and object stores
- Legal hold expiration and review workflow
- Retention policy simulator for proposed changes
- Tamper-evident audit log storage
- Metrics for overdue jobs, blocked deletions, and policy coverage
- Backfill jobs for newly introduced policies
- Signed deletion receipts from owning services
