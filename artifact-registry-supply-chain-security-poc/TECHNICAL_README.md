# Technical README

## Architecture

The POC is a single-process artifact registry and admission-control simulator backed by SQLite.

- `ArtifactRegistry` owns artifacts, provenance, SBOMs, signatures, scans, promotions, policies, decisions, and audits.
- `ApiHandler` exposes a JSON API and dashboard through `http.server`.
- Artifacts are immutable by `name:version`.
- Deploy checks evaluate environment-specific policies and record decisions.

## Data Model

### Artifacts

Artifacts are content-addressed and immutable.

- `name`
- `version`
- `digest`
- `artifact_type`
- `size_bytes`
- `created_by`
- `metadata_json`

The digest is computed from artifact name, version, and content. Publishing the same `name:version` with different content is rejected.

### Provenance

Provenance records describe how an artifact was built.

- `builder`
- `source_repo`
- `commit_sha`
- `workflow_id`
- `build_started_at`
- `build_finished_at`
- `materials_json`

This models SLSA-style build attestations in simplified local form.

### SBOM

SBOM records describe dependencies.

- `format`
- `dependencies_json`

The POC stores dependency metadata so admission policies can require visibility into what shipped.

### Signatures

Signatures bind a signer identity to an artifact digest.

- `digest`
- `signer`
- `signature`
- `verified`

The implementation uses deterministic HMAC-style signatures for local simulation. Production systems should use public-key signing and verification.

### Scans

Scans represent vulnerability assessment results.

- `scanner`
- `status`
- `critical_count`
- `high_count`
- `medium_count`
- `findings_json`

Admission checks use the latest scan for the artifact.

### Promotions

Promotions record environment movement.

- `dev`
- `staging`
- `prod`

Policies can require prior promotion from another environment.

### Admission Policies

Admission policies are environment-scoped.

- `require_signature`
- `require_provenance`
- `require_sbom`
- `require_passing_scan`
- `max_critical`
- `max_high`
- `required_promoted_from`

`prod` defaults to requiring verified signature, provenance, SBOM, passing scan, no critical vulnerabilities, no high vulnerabilities, and prior promotion from `staging`.

## Admission Flow

1. Load the artifact by digest.
2. Load the target environment policy.
3. Verify required signature presence.
4. Verify provenance and SBOM presence.
5. Evaluate the latest scan status and vulnerability counts.
6. Verify promotion prerequisites.
7. Record an admission decision unless the request is a dry run.
8. Write an audit event.

## Promotion Flow

Promotion to `dev` is direct. Promotion to stricter environments runs admission checks as a dry run first. If the dry-run check fails, the promotion is rejected and audited.

This models release pipelines that prevent an artifact from advancing if supply-chain evidence is incomplete.

## Immutability

Artifact versions are immutable. If a caller tries to republish `checkout-api:1.0.0` with different content, the registry rejects the write. This protects consumers from tag replacement and supports repeatable deployment.

## Production Considerations

A production-grade artifact supply-chain platform would add:

- object storage for artifact blobs
- OCI registry compatibility
- public-key signing and transparency logs
- SLSA provenance attestation verification
- SPDX or CycloneDX validation
- vulnerability database synchronization
- policy-as-code integration
- deployment controller admission webhooks
- tamper-evident audit storage
- replication across regions
