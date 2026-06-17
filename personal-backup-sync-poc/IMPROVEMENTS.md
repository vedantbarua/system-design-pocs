# Improvements

## Production Gaps

- Store chunk bytes in object storage instead of representing them as metadata.
- Add account, device enrollment, and per-device credentials.
- Encrypt chunks client-side before upload.
- Split API, Kafka consumers, upload workers, restore workers, and retention workers.
- Replace demo snapshots with normalized PostgreSQL manifest tables.

## Reliability Improvements

- Add Redis leases for distributed job workers.
- Add DLQ topics for malformed change events and permanently failed jobs.
- Persist every job state transition as an immutable event.
- Add resumable multipart upload state for large files.
- Add background reconciliation between manifests and object storage.

## Scaling Improvements

- Partition Kafka by account ID or device ID.
- Use rolling-content chunking to improve dedupe after inserted bytes.
- Add chunk packing and compaction for many small objects.
- Add incremental snapshot indexes for faster restore planning.
- Add cold-storage lifecycle tiers for old snapshots.

## Security Improvements

- Add signed device change events.
- Encrypt chunk payloads before upload.
- Add per-device revocation and key rotation.
- Add audit exports for restore and delete actions.
- Add malware scanning hooks before making restored files available.

## Testing Improvements

- Add API integration tests for all routes.
- Add browser tests for publish/drain/restore/conflict flows.
- Add property tests for chunking and dedupe invariants.
- Add Kafka integration tests with a real broker in CI.
- Add chaos tests for worker crashes between chunk upload and manifest commit.
