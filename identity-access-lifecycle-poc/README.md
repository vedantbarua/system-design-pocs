# Identity and Access Lifecycle POC

A full-stack identity control plane that makes provisioning, access grants, session revocation, governance reviews, and asynchronous propagation visible in one runnable demo.

## Goal

Show how an organization can turn directory events into controlled identity state while keeping high-risk access time-bound, reviewable, and auditable. The POC focuses on lifecycle correctness rather than implementing an OAuth or SCIM protocol server.

## What It Covers

- Idempotent SCIM-style user and membership events
- User activation, suspension, reactivation, and deprovisioning
- Group membership and effective entitlement records
- Standing and time-limited just-in-time access
- OIDC-style session issuance, expiry, and asynchronous revocation
- Privileged-access review campaigns with certification or revocation
- Retryable worker jobs and simulated downstream failures
- PostgreSQL state and event persistence, Redis projection caching, and Kafka event transport
- Immutable-style audit history for administrative and worker actions
- In-memory fallbacks for a zero-infrastructure demo

## Quick Start

Run the backend:

```bash
cd identity-access-lifecycle-poc/backend
npm install
npm test
npm run dev
```

Run the frontend in another terminal:

```bash
cd identity-access-lifecycle-poc/frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5192`. The API listens on `http://127.0.0.1:8192`.

The application works entirely in memory by default. To run the supporting infrastructure:

```bash
cd identity-access-lifecycle-poc
docker compose up -d
```

Then start the backend with:

```bash
IDENTITY_DATABASE_URL=postgres://identity:identity@127.0.0.1:5443/identity_lifecycle \
IDENTITY_REDIS_URL=redis://127.0.0.1:6390 \
IDENTITY_KAFKA_BROKERS=127.0.0.1:9100 \
npm --prefix backend run dev
```

## Demo Flows

### 1. Provision and disable an identity

1. Open **Directory**.
2. Provision a user through the Workday/SCIM form.
3. Suspend an active user and observe their session enter `REVOCATION_PENDING`.
4. Open **Operations** and drain jobs.
5. Confirm that the session becomes `REVOKED`.

### 2. Grant and revoke temporary access

1. Open **Access** and select an active user.
2. Create a one-to-24-hour JIT grant with a business reason.
3. Revoke the grant.
4. Drain the worker queue to propagate the revocation.

### 3. Run a privileged-access review

1. Open **Reviews**.
2. Certify one high-risk grant and revoke another.
3. Drain the resulting revocation job.
4. Complete the campaign after all decisions are recorded.

### 4. Exercise retry behavior

1. Open **Operations**.
2. Queue an expiry scan or directory sync.
3. Select **Fail next**, then **Drain jobs**.
4. The first attempt enters `RETRY`; the next attempt completes.

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Adapter modes and buffered-event count |
| `GET` | `/api/snapshot` | Dashboard read model |
| `POST` | `/api/scim/events` | Publish and immediately apply an idempotent directory event |
| `POST` | `/api/scim/publish` | Buffer an event without applying it |
| `POST` | `/api/scim/drain` | Consume buffered in-memory events |
| `POST` | `/api/users/:id/suspend` | Suspend an identity and request session revocation |
| `POST` | `/api/users/:id/reactivate` | Reactivate a suspended identity |
| `POST` | `/api/users/:id/deprovision` | Disable an identity, remove memberships, and revoke access |
| `POST` | `/api/users/:id/sessions` | Issue a simulated OIDC session |
| `POST` | `/api/grants/jit` | Create time-limited access |
| `POST` | `/api/grants/:id/revoke` | Request asynchronous grant revocation |
| `POST` | `/api/reviews` | Create an access-review campaign |
| `POST` | `/api/review-items/:id/decide` | Certify or revoke a reviewed grant |
| `POST` | `/api/reviews/:id/complete` | Close a fully decided campaign |
| `POST` | `/api/jobs` | Queue lifecycle background work |
| `POST` | `/api/jobs/fail-next` | Simulate the next downstream timeout |
| `POST` | `/api/jobs/drain` | Process queued and retryable jobs |
| `POST` | `/api/reset` | Restore seeded demo state |

Example directory event:

```json
{
  "eventId": "workday-4097",
  "source": "workday",
  "operation": "UPSERT_USER",
  "externalId": "employee-4097",
  "email": "jordan@northstar.example",
  "name": "Jordan Lee",
  "department": "Security"
}
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8192` | Backend port |
| `HOST` | `127.0.0.1` | Backend bind address |
| `IDENTITY_DATABASE_URL` | `memory://` | PostgreSQL connection string |
| `IDENTITY_REDIS_URL` | `memory://` | Redis connection string |
| `IDENTITY_KAFKA_BROKERS` | `memory://` | Comma-separated Kafka brokers |
| `IDENTITY_EVENT_TOPIC` | `identity.directory.events` | Directory event topic |

## Notes and Limitations

- OIDC sessions and SCIM operations are domain simulations, not protocol-compliant endpoints.
- The POC stores one aggregate snapshot for clarity; production systems should normalize authoritative records and build projections independently.
- Authorization decisions are represented as grants rather than evaluated by a policy engine.
- Worker draining is manually triggered to make propagation and retry behavior observable.
- No real email, identity provider, HRIS, or cloud-resource integration is invoked.

## Technologies Used

- React 19, TypeScript, Vite, and Lucide icons
- Node.js, Express, and TypeScript
- Kafka-compatible Redpanda
- PostgreSQL
- Redis
- Node's built-in test runner

See [TECHNICAL_README.md](TECHNICAL_README.md) for the architecture and [IMPROVEMENTS.md](IMPROVEMENTS.md) for the production path.
