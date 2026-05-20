# Technical README

## Architecture

The POC is a single-process authorization decision service backed by SQLite.

- `AuthorizationStore` owns persistence, seed data, policy writes, and decision evaluation.
- `ApiHandler` exposes a small JSON API and HTML dashboard through `http.server`.
- Policies are stored as immutable versions.
- `policy_heads` selects the active version for each `policy_id`.
- Every authorization check writes a decision record for auditability.

## Data Model

### Principals

Principals represent users or services.

- `principal_id`
- `principal_type`
- `roles_json`
- `attributes_json`

Roles power RBAC checks. Attributes power ABAC checks.

### Resources

Resources represent protected objects.

- `resource_id`
- `resource_type`
- `owner_id`
- `attributes_json`

Resource type narrows policy scope. Owner and attributes support condition checks.

### Policies

Policies are versioned and immutable once written.

- `policy_id`
- `version`
- `effect`
- `priority`
- `actions_json`
- `principal_roles_json`
- `resource_types_json`
- `conditions_json`
- `enabled`
- `dry_run`

Writing an existing `policy_id` creates a new version and advances the active head.

### Decisions

Each decision stores the request identity, final result, reason, active matches, and dry-run matches.

## Decision Flow

1. Resolve the principal from the store or inline request payload.
2. Resolve the resource from the store or inline request payload.
3. Load active policy heads.
4. Match policy scope:
   - action
   - principal role
   - resource type
5. Evaluate all policy conditions.
6. Split active matches from dry-run matches.
7. Apply final decision:
   - any active deny match returns `deny`
   - otherwise any active allow match returns `allow`
   - otherwise default `deny`
8. Record the decision with matched policy metadata.

## Condition Language

Conditions compare values from the request document.

Supported operators:

- `eq`
- `neq`
- `in`
- `contains`
- `exists`
- `prefix`

Reference examples:

- `principal.principal_id`
- `principal.attributes.region`
- `resource.owner_id`
- `resource.attributes.status`
- `context.ip`

Conditions may compare against a literal `right` value or a `right_ref` value.

## Rollout Model

The `dry_run` flag lets teams test a policy against live authorization traffic without changing the final decision. Matched dry-run policies are included in the response and audit log, which makes it possible to evaluate blast radius before enabling a rule.

## Failure Semantics

The service fails closed:

- unknown principals return a bad request
- unknown resources return a bad request
- unmatched requests default to deny
- deny matches override allow matches

## Production Considerations

A production version would usually add:

- signed JWT or mTLS principal extraction
- policy bundles signed and promoted through CI
- low-latency in-memory policy cache
- decision logs exported to a warehouse
- policy simulation against historical requests
- horizontally scaled stateless API nodes
- explicit policy review and approval workflows
