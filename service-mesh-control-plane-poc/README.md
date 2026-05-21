# Service Mesh Control Plane POC

Python proof-of-concept for service mesh control-plane behavior: sidecar registration, mTLS identity policy, canary traffic splitting, retries, retry budgets, circuit breakers, outlier ejection, and request traces.

## Goal

Show how platforms manage internal service-to-service traffic without hardcoding routing, retries, security, and failure handling inside every service.

## What It Covers

- Sidecar instance registry with service, version, zone, identity, status, and metadata
- Traffic policies for source-to-destination service pairs
- mTLS identity enforcement through allowed identities
- Version-based traffic splitting such as `90% v1 / 10% v2`
- Deterministic request routing for repeatable behavior
- Retry limits and retry-budget accounting
- Timeout metadata on traffic policies
- Circuit breaker state per traffic policy
- Outlier detection and temporary instance ejection
- Draining and down sidecar states
- Request traces with attempts, selected upstreams, outcomes, and reasons
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd service-mesh-control-plane-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8164
```

Open:

```text
http://127.0.0.1:8164
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Route `frontend -> checkout` with identity `spiffe://mesh/frontend` and observe an allow decision.
2. Route with an untrusted identity and observe policy denial before any upstream attempt.
3. Send many request IDs and observe deterministic canary distribution across `v1` and `v2`.
4. Force one upstream to fail and observe a retry to another eligible sidecar.
5. Fail the same sidecar repeatedly and observe temporary outlier ejection.
6. Mark a sidecar `DRAINING` and observe that new requests avoid it.
7. Fail a destination enough times and observe circuit breaker rejection.
8. Inspect `/traces` or `/snapshot` to see request-level routing history.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /sidecars`
- `GET /policies`
- `GET /traces`
- `POST /route`
- `POST /sidecars`
- `POST /policies`
- `POST /sidecars/{instance_id}/heartbeat`
- `POST /sidecars/{instance_id}/status`

Example route request:

```json
{
  "source_service": "frontend",
  "destination_service": "checkout",
  "identity": "spiffe://mesh/frontend",
  "request_id": "cart-42"
}
```

Example forced retry:

```json
{
  "source_service": "frontend",
  "destination_service": "checkout",
  "identity": "spiffe://mesh/frontend",
  "request_id": "cart-42",
  "force_failures": ["checkout-v1-a"]
}
```

Example traffic policy:

```json
{
  "policy_id": "frontend-to-checkout",
  "source_service": "frontend",
  "destination_service": "checkout",
  "mtls_required": true,
  "allowed_identities": ["spiffe://mesh/frontend"],
  "timeout_ms": 200,
  "max_retries": 2,
  "retry_budget": 5,
  "circuit_failure_threshold": 3,
  "outlier_failure_threshold": 2,
  "ejection_seconds": 15,
  "traffic_split": {
    "v1": 90,
    "v2": 10
  }
}
```

Example sidecar registration:

```json
{
  "instance_id": "checkout-v3-a",
  "service": "checkout",
  "version": "v3",
  "zone": "us-east-1a",
  "identity": "spiffe://mesh/checkout",
  "weight": 100,
  "metadata": {
    "stage": "preview"
  }
}
```

## Configuration

- `--db-path` defaults to `runtime/service_mesh.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8164`

## Notes and Limitations

- This models control-plane decisions and simulated proxy behavior inside one process.
- There is no real Envoy, xDS, mTLS handshake, or network traffic.
- Retry budgets are process-local counters in SQLite.
- Traffic splitting is deterministic by request ID, not statistically random.
- Circuit breaker and outlier ejection use simplified failure counters.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
