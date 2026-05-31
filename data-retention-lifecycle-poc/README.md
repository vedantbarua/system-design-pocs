# Data Retention Lifecycle POC

Python proof-of-concept for automated data retention: policy matching, lifecycle states, scheduled scans, legal hold overrides, archive/anonymize/delete jobs, and audit history.

## Goal

Show how a platform can turn retention rules into concrete lifecycle decisions for records owned by different services. Consent controls whether data can be used; retention controls how long it can exist and what happens when it expires.

## What It Covers

- Retention policies by data type, region, and purpose
- Region-specific policies with global `*` fallback
- Record registry with owner service, subject, creation time, access time, state, and metadata
- Lifecycle states:
  - `ACTIVE`
  - `ARCHIVED`
  - `ANONYMIZED`
  - `DELETION_PENDING`
  - `DELETED`
  - `LEGAL_HOLD`
- Scheduled retention scan simulation
- Policy decisions with action, reason, age, policy, and queued job reference
- Archive, anonymization, and deletion job queue
- Legal hold placement and release
- Audit log for policy writes, record registration, scans, holds, and job completion
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd data-retention-lifecycle-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8171
```

Open:

```text
http://127.0.0.1:8171
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Seed EU marketing, US analytics, and global billing retention policies.
2. Register records at different ages.
3. Place a legal hold on an expired billing record.
4. Run a retention scan and inspect lifecycle decisions.
5. Queue delete, anonymize, or archive jobs from policy decisions.
6. Complete queued jobs and inspect final record states.
7. Review `/snapshot`, `/records`, `/jobs`, `/decisions`, and `/audit`.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /policies`
- `GET /records`
- `GET /jobs`
- `GET /decisions`
- `GET /audit`
- `POST /policies`
- `POST /records`
- `POST /scan`
- `POST /jobs/run`
- `POST /jobs/{job_id}/complete`
- `POST /records/{record_id}/legal-hold`
- `POST /records/{record_id}/release-hold`

Example policy:

```json
{
  "policy_id": "policy.eu.marketing-delete",
  "data_type": "profile",
  "region": "EU",
  "purpose": "marketing",
  "retention_days": 365,
  "archive_after_days": 180,
  "terminal_action": "DELETE",
  "description": "EU marketing profile data expires after one year."
}
```

Example record:

```json
{
  "record_id": "rec-eu-marketing-expired",
  "data_type": "profile",
  "region": "EU",
  "purpose": "marketing",
  "owner_service": "campaign-service",
  "subject_id": "user-eu-1",
  "metadata": {
    "email": "ada@example.eu",
    "segment": "trial"
  }
}
```

Run a scan:

```json
{}
```

Place a legal hold:

```json
{
  "reason": "audit-review"
}
```

## Configuration

- `--db-path` defaults to `runtime/retention.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8171`

## Notes and Limitations

- This POC models retention orchestration, not legal advice.
- Retention policies are intentionally simple: exact data type and purpose, plus exact region or `*`.
- Deletion and anonymization mutate the local SQLite row for visibility; production systems would coordinate downstream stores.
- Jobs are queued and completed in process rather than by external workers.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
