# Anti-Entropy Repair Improvements

## Production Gaps

- Replace in-memory maps with durable replica storage.
- Add tombstones and retention windows for delete repair.
- Persist range hashes or segment checksums instead of recomputing everything.
- Add partition ownership and virtual-node ranges.
- Add resumable repair sessions with progress tracking.
- Support concurrent writes during repair with compare-and-set or version checks.

## Reliability Improvements

- Add idempotent repair operations.
- Add repair job leasing so only one worker repairs a range at a time.
- Add retry and backoff for failed replica transfers.
- Add a repair journal for crash recovery.
- Add safeguards against repairing from stale or corrupted sources.
- Add checksum validation after copying repaired values.

## Scaling Improvements

- Implement hierarchical Merkle trees instead of fixed-size ranges.
- Stream keys in chunks rather than copying all selected keys in memory.
- Add repair throttling to protect foreground traffic.
- Prioritize old divergence and high-value key ranges.
- Support large-keyspace pagination for compare results.
- Add background anti-entropy scheduling per partition.

## Security Improvements

- Require authentication for mutation and repair endpoints.
- Restrict corruption, deletion, and mode-change endpoints to operators.
- Sign repair traffic between replicas.
- Audit all repair actions with actor identity.
- Redact sensitive values from logs and UI by default.
- Add tenant boundaries before comparing or repairing keys.

## Testing Improvements

- Add controller contract tests for all JSON endpoints.
- Add property-style tests for range hashing and divergent-key detection.
- Add randomized convergence tests with missed writes and repairs.
- Add tests for delete/tombstone semantics once tombstones exist.
- Add browser-level smoke tests for the dashboard.
- Add performance tests for larger key counts and range sizes.
