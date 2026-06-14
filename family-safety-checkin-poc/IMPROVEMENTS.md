# Family Safety Check-in Improvements

## Production Gaps

1. Normalize PostgreSQL tables for households, memberships, check-ins, locations, client events, jobs, deliveries, and incident timelines.
2. Add real authentication, device enrollment, trusted-contact invitations, consent, and revocation.
3. Integrate native push, SMS, and voice providers with delivery callbacks.
4. Add recurring check-in templates and timezone-aware calendar schedules.
5. Integrate a real map provider with privacy-preserving geocoding.
6. Add explicit emergency guidance and regional emergency-service routing.

## Reliability Improvements

1. Publish lifecycle events through a transactional outbox.
2. Move notification jobs to Redis Streams with leases, backoff, consumer groups, and a dead-letter stream.
3. Add scheduler checkpoints and reconciliation for missed scan windows.
4. Subscribe each API instance to Redis fanout for cross-instance WebSocket invalidations.
5. Add delivery-provider fallback and channel escalation policies.
6. Detect stuck incidents, abandoned location shares, and disconnected mobile devices.

## Scaling Improvements

1. Partition deadline scans by due-time bucket and household shard.
2. Store current location separately from retained audit records.
3. Apply location write coalescing and per-device rate limits.
4. Cache household projections with targeted invalidation.
5. Route WebSocket clients by household affinity.
6. Move historical incident analytics to separate storage.

## Security Improvements

1. Encrypt location and contact fields with managed envelope keys.
2. Require step-up authentication for trusted-contact changes.
3. Sign mobile commands and bind sequence counters to device epochs.
4. Enforce short retention and cryptographic deletion for location history.
5. Redact coordinates and phone details from logs and analytics.
6. Add break-glass access reviews and immutable security audit exports.

## Testing Improvements

1. Add FastAPI HTTP and WebSocket integration tests.
2. Add Testcontainers coverage for PostgreSQL and Redis.
3. Add concurrent acknowledgement and scheduler race tests.
4. Add property tests for event ordering and location sequence handling.
5. Add retry exhaustion, dead-letter, and provider fallback tests.
6. Add multi-client WebSocket invalidation tests.
7. Add React interaction, accessibility, and visual regression tests.
