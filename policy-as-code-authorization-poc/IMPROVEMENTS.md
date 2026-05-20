# Improvements

## Product

- Add a policy editor with condition builders and validation feedback.
- Show side-by-side traces for active and dry-run policy decisions.
- Add policy ownership, review status, and approval history.
- Provide saved example requests for common service-to-service checks.

## Authorization Model

- Add explicit subject, object, action, and environment namespaces.
- Support hierarchical roles and resource inheritance.
- Add time-window, network, tenant, and risk-score conditions.
- Add deny reasons that can be safely returned to end users.
- Add policy groups and staged rollouts by tenant or service.

## Operations

- Export decision metrics by action, resource type, principal role, and outcome.
- Add decision log compaction or retention controls.
- Add policy bundle snapshots for fast startup.
- Add a cache layer for hot policies and principal metadata.
- Add a replay tool to evaluate new policies against historical decisions.

## Security

- Validate JWTs and service identities instead of accepting raw principal IDs.
- Sign policy bundles and verify signatures before activation.
- Add tamper-evident decision logs.
- Add break-glass policies with extra audit requirements.
- Add least-privilege analysis for unused roles and broad wildcard policies.

## Distributed Systems

- Split write path from read path so policy changes publish immutable bundles.
- Add leader election or compare-and-swap activation for policy heads.
- Add multi-region policy replication with version conflict detection.
- Add degraded-mode behavior for stale policy bundles.
- Add streaming decision events for near-real-time compliance monitoring.
