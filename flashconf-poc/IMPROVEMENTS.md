# Improvements

- Back the central store with Redis + Postgres (durable + fast read path).
- Add ETag / If-None-Match for SDK ruleset polling fallback.
- Implement per-flag rollout schedules (time-based ramp).
- Persist audit trail to a separate append-only log table.
- Add segment builder UI for non-technical admins.
- Partition SSE channels by environment (dev/staging/prod).
- Add drift detection between cache vs store versions.
- Support multi-variant flags (A/B testing, not just boolean).
