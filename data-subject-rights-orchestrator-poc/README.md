# Data Subject Rights Orchestrator POC

Python proof-of-concept for DSAR orchestration: request intake, downstream service inventory, per-service task fanout, retries, blockers, export bundle assembly, deletion receipts, SLA tracking, and audit history.

## Goal

Show how privacy requests are coordinated across many product and data systems. Consent decides whether data can be used, retention decides how long it can exist, and this orchestrator coordinates user rights requests across service boundaries.

## What It Covers

- DSAR request intake for:
  - `EXPORT`
  - `DELETE`
  - `CORRECT`
  - `RESTRICT_PROCESSING`
- Downstream service inventory with owner team, data scope, supported request types, timeout, legal hold, and simulated failure behavior
- Per-service task fanout
- Task states:
  - `PENDING`
  - `IN_PROGRESS`
  - `COMPLETED`
  - `FAILED`
  - `BLOCKED`
- Request rollup states:
  - `REQUESTED`
  - `IN_PROGRESS`
  - `COMPLETED`
  - `FAILED`
  - `BLOCKED`
- Retry simulation for flaky downstream services
- Timeout handling for overdue service tasks
- Legal hold blocker for deletion tasks
- Export bundle assembly from completed service responses
- Deletion receipt tracking
- Request SLA status and due dates
- Audit log for request, fanout, task transition, bundle, and receipt actions
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd data-subject-rights-orchestrator-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8172
```

Open:

```text
http://127.0.0.1:8172
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Seed profile, billing, and analytics downstream services.
2. Create an export request and fan it out to all supporting services.
3. Run tasks and observe analytics fail twice before succeeding.
4. Assemble an export bundle after all service tasks complete.
5. Create a delete request and observe billing block deletion because of legal hold.
6. Read deletion receipts from services that completed their delete task.
7. Inspect `/snapshot`, `/requests`, `/tasks`, `/services`, and `/audit`.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /services`
- `GET /requests`
- `GET /tasks`
- `GET /audit`
- `GET /requests/{request_id}/export-bundle`
- `GET /requests/{request_id}/deletion-receipts`
- `POST /services`
- `POST /requests`
- `POST /tasks/run`
- `POST /tasks/{task_id}/process`

Example service:

```json
{
  "service_id": "profile-service",
  "owner_team": "identity",
  "supports": ["EXPORT", "DELETE", "CORRECT", "RESTRICT_PROCESSING"],
  "data_scope": "profile, email, preferences"
}
```

Example export request:

```json
{
  "subject_id": "user-eu-1",
  "request_type": "EXPORT",
  "payload": {
    "format": "json"
  },
  "notes": "Requested from account settings."
}
```

Example correction request:

```json
{
  "subject_id": "user-eu-1",
  "request_type": "CORRECT",
  "payload": {
    "email": "new@example.eu"
  }
}
```

Run task workers:

```json
{}
```

## Configuration

- `--db-path` defaults to `runtime/dsar.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8172`

## Notes and Limitations

- This POC models orchestration, not legal advice or a complete privacy program.
- Downstream service behavior is simulated in process.
- Legal hold blocking is represented on the service record for clarity.
- Export bundles and deletion receipts are assembled from task results, not external files.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
