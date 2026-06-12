# Personal Document Renewal Vault POC

React and FastAPI proof-of-concept for securely storing household documents, scanning new versions, controlling access, and managing expiration and renewal deadlines with PostgreSQL, Redis, and MinIO.

## Goal

Demonstrate the system boundaries behind a practical personal document vault: metadata and audit persistence, private object storage, asynchronous security processing, short-lived grants, household authorization, and deterministic renewal reminders.

## What It Covers

- Passports, licenses, insurance, leases, certificates, and custom documents
- Short-lived upload and download grants
- Immutable object versions and SHA-256 checksums
- MinIO-backed private document objects
- PostgreSQL metadata snapshots
- Redis processing queue mirror and hot snapshot
- Virus-scan and OCR extraction simulation
- Clean, scanning, quarantined, expiring, expired, and renewed states
- Replacement-document renewal chains
- Household owner, editor, and viewer roles
- Audited download and access changes
- Idempotent expiration reminders
- Responsive React operations dashboard

## Quick Start

Install dependencies:

```bash
cd personal-document-renewal-vault-poc/backend
python3 -m pip install -r requirements.txt

cd ../frontend
npm install
```

Start PostgreSQL, Redis, and MinIO:

```bash
docker compose up -d
```

Run FastAPI with infrastructure:

```bash
cd backend
VAULT_DATABASE_URL=postgresql://vault:vault@127.0.0.1:5432/document_vault \
VAULT_REDIS_URL=redis://127.0.0.1:6379/0 \
VAULT_MINIO_ENDPOINT=127.0.0.1:9000 \
uvicorn app:app --host 127.0.0.1 --port 8180
```

Run without infrastructure:

```bash
cd backend
VAULT_DATABASE_URL=memory:// \
VAULT_REDIS_URL=memory:// \
VAULT_MINIO_ENDPOINT=memory:// \
uvicorn app:app --host 127.0.0.1 --port 8180
```

Start React:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5181`.

MinIO Console is available at `http://127.0.0.1:9001` with `minioadmin` / `minioadmin`.

## UI Flows

1. Review expiring and expired household documents.
2. Open a document to inspect metadata, immutable versions, and audit history.
3. Request an audited download grant for a clean version.
4. Add a document or upload a replacement version.
5. Run workers to complete virus scan and OCR jobs.
6. Simulate malware and confirm the version becomes quarantined.
7. Renew an expiring document and inspect the linked replacement.
8. Change a household member between viewer and editor access.
9. Review vault-wide processing and audit history.

## JSON Endpoints

- `GET /api/health`
- `GET /api/snapshot`
- `GET /api/documents/{documentId}`
- `POST /api/uploads/request`
- `PUT /api/uploads/{token}`
- `POST /api/workers/tick`
- `POST /api/workers/drain`
- `POST /api/documents/{documentId}/downloads`
- `GET /api/downloads/{token}`
- `POST /api/documents/{documentId}/renew`
- `POST /api/documents/{documentId}/share`
- `POST /api/reminders/run`
- `POST /api/reset`

Example upload request:

```json
{
  "actor_id": "user-vedant",
  "household_id": "household-maple",
  "title": "Birth Certificate",
  "category": "Identity",
  "filename": "birth-certificate.pdf",
  "content_type": "application/pdf",
  "expires_on": null,
  "issuer": "Cook County"
}
```

## Configuration

- FastAPI defaults to port `8180`
- React defaults to port `5181`
- `VAULT_DATABASE_URL` defaults to `memory://`
- `VAULT_REDIS_URL` defaults to `memory://`
- `VAULT_MINIO_ENDPOINT` defaults to `memory://`
- `VAULT_MINIO_BUCKET` defaults to `personal-documents`
- Upload grants expire after ten minutes
- Download grants expire after five minutes

## Testing

```bash
cd backend
python3 -m unittest discover -s tests

cd ../frontend
npm run build
```

## Notes and Limitations

- OCR and antivirus behavior are deterministic simulations.
- Memory mode stores document bytes in process memory and resets on restart.
- Infrastructure mode mirrors metadata to PostgreSQL, active jobs to Redis, and document bytes to MinIO.
- Authentication is represented by explicit demo actor IDs rather than real sessions.
- Encryption at rest relies on infrastructure configuration and is not implemented in application code.
- The demo clock is fixed at June 12, 2026 for deterministic expiry states.

## Technologies Used

- Python 3
- FastAPI
- Pydantic
- PostgreSQL
- Redis
- MinIO
- React 18
- Vite
- Lucide React
- `unittest`
