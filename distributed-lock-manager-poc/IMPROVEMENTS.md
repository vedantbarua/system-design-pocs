# Improvements

## Production Gaps

- Replace the single Redis coordinator with a production-grade topology and explicit failure-domain assumptions.
- Add a real protected downstream service that validates fencing tokens instead of writing to a Redis hash.
- Expose structured metrics, traces, and contention dashboards rather than only request responses.

## Reliability Improvements

- Add lease renewal for long-running work with bounded heartbeat failures.
- Add retry and backoff behavior for contention-heavy resources.
- Add crash-recovery tests to validate behavior when a backend dies after acquisition but before release.

## Scaling Improvements

- Support many resources with tenant-aware key prefixes and cardinality controls.
- Add lock-striping or partitioning if coordination hotspots dominate throughput.
- Add queue-based admission control so clients do not stampede Redis under high contention.

## Security Improvements

- Add authentication and authorization for lock acquisition and inspection endpoints.
- Add namespace isolation so one tenant cannot inspect or mutate another tenant's resource keys.
- Add request-size validation and rate limiting to prevent abuse.

## Testing Improvements

- Add integration tests covering lease expiry, stale-write rejection, and owner-safe release.
- Add concurrency stress tests with many workers contending for the same resource.
- Add failure-injection tests for Redis disconnects and slow downstream writes.
