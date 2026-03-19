# Improvements

- Persist partitions and offsets so messages survive restarts.
- Add lease timeouts so abandoned in-flight deliveries are automatically redelivered.
- Model partition leadership and replica followers instead of a single local log.
- Introduce retention windows and compaction policies to demonstrate cleanup tradeoffs.
- Add producer idempotency keys and transactional publish semantics.
