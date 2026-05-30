# Privacy Consent Preferences POC

Python proof-of-concept for a privacy consent and preference service: user consent records by purpose, regional privacy defaults, consent versioning, revocation, purpose-based access decisions, processing-event enforcement, DSAR workflows, and audit history.

## Goal

Show how a product platform can centralize privacy preferences and make every downstream processing attempt ask the same question: is this user data allowed to be used for this purpose right now?

## What It Covers

- User registry with region and metadata
- Supported purposes:
  - `marketing`
  - `analytics`
  - `personalization`
  - `ads`
  - `essential`
- Region-aware defaults for stricter privacy regions such as `EU`, `UK`, and `CA`
- Append-only consent history with status, source, policy version, expiration, and notes
- Consent versioning where the latest purpose-specific record wins
- Revocation flow that blocks future processing
- Purpose-based decision endpoint
- Processing-event recording with allow/deny outcome and reason
- DSAR export and delete request workflow
- Delete request completion that revokes non-essential purposes
- Audit log for user writes, consent changes, decisions, processing events, and DSAR actions
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd privacy-consent-preferences-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8170
```

Open:

```text
http://127.0.0.1:8170
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Seed EU and US users with different consent states.
2. Attempt EU marketing processing without explicit consent and observe a denial.
3. Grant marketing consent and observe the decision change to allow.
4. Record processing events with allow/deny reasons.
5. Create a DSAR export request with a due date.
6. Complete a DSAR delete request and observe non-essential consent revocations.
7. Inspect `/snapshot`, `/users`, `/consents`, `/processing-events`, `/dsar`, and `/audit`.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /users`
- `GET /consents`
- `GET /processing-events`
- `GET /dsar`
- `GET /audit`
- `POST /users`
- `POST /consents`
- `POST /consents/revoke`
- `POST /decisions/check`
- `POST /processing-events`
- `POST /dsar`
- `POST /dsar/{request_id}/complete`

Example user:

```json
{
  "user_id": "user-eu-1",
  "email": "ada@example.eu",
  "region": "EU",
  "metadata": {
    "plan": "pro",
    "locale": "en-IE"
  }
}
```

Example consent:

```json
{
  "user_id": "user-eu-1",
  "purpose": "marketing",
  "status": "GRANTED",
  "source": "preference-center",
  "policy_version": "privacy-2026.05"
}
```

Example processing event:

```json
{
  "user_id": "user-eu-1",
  "purpose": "marketing",
  "processor": "campaign-service",
  "resource": "newsletter"
}
```

Example DSAR request:

```json
{
  "user_id": "user-us-1",
  "request_type": "EXPORT",
  "notes": "Requested from account settings."
}
```

## Configuration

- `--db-path` defaults to `runtime/privacy.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8170`

## Notes and Limitations

- This is a consent-decision POC, not legal advice or a full privacy compliance system.
- Regional defaults are deliberately small and easy to inspect.
- DSAR delete completion revokes non-essential purposes but does not physically delete records from SQLite.
- Processing events are recorded after a decision check; external systems would call this service before using user data.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
