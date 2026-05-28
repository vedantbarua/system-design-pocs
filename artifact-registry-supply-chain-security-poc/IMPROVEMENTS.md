# Improvements

## Registry

- Store artifact blobs in an OCI-compatible layout.
- Add repository namespaces and retention policies.
- Add immutable tag aliases and digest pinning.
- Add garbage collection for unreferenced blobs.
- Add multi-region registry replication.

## Provenance

- Add SLSA attestation format support.
- Verify builder identity and workflow claims.
- Add source repository branch protection checks.
- Add material digest verification.
- Add provenance transparency log integration.

## Signing

- Replace simulated signatures with public-key signing.
- Add keyless signing through workload identity.
- Add signature transparency and inclusion proofs.
- Add signer trust policies by environment.
- Add signature expiration and revocation handling.

## SBOM And Scanning

- Validate SPDX and CycloneDX schemas.
- Add package license policy gates.
- Add vulnerability database freshness checks.
- Add exception workflows for accepted vulnerabilities.
- Add dependency diffing between artifact versions.

## Admission Control

- Add policy-as-code integration.
- Add Kubernetes admission webhook simulation.
- Add deployment manifests and image digest validation.
- Add progressive delivery gates.
- Add per-team environment policies.

## Operations

- Export metrics for publish, sign, scan, promote, and reject events.
- Add audit log streaming to immutable storage.
- Add search by digest, package, CVE, signer, and commit.
- Add dashboard views for release readiness.
- Add incident links for emergency deploy overrides.
