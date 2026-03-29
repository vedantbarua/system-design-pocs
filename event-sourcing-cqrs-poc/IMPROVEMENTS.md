# Improvements

- Persist events and snapshots in Postgres
- Add asynchronous projector workers and visible projection lag
- Introduce dead-letter handling for projection failures
- Support multiple projection views, including customer-centric reads
- Add event upcasters for schema evolution demos
- Expose snapshot compaction and archival controls
- Add tests for concurrency conflicts, replay correctness, and idempotency
