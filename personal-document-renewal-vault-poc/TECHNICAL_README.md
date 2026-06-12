# Personal Document Renewal Vault Technical README

## Problem Statement

Personal documents combine sensitive binary files with searchable metadata, expiration deadlines, access sharing, processing pipelines, and audit requirements. The application must avoid exposing permanent object URLs, prevent unscanned files from being downloaded, preserve version history, and retain evidence of sensitive access.

## Architecture Overview

```text
React vault workspace
        |
        v
FastAPI control plane
        |
        +-- household authorization
        +-- lifecycle and renewal rules
        +-- short-lived grants
        +-- scan/OCR worker simulation
        +-- audit and reminder generation
        |
        +--> PostgreSQL metadata snapshot
        +--> Redis hot snapshot + job mirror
        +--> MinIO private document objects
```

`backend/core.py` contains infrastructure-independent domain behavior. `backend/adapters.py` activates PostgreSQL, Redis, and MinIO only when all three URLs are configured; otherwise the same service runs in memory mode.

## Core Data Model

### Document

- Household and owner identity
- Category, issuer, masked number, issue date, and expiry date
- Reminder lead time
- Current version
- Renewal replacement link

### Document Version

- Immutable version number
- Filename, content type, size, and SHA-256 checksum
- Private object key
- Virus-scan and OCR status
- Extracted metadata and confidence

### Grant

- Random token
- Upload or download operation
- Document, version, object key, and actor
- Expiration and use timestamp

### Processing Job

- Virus scan or OCR extraction
- Version target
- Ready, processing, and completed state
- Attempt count and completion time

### Audit Event

- Actor, action, document, timestamp, and structured details
- Covers grants, uploads, scans, downloads, renewals, and access changes

## Upload and Processing Flow

1. FastAPI authorizes an owner or editor.
2. The service creates a ten-minute upload grant and object key.
3. Upload completion creates an immutable version and SHA-256 digest.
4. The document enters `SCANNING`.
5. Virus-scan and OCR jobs are queued.
6. A clean scan permits OCR and transitions the document to `READY`.
7. An infected result transitions the document to `QUARANTINED`.
8. Every transition appends an audit event.

Infrastructure mode stores the binary in MinIO, persists metadata in PostgreSQL, and mirrors pending jobs in Redis.

## Download Flow

1. FastAPI verifies viewer-or-higher household membership.
2. Quarantined or unscanned versions are rejected.
3. A five-minute download grant is created and audited.
4. Grant use appends a second download audit event.
5. The object is read from MinIO or memory storage.

The client never receives a permanent public object URL.

## Expiration and Renewal

Expiration state is derived from the configured lead window:

- `READY`: outside the renewal window
- `EXPIRING`: inside the renewal window
- `EXPIRED`: expiry date passed

Reminder generation deduplicates pending reminders by document and due date. Renewal preserves the original record as `RENEWED`, creates a replacement document and upload grant, and links both records.

## Authorization Model

- `OWNER`: read, upload, renew, and change household roles
- `EDITOR`: read, upload versions, and renew
- `VIEWER`: read metadata and request clean downloads

The POC models household roles globally. Production systems may need document-level overrides and time-bounded external sharing.

## Key Tradeoffs

- A JSONB snapshot keeps PostgreSQL integration compact but is not a normalized production schema.
- Redis mirrors pending jobs for observability while the POC worker runs in process.
- Application-level grants make authorization visible but production MinIO should issue native presigned URLs.
- OCR and scanning are deterministic simulations rather than external engines.

## Failure Handling

- Missing infrastructure falls back to memory mode.
- Used or expired grants are rejected.
- Empty uploads are rejected.
- Quarantined files cannot be downloaded.
- OCR is skipped when a version is infected.
- Worker drain is bounded by a maximum job count.
- Reminder scans are idempotent.

## Scaling Path

- Normalize document, version, grant, membership, reminder, and audit tables.
- Use native MinIO/S3 presigned multipart uploads.
- Move scan and OCR work to independent Redis Streams or Kafka consumers.
- Add dead-letter queues and retry backoff.
- Store extracted metadata in a searchable index.
- Partition objects and metadata by household.
- Send reminders through a transactional outbox.
- Export audit events to immutable compliance storage.

## Intentionally Simplified

- No real user authentication
- No application-layer encryption or KMS integration
- No native MinIO presigned URL generation
- No actual OCR or malware engine
- No document thumbnails
- No background scheduler
- No external guest-sharing links
