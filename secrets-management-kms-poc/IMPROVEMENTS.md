# Improvements

## Cryptography

- Replace the educational encryption helper with a vetted AEAD implementation.
- Integrate with HSM-backed or cloud-managed KMS providers.
- Add key aliases and key usage constraints.
- Add automatic data-key cache expiry.
- Add envelope metadata authentication for tenant, region, and purpose.

## Access Control

- Add workload identity validation through mTLS or JWTs.
- Add policy conditions for environment, region, and deployment stage.
- Add approval workflow for policy changes.
- Add separation of duties between secret writers and policy admins.
- Add read quotas and anomaly detection per identity.

## Secret Lifecycle

- Add rotation schedules and stale-secret reports.
- Add secret deletion with recovery windows.
- Add dual-write rotation flows for database credentials.
- Add dynamic secret generation for databases and cloud accounts.
- Add dependency tracking for consumers of each secret version.

## Lease Management

- Add a background lease expiry worker.
- Add lease renewal with policy revalidation.
- Add explicit lease revocation by identity or incident.
- Add active lease notifications during secret revocation.
- Add lease tokens that callers must present on use.

## Break-Glass

- Add multi-approver break-glass workflows.
- Add incident ID linkage for emergency access.
- Add tighter expiration and one-click revocation.
- Add post-use review requirements.
- Add notifications to service owners and security teams.

## Operations

- Export metrics for reads, denials, rotations, and break-glass access.
- Add audit log streaming to immutable storage.
- Add multi-region key replication.
- Add disaster recovery restore flows.
- Add consistency checks for key heads, secret versions, and policies.
