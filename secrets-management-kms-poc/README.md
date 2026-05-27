# Secrets Management KMS POC

Python proof-of-concept for secrets and key management: envelope encryption, secret versioning, key rotation, access policies, short-lived leases, revocation, break-glass access, and audit logging.

## Goal

Show how platforms protect credentials, rotate keys safely, audit access, and issue short-lived secret reads to service identities.

## What It Covers

- Master keys with active versions
- Secret storage with immutable versions
- Envelope encryption:
  - per-secret-version data keys
  - master-key-encrypted data keys
  - data-key-encrypted secret values
- Master key rotation and data-key rewrapping
- Access policies by service identity
- Per-policy maximum lease duration
- Lease-based secret reads with expiration
- Secret revocation and lease invalidation
- Break-glass access request and approval workflow
- Audit log for key, policy, read, write, revoke, and break-glass actions
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd secrets-management-kms-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8167
```

Open:

```text
http://127.0.0.1:8167
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Read `payments/stripe-api-key` as `service:payments-api` and receive a short-lived lease.
2. Try reading the same secret as `service:analytics` and observe policy denial.
3. Write a new secret version as `service:secrets-admin`.
4. Rotate the master key and observe existing data keys rewrapped.
5. Request break-glass access for an unauthorized service.
6. Approve the break-glass request and perform a one-time emergency read.
7. Revoke the secret and observe leases invalidated.
8. Inspect `/audit` or `/snapshot` for access history.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /keys`
- `GET /secrets`
- `GET /policies`
- `GET /leases`
- `GET /break-glass`
- `GET /audit`
- `POST /keys`
- `POST /keys/{key_id}/rotate`
- `POST /secrets`
- `POST /secrets/read`
- `POST /secrets/{secret_name}/revoke`
- `POST /policies`
- `POST /break-glass`
- `POST /break-glass/{request_id}/approve`

Example secret write:

```json
{
  "secret_name": "payments/stripe-api-key",
  "owner_team": "payments",
  "key_id": "platform-prod",
  "value": "sk_live_example",
  "created_by": "service:secrets-admin",
  "metadata": {
    "env": "prod",
    "rotation": "30d"
  }
}
```

Example read:

```json
{
  "identity": "service:payments-api",
  "secret_name": "payments/stripe-api-key",
  "lease_seconds": 120
}
```

Example access policy:

```json
{
  "policy_id": "payments-read-stripe",
  "secret_name": "payments/stripe-api-key",
  "identities": ["service:payments-api"],
  "actions": ["read"],
  "max_lease_seconds": 300
}
```

Example break-glass request:

```json
{
  "identity": "service:analytics",
  "secret_name": "payments/stripe-api-key",
  "reason": "Emergency payment reconciliation."
}
```

## Configuration

- `--db-path` defaults to `runtime/secrets.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8167`

## Notes and Limitations

- Encryption is a local educational simulation using standard-library primitives, not production cryptography.
- Master key material is stored in SQLite for inspectability; production systems use HSMs or managed KMS.
- Secret values are redacted by the HTTP read endpoint unless `reveal` is explicitly true.
- Break-glass approvals are one-time use.
- Lease expiration is recorded and surfaced but not backed by a background revocation worker.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `hashlib`
- `hmac`
- `unittest`
