# Artifact Registry Supply Chain Security POC

Python proof-of-concept for software supply-chain trust: immutable artifacts, build provenance, SBOM metadata, signing, vulnerability scans, environment promotion, deployment admission gates, and audit logging.

## Goal

Show how CI/CD platforms prove what was built, who built it, what dependencies it used, whether it was signed and scanned, and whether it is allowed to deploy.

## What It Covers

- Artifact registry with immutable `name:version` records
- Content-addressed digests using `sha256`
- Build provenance records:
  - builder
  - source repository
  - commit SHA
  - workflow ID
  - materials
- SBOM metadata with dependency lists
- Simulated artifact signing and signature verification
- Vulnerability scan results with critical, high, and medium counts
- Environment promotion flow:
  - `dev`
  - `staging`
  - `prod`
- Deployment admission policies per environment
- Policy gates such as signed artifact, provenance, SBOM, passing scan, and promotion prerequisites
- Admission decision history
- Audit log for publish, sign, scan, promote, reject, and deploy checks
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd artifact-registry-supply-chain-security-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8168
```

Open:

```text
http://127.0.0.1:8168
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Publish an artifact with provenance and SBOM metadata.
2. Sign the artifact and verify the signature.
3. Record a vulnerability scan.
4. Promote the artifact to `dev`.
5. Try deploying to `staging` before `dev` promotion and observe rejection.
6. Promote to `staging`, then check `prod` admission.
7. Publish an unsigned artifact and observe admission rejection.
8. Inspect `/audit`, `/decisions`, or `/snapshot` for policy history.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /artifacts`
- `GET /policies`
- `GET /decisions`
- `GET /audit`
- `POST /artifacts`
- `POST /signatures`
- `POST /scans`
- `POST /admission/check`
- `POST /policies`
- `POST /artifacts/{digest}/promote/{environment}`

Example artifact publish:

```json
{
  "name": "checkout-api",
  "version": "1.1.0",
  "artifact_type": "container",
  "content": "checkout-api-image-v1.1",
  "created_by": "ci:checkout-main",
  "provenance": {
    "builder": "github-actions",
    "source_repo": "github.com/acme/checkout-api",
    "commit_sha": "def5678",
    "workflow_id": "build-1002",
    "materials": [
      {
        "name": "base-image",
        "digest": "sha256:base"
      }
    ]
  },
  "sbom": {
    "format": "spdx-json",
    "dependencies": [
      {
        "name": "fastapi",
        "version": "0.115.0"
      }
    ]
  }
}
```

Example signature:

```json
{
  "digest": "sha256:...",
  "signer": "ci:checkout-main"
}
```

Example scan:

```json
{
  "digest": "sha256:...",
  "scanner": "trivy",
  "status": "PASS",
  "critical_count": 0,
  "high_count": 0,
  "medium_count": 2,
  "findings": []
}
```

Example admission check:

```json
{
  "digest": "sha256:...",
  "environment": "prod",
  "requested_by": "deploy-bot"
}
```

## Configuration

- `--db-path` defaults to `runtime/artifact_registry.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8168`

## Notes and Limitations

- Signing is simulated with deterministic HMAC-style signatures, not real public-key cryptography.
- Artifact content is stored only as a digest, not as a binary blob.
- Admission policies are intentionally compact and environment-scoped.
- Promotion checks are synchronous and local.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `hashlib`
- `hmac`
- `unittest`
