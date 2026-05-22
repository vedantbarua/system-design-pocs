# Improvements

## Controller Semantics

- Add resource versions and optimistic concurrency checks.
- Add a rate-limited work queue instead of direct synchronous reconciliation.
- Add owner references and garbage collection for terminated pods.
- Add readiness gates and probe failure handling.
- Add status conditions such as `Progressing`, `Available`, and `Degraded`.

## Scheduling

- Add nodes with CPU and memory capacity.
- Add pod placement constraints and anti-affinity.
- Add pending pods that cannot schedule due to insufficient capacity.
- Add node failures and pod eviction.
- Add zone-aware spreading.

## Rollouts

- Add rollout pause and resume.
- Add rollback to the previous image generation.
- Add progress deadline detection.
- Add blue-green and canary strategies.
- Add rollout history with revision metadata.

## Autoscaling

- Add CPU and memory metrics per pod.
- Add HPA stabilization windows.
- Add scale-up and scale-down policies.
- Add missing-metric handling.
- Add vertical autoscaling recommendations.

## Observability

- Add metrics for reconcile duration, queue depth, actions, and errors.
- Add event filtering by deployment, reason, and time range.
- Add timeline visualization for rollouts and scaling.
- Add diff views between desired and observed state.
- Add trace IDs for reconcile cycles.

## Distributed Systems

- Add leader election for multiple controller replicas.
- Add stale cache and missed watch event simulation.
- Add API server conflict retries.
- Add eventual consistency between desired-state writes and controller cache.
- Add reconciliation idempotency tests with duplicate events.
