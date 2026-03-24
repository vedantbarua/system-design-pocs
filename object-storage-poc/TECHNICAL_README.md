# Technical README

## Goal
This POC models the core control-plane and data-plane ideas behind S3-style object storage without introducing external dependencies. It is intentionally in-memory and text-only, but the workflows are realistic enough to discuss tradeoffs and extend later.

## Core Concepts
- **Buckets**: namespace boundary with optional versioning
- **Object key**: path-like identifier inside a bucket
- **Object version**: immutable stored revision with `versionId`, `etag`, and storage class
- **Multipart upload**: staged write that assembles ordered parts into a final object
- **Pre-signed token**: time-bound capability granting upload or download access without a user session

## Architecture
- `ObjectStorageController` exposes Thymeleaf routes and JSON APIs.
- `ObjectStorageService` holds all state in memory and enforces validation and workflow rules.
- `BucketEntry`, `ObjectVersion`, `ObjectSummary`, `MultipartUploadView`, and `PresignedTokenView` are the main view models.

## Data Model
- `buckets`: `bucketId -> BucketEntry`
- `objectVersions`: `bucketId -> objectKey -> [versions]`
- `multipartUploads`: active upload sessions keyed by `uploadId`
- `presignedTokens`: active capability tokens keyed by opaque token string

## Write Path
### Standard object put
1. Validate bucket, key, size, and storage class.
2. If bucket versioning is enabled, mark the previous current version as non-current.
3. If versioning is disabled, replace the existing version list.
4. Create a new immutable `ObjectVersion`.

### Multipart upload
1. Create an upload session for `(bucketId, objectKey)`.
2. Accept parts independently by part number.
3. On completion, verify parts are contiguous from `1`.
4. Concatenate parts and write a final object version through the normal write path.

### Pre-signed tokens
- `DOWNLOAD` tokens validate object existence at creation time.
- `UPLOAD` tokens are single-use and become consumed after success.
- Tokens expire by timestamp check during access.

## Tradeoffs
- Synchronization is coarse-grained (`synchronized`) because correctness is more important than throughput in this POC.
- Version content is stored inline with metadata for simplicity.
- Lifecycle transitions are represented only through explicit storage class selection, not background jobs.
- Download tokens can be reused until expiry; upload tokens are single-use.

## Extension Ideas
- Binary payload support with checksum validation
- Bucket policies and ACLs
- Range reads and partial downloads
- Replication status across regions
- Lifecycle jobs that transition objects from `STANDARD` to `ARCHIVE`
