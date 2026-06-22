# Improvements

## Production Gaps

1. Add multiple vehicles, VIN decoding, unit preferences, and manufacturer schedules.
2. Integrate OBD-II telemetry, fuel receipt OCR, and service-provider imports.
3. Add correction workflows that preserve superseded event lineage.
4. Support partial fills, electric charging, hybrid efficiency, and tire records.

## Reliability Improvements

1. Persist events and outbox records atomically with stream versions.
2. Store idempotency keys, quarantine decisions, and checkpoints durably.
3. Add retry topics, dead-letter routing, replay controls, and projection checksums.
4. Detect clock skew and impossible mileage velocity.

## Scaling Improvements

1. Partition event streams and storage by vehicle ID.
2. Rebuild from periodic checkpoints instead of stream origin.
3. Separate telemetry, fuel, maintenance, and notification workers.
4. Archive raw telemetry and retain compact long-term summaries.

## Security Improvements

1. Add OIDC authentication and owner/driver authorization.
2. Authenticate devices and rotate ingestion credentials.
3. Encrypt VIN, location, and receipt metadata.
4. Rate-limit ingestion and administrative replay operations.

## Testing Improvements

1. Add Redpanda, PostgreSQL, and Redis integration tests.
2. Add property tests for monotonic applied mileage and replay determinism.
3. Add event-order permutations, clock-skew, and duplicate-delivery tests.
4. Add Playwright coverage for event entry, service completion, retries, and mobile layouts.
