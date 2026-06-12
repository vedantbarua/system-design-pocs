# Personal Document Renewal Vault Improvements

## Production Gaps

1. Normalize PostgreSQL tables for households, memberships, documents, versions, grants, jobs, reminders, and audit events.
2. Use native S3/MinIO presigned multipart upload and download URLs.
3. Add real authentication, MFA, and session management.
4. Integrate OCR and antivirus providers.
5. Add client-side previews and secure thumbnails.

## Reliability Improvements

1. Move scan and OCR work to Redis Streams with consumer groups.
2. Add job leases, retries, backoff, and a dead-letter queue.
3. Use a transactional outbox for reminders and audit exports.
4. Reconcile abandoned uploads and orphaned objects.
5. Add object integrity verification on download.
6. Rebuild projections from immutable lifecycle events.

## Scaling Improvements

1. Partition document metadata by household ID.
2. Add object lifecycle policies for old versions.
3. Index extracted metadata in OpenSearch.
4. Cache household inventory projections with targeted invalidation.
5. Run reminder scans in distributed date-range partitions.

## Security Improvements

1. Encrypt document data keys with a managed KMS.
2. Require MFA for downloads and role changes.
3. Add document-level access policies and external share expiry.
4. Verify MIME type and file signatures independently of filenames.
5. Redact document numbers from logs and analytics.
6. Export audit events to append-only retention storage.

## Testing Improvements

1. Add FastAPI integration tests.
2. Add Testcontainers coverage for PostgreSQL, Redis, and MinIO.
3. Add concurrent grant-use tests.
4. Add upload interruption and orphan-cleanup tests.
5. Add worker retry and dead-letter tests.
6. Add React interaction, accessibility, and visual regression tests.
