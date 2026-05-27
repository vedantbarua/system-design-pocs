# Technical README

## Architecture

The POC is a single-process secrets management system backed by SQLite.

- `SecretsKMS` owns master keys, secret versions, access policies, leases, break-glass requests, and audit events.
- `ApiHandler` exposes a JSON API and dashboard through `http.server`.
- Secret values are encrypted at write time and decrypted only during authorized reads.
- Audit events are written for all important control-plane and data-plane operations.

## Data Model

### Master Keys

Master keys are versioned.

- `key_id`
- `version`
- `material`
- `status`
- `created_at`

`key_heads` tracks the active version for each key. Rotating a key creates a new version and rewraps encrypted data keys.

### Secrets

Secrets track metadata and the latest version.

- `secret_name`
- `owner_team`
- `key_id`
- `latest_version`
- `status`
- `metadata_json`

Revoked secrets cannot be read, and revocation invalidates existing leases.

### Secret Versions

Secret versions are immutable.

- `secret_name`
- `version`
- `key_id`
- `key_version`
- `encrypted_data_key`
- `ciphertext`
- `created_by`

Each version has a unique data key. The data key is encrypted by the active master key. The secret value is encrypted by the data key.

### Access Policies

Policies grant actions to identities.

- `secret_name`
- `identities_json`
- `actions_json`
- `max_lease_seconds`
- `enabled`

Supported actions:

- `read`
- `write`
- `rotate`
- `admin`

`admin` implies every action for that secret.

### Leases

Leases record short-lived secret reads.

- `lease_id`
- `secret_name`
- `version`
- `identity`
- `expires_at`
- `revoked`

The lease duration is capped by the matching access policy.

### Break-Glass Requests

Break-glass requests provide emergency one-time access.

- `REQUESTED`
- `APPROVED`
- `DENIED`
- `USED`

An approved request must match the secret and identity on the read request, must not be expired, and is marked `USED` after the read.

## Envelope Encryption Flow

Write path:

1. Resolve the active master key version.
2. Generate a random data key.
3. Encrypt the secret value with the data key.
4. Encrypt the data key with the master key.
5. Store ciphertext and encrypted data key as a new immutable version.

Read path:

1. Validate identity and access policy.
2. Resolve the requested or latest secret version.
3. Decrypt the data key with the recorded master key version.
4. Decrypt the secret value with the data key.
5. Create a lease and record an audit event.

## Key Rotation

Rotating a master key creates a new active key version. Existing secret ciphertext remains unchanged. The controller decrypts each stored data key with its old master key version and re-encrypts it with the new master key version.

This models KMS rewrapping: the bulk secret data does not need to be re-encrypted to rotate a master key.

## Access Control

Reads and writes require matching policies. Unauthorized reads are denied and audited. Admin policies are used for revocation and broader maintenance actions.

Break-glass access bypasses normal policy only after explicit approval and only for one read.

## Security Notes

This POC intentionally keeps cryptography inspectable and dependency-free. It uses a keyed stream and HMAC-style authentication built from standard-library primitives. Production systems should use vetted cryptographic libraries, HSMs, managed KMS services, strict key isolation, and hardened audit trails.

## Production Considerations

A production-grade secrets platform would add:

- HSM or cloud KMS integration
- authenticated callers through mTLS or workload identity
- sealed storage and key hierarchy separation
- automatic lease expiry enforcement
- rotation schedules and stale version detection
- policy review and approval workflow
- tamper-evident audit storage
- high availability and multi-region replication
