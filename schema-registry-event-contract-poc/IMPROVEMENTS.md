# Schema Registry Event Contract Improvements

## Production Gaps

- Add Avro, Protobuf, or full JSON Schema support.
- Add schema fingerprints and canonicalization.
- Track producers as first-class registry clients.
- Add schema ownership metadata.
- Add schema deprecation and archival.
- Add environment promotion from dev to staging to production.

## Reliability Improvements

- Add transactional audit records with actor identity.
- Add schema validation test fixtures per subject.
- Add immutable schema storage guarantees.
- Add compatibility check caching.
- Add registry backup and restore.
- Add producer-side validation SDKs.

## Scaling Improvements

- Add pagination for schema and validation history.
- Add subject namespaces by domain or team.
- Add indexed search over subjects and fields.
- Cache latest schema versions.
- Support high-volume validation through local clients.
- Add registry replication for multi-region deployments.

## Security Improvements

- Require authentication for schema and consumer writes.
- Add role-based access control by subject prefix.
- Record actor identity for all registry changes.
- Add approval workflow for breaking changes.
- Hide sensitive example payloads from validation history.
- Sign schema artifacts for producer verification.

## Testing Improvements

- Add HTTP endpoint tests.
- Add property-style tests for compatibility rules.
- Add fixture-based compatibility suites.
- Add regression tests for schema canonicalization.
- Add browser smoke tests for the dashboard.
- Add migration tests for SQLite schema changes.
