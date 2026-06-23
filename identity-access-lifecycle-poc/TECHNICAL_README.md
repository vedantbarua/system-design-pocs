# Identity and Access Lifecycle: Technical Design

## Problem Statement

Identity state originates in several systems and changes continuously. An HR system may hire or terminate a person, a directory may change group membership, an administrator may grant temporary production access, and an identity provider may maintain sessions that outlive the change that invalidated them.

The difficult part is not storing users. It is coordinating authoritative identity state, derived access, governance decisions, and revocation across systems that fail independently. This POC makes that coordination explicit.

## Architecture Overview

```text
HRIS / SCIM client
        |
        v
 Directory event API -----> Kafka / in-memory event buffer
        |                              |
        v                              v
 Identity lifecycle core <----- idempotent consumer
        |             |
        |             +----> retryable lifecycle jobs
        v                              |
 PostgreSQL ledger                     v
        |                    sessions / grants / expiry
        v
 Redis read projection -----> React operations dashboard
```

The backend separates deterministic lifecycle behavior in `core.ts` from transport and persistence adapters. PostgreSQL, Redis, and Kafka adapters automatically fall back to memory, which keeps the same API useful both as a lightweight demo and as an infrastructure-backed exercise.

## Core Data Model

- `User`: authoritative identity with external identifier and lifecycle status.
- `Group` and `Membership`: directory-level role assignments.
- `Entitlement`: access to a resource with a risk classification.
- `AccessGrant`: standing, group-derived, manual, or time-limited effective access.
- `Session`: authentication session with active, pending, revoked, or expired state.
- `SyncEvent`: an idempotently processed directory command and its outcome.
- `ReviewCampaign` and `ReviewItem`: governance workflow and per-grant decision.
- `LifecycleJob`: retryable asynchronous propagation work.
- `Audit`: actor, action, timestamp, and structured context.

## Request and Event Flows

### Directory synchronization

1. The API validates the source and event identifier.
2. The event is published to Kafka or the in-memory event buffer.
3. The lifecycle core derives a stable key from `source:eventId`.
4. Previously processed keys return a duplicate result without changing state.
5. The user or membership mutation is applied and audited.
6. The event and aggregate snapshot are persisted.

Malformed domain events are recorded as `REJECTED`; they are not silently discarded.

### Suspension and deprovisioning

1. Suspension changes the authoritative user status immediately.
2. Active sessions move to `REVOCATION_PENDING`.
3. Deprovisioning also removes memberships and marks active grants `PENDING_REVOKE`.
4. A deduplicated propagation job is queued.
5. The worker moves pending sessions and grants to `REVOKED`.

The pending state exposes the interval in which the control plane has accepted a change but downstream enforcement is not yet confirmed.

### Just-in-time access

1. An administrator selects an active user and entitlement.
2. Duration is constrained to one through 24 hours and a reason is required.
3. The grant receives an explicit expiry time.
4. An expiry scan marks elapsed grants and sessions expired.

### Access reviews

1. A campaign snapshots active high-risk grants into review items.
2. A reviewer certifies or revokes each item.
3. Revocation creates the same propagation job used by other lifecycle paths.
4. The campaign cannot complete while a decision is pending.

## Consistency Model

Authoritative status changes are synchronous within the lifecycle aggregate. Enforcement state is eventually consistent because session and grant revocation depend on background propagation. The UI presents these as separate states instead of claiming immediate global revocation.

Event idempotency protects directory mutations from at-least-once delivery. Job deduplication limits repeated downstream work, while repeated revocation itself remains safe.

## Failure Handling

- Duplicate directory events are acknowledged without reapplying changes.
- Invalid events are retained with a rejection reason.
- Downstream timeouts move jobs to `RETRY` and preserve attempt counts.
- Jobs become `DEAD` after their configured maximum attempt count.
- PostgreSQL, Redis, and Kafka connection failures degrade to memory for demo availability.
- Audit entries expose accepted changes, retries, and completed propagation.

## Key Tradeoffs

- A single in-process aggregate keeps state transitions easy to inspect, but it cannot independently scale write domains.
- Snapshot persistence makes restart behavior simple, but normalized tables and an outbox are safer under concurrent writers.
- Group-derived grants are materialized seed records rather than continuously recomputed policy results.
- Manually drained jobs improve demo clarity at the cost of realistic background timing.
- Simulated SCIM and OIDC behavior avoids protocol complexity while retaining the relevant lifecycle semantics.

## Scaling Path

1. Partition directory events by organization and user identifier.
2. Store normalized identities, memberships, grants, sessions, and review records.
3. Use a transactional outbox for state changes and lifecycle commands.
4. Build effective-access projections asynchronously and cache them by tenant and user.
5. Split directory ingestion, entitlement calculation, session control, and governance into independently scalable workers.
6. Apply per-tenant concurrency limits and isolate large reconciliation jobs.
7. Track revocation latency as an SLO from request acceptance to downstream confirmation.
8. Reconcile periodically against identity providers and protected resources to repair drift.

## Security Model

A production service must authenticate administrators, enforce tenant isolation, authorize every lifecycle action, encrypt sensitive attributes, and prevent audit mutation. High-risk grants should require approval separation, phishing-resistant authentication, and provider-confirmed revocation.

The demo intentionally uses seeded administrative authority so its state-machine behavior remains easy to exercise locally.

## What Is Intentionally Simplified

- One seeded organization
- No SCIM schema negotiation, pagination, or bulk protocol
- No real OAuth/OIDC tokens or signing keys
- No policy language or role-to-entitlement computation engine
- No approval chain for JIT access
- No automatic scheduler or dead-letter consumer
- No cross-region replication
- No field-level encryption or external secrets manager
