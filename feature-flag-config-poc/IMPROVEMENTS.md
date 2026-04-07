# Improvements

## Production Gaps

- Move definitions, client state, and propagation history into durable storage.
- Add a push-based config propagation channel instead of polling-only sync.
- Add environment scoping and promotion workflows across dev, staging, and production.

## Reliability Improvements

- Add rollback support and version pinning for bad releases.
- Add SDK-side stale-cache handling and offline bootstrap behavior.
- Add stronger validation for malformed rules, oversized payloads, and incompatible value types.

## Scaling Improvements

- Add segmented storage and cache fanout for large definition sets.
- Add streaming propagation or long-poll fanout for many client instances.
- Add richer targeting primitives such as ranges, segments, and percentage bucketing by multiple dimensions.

## Security Improvements

- Add authentication and authorization for definition changes and client sync endpoints.
- Add audit trails for publishes, deletes, and rule edits.
- Add sensitive-config handling with encryption or secret references.

## Testing Improvements

- Add controller tests for invalid payloads and deletion flows.
- Add more rollout determinism tests across many subjects and rules.
- Add sync tests for stale versions, full snapshot fallback, and client invalidation behavior.
