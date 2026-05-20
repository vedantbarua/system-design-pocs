# Policy-as-Code Authorization POC

Python proof-of-concept for a centralized authorization decision service with policy versioning, RBAC, ABAC conditions, deny precedence, dry-run policies, and audit history.

## Goal

Show how services can delegate authorization checks to a shared policy engine instead of hardcoding permissions in every API.

## What It Covers

- Principals with roles and attributes
- Resources with types, owners, and attributes
- Versioned policies with allow or deny effects
- RBAC matching through `principal_roles`
- ABAC matching through policy conditions
- Deny precedence over allow matches
- Default deny when no allow policy matches
- Dry-run policies for rollout impact analysis
- Decision audit history with matched policies and reasons
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd policy-as-code-authorization-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8163
```

Open:

```text
http://127.0.0.1:8163
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Authorize `user:alice` to read `order:1001` and observe an allow decision.
2. Try an unsupported action such as `orders:delete` and observe default deny.
3. Create a cross-region order and observe deny precedence.
4. Authorize `service:billing-api` to read `payment:9001` through a service role.
5. Inspect dry-run policy matches without changing the final decision.
6. Add a new policy with the same `policy_id` and observe version advancement.
7. Review `/decisions` or `/snapshot` to see the audit trail.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /policies`
- `GET /principals`
- `GET /resources`
- `GET /decisions`
- `POST /authorize`
- `POST /policies`
- `POST /principals`
- `POST /resources`

Example authorization request:

```json
{
  "principal": "user:alice",
  "action": "orders:read",
  "resource": "order:1001"
}
```

Example policy:

```json
{
  "policy_id": "allow-owners-read-documents",
  "description": "Employees can read documents they own.",
  "effect": "allow",
  "priority": 250,
  "actions": ["documents:read"],
  "principal_roles": ["employee"],
  "resource_types": ["document"],
  "conditions": [
    {
      "left": "principal.principal_id",
      "operator": "eq",
      "right_ref": "resource.owner_id"
    }
  ]
}
```

Example dry-run policy:

```json
{
  "policy_id": "dry-run-support-payment-read",
  "effect": "allow",
  "priority": 150,
  "actions": ["payments:read"],
  "principal_roles": ["support_agent"],
  "resource_types": ["payment"],
  "conditions": [
    {
      "left": "principal.attributes.region",
      "operator": "eq",
      "right_ref": "resource.attributes.region"
    }
  ],
  "dry_run": true
}
```

## Configuration

- `--db-path` defaults to `runtime/authorization.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8163`

## Notes and Limitations

- The policy language is intentionally small and JSON-based.
- Conditions support `eq`, `neq`, `in`, `contains`, `exists`, and `prefix`.
- Policies are evaluated from active policy heads only.
- Deny matches take precedence over allow matches.
- Dry-run policies are reported but excluded from the final decision.
- The HTTP server is standard-library only so the POC runs without installed dependencies.
- There is no real JWT validation, distributed cache, policy signing, or external identity provider.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
