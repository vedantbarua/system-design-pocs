# Compliance Evidence Automation Technical README

## Architecture

The POC is a small compliance evidence plane. Controls define what needs to be proven. Evidence collection creates source-specific evidence records. Assessments evaluate freshness and exceptions. Audit packages bundle controls, evidence, exceptions, and checksums by framework.

```text
Control registry
      |
      v
Evidence automation service
      |
      +-- evidence records
      +-- assessments
      +-- exceptions
      +-- audit packages
      +-- audit events
```

## Data Model

### Controls

`controls` stores framework, category, owner, evidence TTL, and required evidence sources. A control can map to GDPR, SOC2, or HIPAA-style frameworks.

### Evidence

`evidence` stores one collected artifact per source. Each row has source type, source reference, collection time, expiry time, JSON payload, and SHA-256 checksum.

### Assessments

`assessments` records point-in-time control status. The status is derived from fresh evidence and exceptions.

### Exceptions

`exceptions` tracks known gaps with owner, due date, status, and notes. Open overdue exceptions fail a control.

### Audit Packages

`audit_packages` stores a framework-scoped package with controls, evidence, exceptions, status, and checksum.

## Assessment Rules

Assessment follows this order:

1. Open overdue exception -> `FAIL`
2. Missing fresh required evidence -> `MISSING`
3. Open non-overdue exception -> `WARN`
4. Evidence expiring within 24 hours -> `WARN`
5. All required evidence fresh -> `PASS`

This order makes known overdue remediation more severe than missing automation data.

## Evidence Freshness

Each control has `evidence_ttl_days`. Evidence is fresh when `expires_at` is later than the assessment timestamp. The latest fresh evidence per required source is used.

Expired evidence remains in the database for audit trail purposes, but it no longer satisfies a control.

## Package Generation

Package generation:

1. Filters controls by framework.
2. Reassesses each control.
3. Collects controls, assessments, evidence, and exceptions.
4. Computes package status from included control statuses.
5. Computes a SHA-256 checksum over the package body.
6. Stores the package in SQLite.

Package status precedence is `FAIL`, then `MISSING`, then `WARN`, then `PASS`.

## API Shape

Read endpoints:

- `/snapshot`
- `/controls`
- `/evidence`
- `/exceptions`
- `/packages`
- `/audit`

Write endpoints:

- `POST /controls`
- `POST /evidence/collect`
- `POST /assess`
- `POST /exceptions`
- `POST /packages`

## Failure Modes

- Missing evidence automation leaves controls in `MISSING`.
- Stale evidence can make controls fail audit readiness even if controls are operating.
- Exceptions can stay open past due and force `FAIL`.
- Evidence checksums only prove payload consistency inside this POC unless stored in tamper-evident storage.
- Framework mapping can be incomplete if controls are not tagged correctly.

## Production Extensions

- Connect collectors to real audit logs, policy engines, CI systems, ticketing systems, and cloud APIs.
- Add scheduler and worker leases for recurring evidence collection.
- Add control versioning and framework crosswalks.
- Store evidence blobs in immutable object storage.
- Anchor checksums in tamper-evident logs.
- Add approval workflow for exceptions and risk acceptance.
- Add auditor-facing package export.
- Add notifications for evidence expiry and overdue exceptions.
- Add role-based access for control owners and auditors.
- Add metrics for audit readiness by framework and category.
