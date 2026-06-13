# Medication Refill and Adherence Improvements

## Production Gaps

1. Normalize PostgreSQL tables for medication schedules, dose occurrences, inventory entries, prescriptions, refills, memberships, jobs, deliveries, and audit events.
2. Add real authentication, patient consent, caregiver invitations, and revocation.
3. Support complex recurrence rules, temporary pauses, taper schedules, and as-needed medications.
4. Integrate pharmacy refill status and prescribing systems through standards-based interfaces.
5. Add native mobile push, email, SMS, and accessibility-focused confirmation flows.

## Reliability Improvements

1. Move notification work to Redis Streams with consumer groups, leases, backoff, and a dead-letter stream.
2. Use a transactional outbox for dose, refill, inventory, and audit events.
3. Add scheduler checkpoints and reconciliation for missed materialization windows.
4. Detect stuck refill states and provider delivery gaps.
5. Rebuild adherence and supply projections from immutable events.
6. Add optimistic concurrency control to medication and refill aggregates.

## Scaling Improvements

1. Partition schedule materialization by timezone, local date, and household shard.
2. Precompute upcoming occurrences in rolling windows.
3. Cache read projections with medication-scoped invalidation.
4. Separate notification delivery workers by channel and provider.
5. Store historical adherence aggregates in analytical storage.
6. Add backpressure and per-household fairness to reminder processing.

## Security Improvements

1. Encrypt sensitive fields with envelope encryption and managed keys.
2. Require step-up authentication for caregiver grants and prescription changes.
3. Add patient-controlled, medication-level permissions.
4. Export audit events to append-only retention storage.
5. Redact medication and prescription details from operational logs.
6. Add emergency-access policies with explicit justification and review.

## Testing Improvements

1. Add FastAPI integration tests for every state transition.
2. Add Testcontainers coverage for PostgreSQL and Redis.
3. Add property tests across daylight-saving gaps and overlaps.
4. Add concurrent dose-confirmation and refill-request tests.
5. Add worker lease, retry exhaustion, and dead-letter tests.
6. Add React interaction, keyboard, accessibility, and visual regression tests.
7. Add clock-controlled multi-timezone scheduler tests.
