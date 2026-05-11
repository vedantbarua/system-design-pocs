# Write-Ahead Log POC Improvements

## Production Gaps

- Replace the in-memory log with append-only segment files.
- Add a segment manifest with start LSN, end LSN, checksum, and creation time.
- Persist checkpoints separately from WAL segments.
- Add startup recovery that loads the latest checkpoint and replays segments automatically.
- Track command idempotency keys with retention windows and expiry metadata.

## Reliability Improvements

- Add checksums to every WAL record and segment footer.
- Simulate partial writes and truncate corrupted trailing bytes during recovery.
- Add group commit settings to compare latency and durability tradeoffs.
- Add fault injection controls for failed append, failed apply, and failed checkpoint writes.
- Emit recovery diagnostics that identify which checkpoint and segments were used.

## Scaling Improvements

- Rotate WAL segments by size or entry count.
- Add sparse indexes for faster LSN lookup.
- Run checkpoint creation in the background.
- Add snapshot compression for larger state images.
- Split state into partitions so independent keys can replay in parallel.

## Security Improvements

- Add API authentication for mutation and compaction endpoints.
- Validate command payloads against per-key schemas.
- Add audit metadata such as actor, source, and request correlation ID.
- Redact sensitive values from recent event messages.
- Add role checks so destructive controls are not exposed to all users.

## Testing Improvements

- Add controller tests for JSON endpoints and validation failures.
- Add property-based tests that compare replayed state against directly applied state.
- Add fuzz tests for random operation sequences and checkpoint positions.
- Add tests for corrupted segment handling after disk persistence is introduced.
- Add browser-level smoke tests for the Thymeleaf dashboard.
