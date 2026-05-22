# Technical README

## Architecture

The POC is a single-process reconciliation controller backed by SQLite.

- `ReconciliationController` owns desired state, observed state, reconcile decisions, autoscaling, and events.
- `ApiHandler` exposes a small JSON API and HTML dashboard through `http.server`.
- Deployments represent desired state.
- Pods represent observed state.
- Events explain why each controller action happened.

## Data Model

### Deployments

Deployments store desired state and rollout policy.

- `name`
- `desired_replicas`
- `image`
- `target_cpu`
- `min_replicas`
- `max_replicas`
- `max_surge`
- `max_unavailable`
- `generation`
- `load`
- `metadata_json`

Changing the image increments the deployment generation.

### Pods

Pods represent observed workload state.

- `pod_id`
- `deployment`
- `image`
- `state`
- `cpu`
- `restart_count`
- `backoff_until`
- `generation`
- `created_at`

Active pods are any pods not in `Terminating`.

### Events

Events are append-only controller explanations.

- `DeploymentUpdated`
- `ReplicaCreate`
- `PodReady`
- `PodStateChanged`
- `Backoff`
- `PodTerminating`
- `Autoscaled`
- `ReconcileNoop`

## Reconciliation Flow

For each deployment, the controller:

1. Reads desired deployment state.
2. Applies HPA if there are running pods with usable load metrics.
3. Advances eligible `Pending` pods to `Running`.
4. Handles failed pods:
   - waits if `backoff_until` is in the future
   - marks failed pods `Terminating` after backoff
5. Applies rolling update logic:
   - creates new-image pods within `max_surge`
   - removes old-image pods within `max_unavailable`
6. Matches active pod count to desired replicas.
7. Records events for every action.

## Rolling Updates

A deployment image change increments the generation. The controller then compares active pods against the desired image.

If surge capacity exists, it creates a new pod first. If no surge capacity exists but unavailable budget is available, it terminates one old pod to make room. Repeated reconciliation eventually replaces all old-image pods.

## Crash Backoff

When a pod is marked `Failed`, restart count increments and `backoff_until` is set with exponential backoff:

```text
5s, 10s, 20s, 40s, ... capped at 300s
```

The controller records `Backoff` events while waiting. Once backoff expires, the failed pod is marked `Terminating` and replica reconciliation creates a replacement.

## Autoscaling

The POC estimates average CPU as:

```text
deployment load / running pod count
```

If estimated CPU exceeds `target_cpu + 10`, desired replicas increase by one up to `max_replicas`.

If estimated CPU is below `target_cpu - 25`, desired replicas decrease by one down to `min_replicas`.

Autoscaling is skipped until at least one pod is running, which avoids scaling decisions before metrics exist.

## Failure Semantics

The controller is intentionally level-driven:

- missing replicas are created on every reconcile
- extra replicas are terminated on every reconcile
- failed pods do not disappear immediately
- terminating pods remain in history
- events are append-only, so the decision path can be inspected

## Production Considerations

A production-grade controller would add:

- Kubernetes API watch streams
- optimistic concurrency with resource versions
- work queues and rate-limited retries
- owner references and garbage collection
- readiness and liveness probe semantics
- scheduler and node capacity awareness
- status subresources
- leader election for active controller instances
