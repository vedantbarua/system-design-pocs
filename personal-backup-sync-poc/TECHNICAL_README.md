# Technical README

## Problem Statement

Personal backup systems need to ingest file changes from multiple devices, avoid uploading duplicate content, preserve previous versions, detect conflicts, and restore snapshots later. The hard part is making every background operation idempotent enough to survive retries and replay.

## Architecture Overview

```text
React dashboard
      |
      v
Express API
      |
      +--> KafkaJS producer/consumer or memory broker
      |
      +--> PersonalBackupSync domain core
      |       - event idempotency
      |       - chunk hashing
      |       - version manifests
      |       - conflict detection
      |       - snapshot/restore orchestration
      |       - retryable jobs
      |
      +--> PostgreSQL snapshots, event log, chunk metadata or memory
      |
      +--> Redis queued job mirror or memory
```

The domain core is infrastructure-free. Kafka, PostgreSQL, and Redis are optional adapters with memory fallback.

## Core Data Model

| Model | Purpose |
| --- | --- |
| `BackupDevice` | Registered backup clients like MacBook, iPhone, and iPad. |
| `ChunkObject` | Content-addressed chunk metadata with hash, size, and ref count. |
| `FileVersion` | Manifest record for a path, device, version number, content hash, chunks, and supersession. |
| `BackupSnapshot` | Point-in-time collection of active file versions for a device. |
| `SyncJob` | Retryable upload, restore, or retention job. |
| `Conflict` | Open or resolved cross-device edit conflict. |
| `AuditEvent` | Operational history for demos and review. |

## Event Flow

1. Device publishes a file change to `/api/changes/publish`.
2. KafkaJS sends it to `backup.file.changes`, or memory mode buffers it.
3. Consumer or `/api/kafka/drain` passes the event to the domain core.
4. `processedEvents` rejects duplicate event keys.
5. Content is split into fixed-size chunks.
6. Each chunk hash increments an existing object ref count or creates a new object.
7. A new file version supersedes the previous active version for the same device/path.
8. Cross-device active versions for the same path are compared for conflicts.
9. Upload jobs are enqueued with dedupe keys.
10. Workers complete, retry, or dead-letter jobs.

## Idempotency

Change event keys are:

```text
deviceId:eventId
```

Upload job keys are:

```text
versionId:upload
```

Restore job keys are:

```text
snapshotId:targetDeviceId:restore
```

Those keys let the system safely replay events or rebuild jobs without duplicating work.

## Failure Handling

- Duplicate file change events return without mutating state.
- Chunk uploads are safe to retry because chunks are content-addressed.
- Sync jobs move from `QUEUED` to `RUNNING`, `RETRY`, `COMPLETED`, or `DEAD`.
- Restore jobs are deduped by snapshot and target device.
- Snapshot-pinned versions are skipped during retention pruning.
- Optional infrastructure falls back independently to memory.

## Key Tradeoffs

- Fixed-size chunks are easier to inspect than rolling-content chunking.
- Snapshot persistence stores whole demo state for simplicity.
- Binary object bytes are represented by metadata rather than real object files.
- Conflict detection is simple path/content comparison across active versions.
- Workers run in the API process for the POC.

## Scaling Path

- Split API, change consumer, upload workers, restore workers, and retention workers.
- Partition Kafka by account or device ID.
- Store chunk bytes in object storage and manifests in PostgreSQL.
- Add Redis locks for distributed job dispatch.
- Use rolling chunking for better dedupe on inserted bytes.
- Add snapshot compaction and lifecycle policies.

## What Is Intentionally Simplified

- No authentication or device enrollment.
- No encrypted chunk payloads.
- No real filesystem watcher.
- No resumable multipart upload protocol.
- No object-storage garbage collection beyond ref-count pruning.

## Test Coverage

Backend tests cover seeded state, event keys, duplicate changes, chunk dedupe, file versioning, conflict detection/resolution, retryable jobs, snapshots, restore jobs, retention pruning, replay idempotency, and export/import.
