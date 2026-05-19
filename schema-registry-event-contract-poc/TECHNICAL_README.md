# Schema Registry Event Contract Technical README

## Problem Statement

Event-driven systems depend on contracts between producers and consumers. A producer can break downstream systems by removing a required field, changing a field type, or adding a new required field before consumers are ready. A schema registry gives teams a control plane for versioning, validation, compatibility, and rollout readiness.

## Architecture Overview

The POC is a single Python process with SQLite persistence.

Main components:

- schema subjects
- schema versions
- compatibility checker
- producer event validator
- consumer support registry
- rollout readiness checker
- audit log

The core implementation lives in `SchemaRegistry` in `app.py`.

## Core Data Model

`subjects`

- subject name
- compatibility mode
- description
- created timestamp

`schema_versions`

- subject name
- version number
- schema JSON
- status
- created timestamp

`consumers`

- consumer ID
- subject name
- min supported version
- max supported version
- owner

`validation_events`

- subject
- version
- validation result
- message

`audit_events`

- event type
- message
- timestamp

## Schema Model

Schemas use a compact field list:

```json
{
  "fields": [
    { "name": "order_id", "type": "string", "required": true },
    { "name": "coupon_code", "type": "string", "required": false }
  ]
}
```

Supported field types:

- `string`
- `integer`
- `number`
- `boolean`
- `object`
- `array`

## Compatibility Rules

### Backward Compatibility

New consumers can read old events.

Rejected changes:

- removing a required field
- changing an existing field type
- adding a new required field
- changing a required field to optional in this simplified model

Allowed changes:

- adding optional fields
- removing optional fields

### Forward Compatibility

Old consumers can read new events.

Rejected changes:

- changing field types
- adding a new required field
- removing an old required field

### Full Compatibility

Both backward and forward checks must pass.

### None

Compatibility checks always pass.

## Request Flow

### Register Subject

1. `POST /schemas` validates the subject and schema.
2. The subject is inserted.
3. Version `1` is registered as active.
4. An audit event is written.

### Add Version

1. `POST /schemas/{name}/versions` normalizes the proposed schema.
2. The latest version is loaded as the baseline.
3. Compatibility is checked according to the subject mode.
4. Compatible schemas are registered as the next version.
5. Incompatible schemas are rejected with issue details.

### Validate Event

1. `POST /events/validate` loads the requested schema version.
2. Required fields are checked.
3. Field values are type checked.
4. A validation event is recorded.

### Register Consumer

1. `POST /consumers` records a consumer's supported version range.
2. Rollout readiness is recomputed.
3. A target version is considered ready only when every registered consumer supports it.

## Key Tradeoffs

- **Simplified schema model:** easy to inspect and discuss in a POC.
- **SQLite registry:** durable enough locally without external services.
- **Strict required-to-optional handling:** conservative to surface contract risk clearly.
- **Version ranges for consumers:** simple representation of rollout safety.

## Failure Handling

The POC rejects:

- duplicate subjects
- unknown subjects
- invalid schemas
- incompatible schema versions
- invalid producer events
- consumers declaring support for nonexistent versions

## Scaling Path

A production registry would add:

- Avro, Protobuf, or full JSON Schema support
- schema fingerprints
- producer authentication
- schema ownership and review workflow
- compatibility policies per environment
- consumer discovery from real subscriptions
- rollout approvals
- schema deprecation
- audit trails with actor identity

## What Is Intentionally Simplified

- No full JSON Schema support.
- No auth or RBAC.
- No schema references/imports.
- No environment promotion.
- No producer identity.
- No Kafka/Pulsar integration.
