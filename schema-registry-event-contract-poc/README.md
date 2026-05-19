# Schema Registry Event Contract POC

Python proof-of-concept for event schema governance: schema versioning, compatibility checks, producer event validation, consumer support tracking, and rollout readiness.

## Goal

Show how event-driven systems prevent unsafe producer changes from breaking downstream consumers.

## What It Covers

- Event schema subjects such as `OrderCreated` and `PaymentCaptured`
- Versioned schemas with required and optional fields
- Compatibility modes:
  - `BACKWARD`
  - `FORWARD`
  - `FULL`
  - `NONE`
- Compatibility checks before registering a new version
- Event validation against a specific schema version
- Consumer registration with supported version ranges
- Rollout readiness for a target schema version
- SQLite-backed registry state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd schema-registry-event-contract-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8162
```

Open:

```text
http://127.0.0.1:8162
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Register a schema with required fields.
2. Add an optional field and observe compatibility pass.
3. Try adding a required field and observe compatibility fail.
4. Try changing a field type and observe compatibility fail.
5. Validate a producer event against a schema version.
6. Register a consumer that only supports v1 and observe rollout to v2 blocked.
7. Update the consumer to support v2 and observe rollout readiness pass.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /schemas/{name}`
- `POST /schemas`
- `POST /schemas/{name}/versions`
- `POST /schemas/{name}/compatibility-check`
- `POST /events/validate`
- `POST /consumers`

Example schema registration:

```json
{
  "name": "UserProfileUpdated",
  "compatibility_mode": "BACKWARD",
  "description": "Profile updates emitted by identity service.",
  "schema": {
    "fields": [
      { "name": "user_id", "type": "string", "required": true },
      { "name": "email", "type": "string", "required": false }
    ]
  }
}
```

Example compatibility check:

```json
{
  "schema": {
    "fields": [
      { "name": "user_id", "type": "string", "required": true },
      { "name": "email", "type": "string", "required": false },
      { "name": "display_name", "type": "string", "required": false }
    ]
  }
}
```

Example event validation:

```json
{
  "subject_name": "OrderCreated",
  "version": 2,
  "event": {
    "order_id": "order-1",
    "customer_id": "customer-1",
    "total": 42.5,
    "coupon_code": "WELCOME"
  }
}
```

## Configuration

- `--db-path` defaults to `runtime/schema_registry.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8162`

## Notes and Limitations

- Uses a simplified JSON Schema-style field model, not the full JSON Schema specification.
- Compatibility checks focus on required fields, optional fields, removals, and type changes.
- Registry state is local SQLite.
- The HTTP server is standard-library only.
- There is no authentication, schema ownership workflow, or producer identity.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
