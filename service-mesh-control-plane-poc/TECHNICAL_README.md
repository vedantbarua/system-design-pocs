# Technical README

## Architecture

The POC is a single-process service mesh control-plane simulator backed by SQLite.

- `ServiceMeshControlPlane` owns state, routing decisions, policy enforcement, retries, circuit breakers, and traces.
- `ApiHandler` exposes a JSON API and dashboard through `http.server`.
- Sidecars represent proxy-managed service instances.
- Traffic policies define source-to-destination behavior.
- Request traces show the exact route, attempts, and final decision.

## Data Model

### Sidecars

Sidecars are registered service instances.

- `instance_id`
- `service`
- `version`
- `zone`
- `identity`
- `status`
- `weight`
- `metadata_json`
- `consecutive_failures`
- `ejected_until`
- `last_heartbeat`

Only sidecars with status `UP` and no active ejection are eligible for routing.

### Traffic Policies

Traffic policies apply to one source service and destination service pair.

- `source_service`
- `destination_service`
- `mtls_required`
- `allowed_identities_json`
- `timeout_ms`
- `max_retries`
- `retry_budget`
- `retry_budget_used`
- `circuit_failure_threshold`
- `circuit_open_until`
- `outlier_failure_threshold`
- `ejection_seconds`
- `traffic_split_json`

The policy stores both security and traffic-management rules so routing decisions can be audited from one object.

### Request Traces

Each route request writes a trace with:

- source and destination service
- caller identity
- final decision
- final upstream instance
- per-attempt outcome
- reason

## Routing Flow

1. Resolve the source and destination traffic policy.
2. Enforce mTLS identity requirements.
3. Reject if the circuit breaker is open.
4. Choose a target version from the traffic split.
5. Filter eligible sidecars:
   - same destination service
   - matching target version when available
   - status `UP`
   - not temporarily ejected
   - not already attempted in this request
6. Select an upstream with deterministic weighted scoring.
7. Simulate an upstream result.
8. Retry another eligible sidecar while retry budget remains.
9. Record sidecar failures, ejections, circuit state, and trace output.

## Traffic Splitting

The control plane uses a stable hash of `request_id` to choose a version bucket. This gives repeatable results for tests and illustrates the same operational idea as sticky canary routing.

Example:

```json
{
  "v1": 90,
  "v2": 10
}
```

The split means roughly 90 percent of request IDs select `v1` and 10 percent select `v2`.

## Failure Handling

### Retry Budget

Each retry attempt consumes one unit from the policy retry budget. Once the budget is exhausted, requests stop retrying even if `max_retries` is higher.

### Outlier Ejection

Each failed upstream attempt increments the sidecar failure counter. When the counter reaches the policy threshold, the sidecar is ejected until `ejected_until`.

### Circuit Breaker

When accumulated destination failures reach the policy threshold, the policy opens its circuit breaker and rejects new requests until `circuit_open_until`.

## Security Model

mTLS is simulated through SPIFFE-style identity strings such as:

```text
spiffe://mesh/frontend
```

If `mtls_required` is true, the caller identity must be present and must match `allowed_identities`, unless the policy uses wildcard identity `*`.

## Production Considerations

A production service mesh would separate:

- control plane policy APIs
- xDS or equivalent config distribution
- data plane proxies
- certificate issuance and rotation
- telemetry ingestion
- policy rollout safety checks
- multi-cluster replication

This POC keeps those ideas in one process so the mechanics are easy to inspect.
