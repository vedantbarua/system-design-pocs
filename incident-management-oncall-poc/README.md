# Incident Management On-Call POC

Python proof-of-concept for the human operations layer behind production systems: alert intake, deduplication, incident creation, on-call escalation, lifecycle tracking, SLO breach visibility, timelines, and postmortem action items.

## Goal

Show how noisy machine signals become coordinated human response through ownership, escalation, incident state, and follow-up work.

## What It Covers

- Service ownership and escalation policies
- On-call levels with primary, secondary, and director-style responders
- Alert ingestion from services
- Alert fingerprinting and deduplication
- Incident creation from alert fingerprints
- Severity levels:
  - `SEV1`
  - `SEV2`
  - `SEV3`
  - `SEV4`
- Incident lifecycle:
  - `OPEN`
  - `ACKNOWLEDGED`
  - `MITIGATED`
  - `RESOLVED`
- Escalation checks for unacknowledged incidents
- SLO breach tracking through per-service response windows
- Timeline events and operator notes
- Postmortem action items
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd incident-management-oncall-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8166
```

Open:

```text
http://127.0.0.1:8166
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Ingest a `SEV1` alert for `payments-api` and observe incident creation.
2. Send the same alert again and observe fingerprint deduplication.
3. Acknowledge the incident and stop escalation.
4. Mitigate the incident after a rollback or workaround.
5. Resolve the incident and mark linked alerts resolved.
6. Create a postmortem action item.
7. Complete the action item.
8. Inspect `/snapshot` to see incidents, alerts, services, escalation policies, timelines, and SLO breach state.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /services`
- `GET /alerts`
- `GET /incidents`
- `GET /escalation-policies`
- `POST /alerts`
- `POST /services`
- `POST /escalation-policies`
- `POST /escalations/check`
- `POST /incidents/{incident_id}/ack`
- `POST /incidents/{incident_id}/mitigate`
- `POST /incidents/{incident_id}/resolve`
- `POST /incidents/{incident_id}/notes`
- `POST /incidents/{incident_id}/action-items`
- `POST /action-items/{action_id}/complete`

Example alert:

```json
{
  "service_name": "payments-api",
  "severity": "SEV1",
  "summary": "Payment authorization failures above threshold",
  "alert_key": "payment-auth-failures",
  "labels": {
    "region": "us-east-1",
    "runbook": "payments-auth"
  }
}
```

Example acknowledgement:

```json
{
  "actor": "alice@company.test",
  "note": "Investigating failed authorizations."
}
```

Example postmortem action item:

```json
{
  "description": "Add config validation for gateway rollout.",
  "owner": "payments-platform"
}
```

## Configuration

- `--db-path` defaults to `runtime/incidents.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8166`

## Notes and Limitations

- This models PagerDuty-style behavior in one local process.
- There is no real SMS, phone, email, Slack, or calendar integration.
- Alert fingerprints are deterministic hashes from service, alert key, and labels unless explicitly provided.
- Escalation checks run only when `/escalations/check` is called.
- SLO breach status is computed from incident age and service response window.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
