# Compliance Evidence Automation POC

Python proof-of-concept for compliance evidence automation: control registry, evidence collection, freshness checks, control assessments, exception tracking, audit package generation, evidence checksums, readiness dashboard, and audit history.

## Goal

Show how governance teams prove that privacy, security, retention, access, and incident controls are operating. Recent POCs enforce controls; this POC collects evidence that those controls worked and packages it for audit review.

## What It Covers

- Control registry across frameworks:
  - `SOC2`
  - `GDPR`
  - `HIPAA`
- Control categories such as privacy, retention, access, security, and incident response
- Required evidence sources per control
- Scheduled evidence collection simulation
- Evidence freshness and expiry windows
- SHA-256 checksum for every evidence payload
- Control assessment statuses:
  - `PASS`
  - `WARN`
  - `FAIL`
  - `MISSING`
- Exception tracking with owner, due date, remediation status, and notes
- Audit package generation by framework
- Package checksum over controls, evidence, and exceptions
- Audit log for control changes, collection, assessment, exceptions, and package generation
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd compliance-evidence-automation-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8173
```

Open:

```text
http://127.0.0.1:8173
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Seed GDPR and SOC2 controls.
2. Collect evidence for consent, retention, DSAR, and access-review controls.
3. Leave incident-review evidence incomplete and track an open exception.
4. Assess all controls and inspect `PASS`, `WARN`, and `MISSING` states.
5. Generate a GDPR audit package with evidence and checksums.
6. Inspect `/snapshot`, `/controls`, `/evidence`, `/exceptions`, `/packages`, and `/audit`.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /controls`
- `GET /evidence`
- `GET /exceptions`
- `GET /packages`
- `GET /audit`
- `POST /controls`
- `POST /evidence/collect`
- `POST /assess`
- `POST /exceptions`
- `POST /packages`

Example control:

```json
{
  "control_id": "gdpr.consent-decisions",
  "framework": "GDPR",
  "category": "privacy",
  "title": "Consent decisions are recorded with purpose and reason.",
  "owner": "privacy-platform",
  "evidence_ttl_days": 7,
  "required_sources": ["consent_log", "decision_log"]
}
```

Collect evidence:

```json
{
  "control_id": "gdpr.consent-decisions"
}
```

Create an exception:

```json
{
  "exception_id": "ex-consent-sampling",
  "control_id": "gdpr.consent-decisions",
  "owner": "privacy-platform",
  "status": "OPEN",
  "notes": "Need larger sample size."
}
```

Generate an audit package:

```json
{
  "framework": "GDPR"
}
```

## Configuration

- `--db-path` defaults to `runtime/compliance.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8173`

## Notes and Limitations

- This POC models evidence automation, not legal advice or a full GRC platform.
- Evidence sources are simulated in process.
- Checksums prove payload integrity inside the POC, not tamper-proof storage.
- Package generation stores JSON payloads in SQLite for easy inspection.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
