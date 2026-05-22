# Kubernetes Controller Reconciliation POC

Python proof-of-concept for Kubernetes-style reconciliation: desired state, observed pods, replica convergence, rolling updates, crash backoff, horizontal autoscaling, and event-driven controller visibility.

## Goal

Show how infrastructure control loops continuously converge messy observed state toward declared desired state.

## What It Covers

- Deployments with desired replicas, image, rollout settings, and HPA settings
- Pods with lifecycle states:
  - `Pending`
  - `Running`
  - `Failed`
  - `Terminating`
- Reconciliation loop that creates missing pods and removes excess pods
- Pending pod readiness progression
- Rolling update from one image version to another
- `max_surge` and `max_unavailable` rollout constraints
- Crash-loop style restart backoff for failed pods
- Horizontal autoscaling from simulated load and target CPU
- Event log for every controller action
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd kubernetes-controller-reconciliation-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8165
```

Open:

```text
http://127.0.0.1:8165
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Create a deployment with three desired replicas.
2. Run reconciliation and observe missing pods created as `Pending`.
3. Run reconciliation again and observe pods become `Running`.
4. Update `checkout:v1` to `checkout:v2` and observe rolling update actions.
5. Mark a pod `Failed` and observe restart backoff before replacement.
6. Raise deployment load and observe HPA increase desired replicas.
7. Lower deployment load and observe HPA scale down.
8. Inspect `/events` or `/snapshot` to see each controller decision.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /deployments`
- `GET /pods`
- `GET /events`
- `POST /deployments`
- `POST /reconcile`
- `POST /deployments/{name}/load`
- `POST /pods/{pod_id}/state`

Example deployment:

```json
{
  "name": "checkout",
  "desired_replicas": 3,
  "image": "checkout:v1",
  "target_cpu": 60,
  "min_replicas": 2,
  "max_replicas": 6,
  "max_surge": 1,
  "max_unavailable": 1,
  "load": 55,
  "metadata": {
    "owner": "orders"
  }
}
```

Example reconcile request:

```json
{
  "deployment": "checkout"
}
```

An empty reconcile request reconciles all deployments:

```json
{}
```

Example rolling update:

```json
{
  "name": "checkout",
  "image": "checkout:v2"
}
```

Example pod failure:

```json
{
  "state": "Failed",
  "cpu": 0
}
```

## Configuration

- `--db-path` defaults to `runtime/controller.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8165`

## Notes and Limitations

- This models controller behavior in one process rather than a real Kubernetes API server.
- Pod scheduling, readiness probes, and kubelet behavior are simplified.
- HPA uses simulated deployment load divided by running pods.
- Failed pod replacement waits for a simplified exponential backoff.
- Terminating pods are retained in history instead of being garbage-collected.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
