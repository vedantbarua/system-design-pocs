# Improvements and Next Steps: Key-Value Store POC

## Core Behavior
- Add persistence (H2/Postgres/Redis) and optional snapshots to disk.
- Support conditional writes (compare-and-set) and batch operations.
- Add namespaces or prefixes for multi-tenant use.
- Make TTL refreshable or extendable with a touch endpoint.

## API & UX
- Add PATCH endpoint to update only TTL or value.
- Provide pagination/search for large key sets.
- Add JSON formatting / syntax highlighting in the UI.

## Reliability & Ops
- Add metrics (entry count, expirations) and a health endpoint.
- Background sweeper for expired keys rather than lazy cleanup.
- Dockerfile and CI workflow for build + smoke tests.

## Security
- Add auth tokens or basic auth to guard writes.
- Rate limiting or quotas per client.

## Testing
- Unit tests for TTL expiration and key validation.
- MVC tests for API endpoints and error handling.
