# Improvements

## Production Gaps

1. Replace fixed intervals with timezone-aware RFC 5545 recurrence rules and exception dates.
2. Add household membership, invitations, roles, and scoped authorization.
3. Support task swaps, skips, vacations, one-off chores, and schedule overrides.
4. Add push, email, and in-app notification preferences with quiet hours.
5. Capture completion notes, photos, and verification policies for selected chores.

## Reliability Improvements

1. Persist claims with database compare-and-swap updates and server-generated fencing tokens.
2. Commit task transitions, completion events, and outbox records in one transaction.
3. Move processed-event and reminder-dedupe keys from memory into durable tables.
4. Add Kafka retry topics, exponential backoff, dead-letter routing, and replay controls.
5. Lease background jobs so abandoned work can be reclaimed safely.
6. Reconcile task and workload projections against the completion ledger.

## Scaling Improvements

1. Partition event streams and task tables by stable household ID.
2. Bucket occurrence materialization and overdue scans by due date and shard.
3. Split command handling, scheduling, reminders, and projection building into separate services.
4. Keep current tasks in hot read models and archive old completion history.
5. Add cursor pagination for tasks, events, reminders, and audits.

## Security Improvements

1. Add OIDC authentication and household-scoped authorization on every command.
2. Bind completion actors to verified identities rather than request payloads.
3. Encrypt sensitive household metadata and enforce TLS between services.
4. Rate-limit claims, offline replay, and administrative worker operations.
5. Store security-sensitive audits in append-only immutable storage.

## Testing Improvements

1. Add PostgreSQL, Redis, and Redpanda integration tests with Testcontainers.
2. Add concurrent claim tests proving only one compare-and-swap winner.
3. Add property-based tests for recurrence idempotency and fencing monotonicity.
4. Add clock-controlled timezone, daylight-saving, and lease-boundary tests.
5. Add replay tests for duplicates, stale tokens, and out-of-order completion events.
6. Add Playwright flows for claiming, offline replay, routine creation, and mobile layouts.
