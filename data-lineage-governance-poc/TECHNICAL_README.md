# Technical README

## Architecture

The POC is a single-process data governance service backed by SQLite.

- `DataGovernance` owns dataset metadata, columns, transformation jobs, policy decisions, quality checks, freshness, impact analysis, and audit events.
- `ApiHandler` exposes a JSON API and dashboard through `http.server`.
- Jobs connect input datasets to output datasets, forming the lineage graph.
- Policy decisions are recorded each time a job is registered.

## Data Model

### Datasets

Datasets describe owned data assets.

- `dataset_id`
- `owner_team`
- `classification`
- `zone`
- `freshness_sla_minutes`
- `last_updated`
- `description`
- `metadata_json`

Classifications are ordered operationally by sensitivity:

- `PUBLIC`
- `INTERNAL`
- `CONFIDENTIAL`
- `RESTRICTED`

### Columns

Columns provide field-level governance metadata.

- `column_name`
- `data_type`
- `pii`
- `tags_json`

Column-level PII flags are used by policy checks when data moves to public or external targets.

### Jobs

Jobs represent transformations.

- `job_id`
- `owner_team`
- `code_version`
- `schedule`
- `description`

`job_inputs` and `job_outputs` connect jobs to datasets. A job may have multiple inputs and outputs.

### Quality Checks

Quality checks are recorded status results.

- `check_name`
- `status`
- `metric_value`
- `threshold`
- `message`

The latest quality check is surfaced on each dataset.

### Policy Decisions

Policy decisions record whether a job is allowed.

The current policy model blocks:

- `RESTRICTED` upstream data flowing into the `external` zone
- PII upstream data flowing into `PUBLIC` outputs
- restricted upstream data flowing into outputs classified below `CONFIDENTIAL`

### Audit Events

Audit events record registry mutations and governance queries.

- dataset registration
- job registration
- quality check writes
- freshness updates
- lineage queries
- impact analysis

## Lineage Flow

Lineage is represented as:

```text
input dataset -> transformation job -> output dataset
```

For a dataset-level lineage query, the service returns:

- the dataset metadata
- jobs that produced it
- jobs that consume it

## Impact Analysis

Impact analysis walks downstream edges recursively:

1. Start with a dataset.
2. Find jobs where it is an input.
3. Add each output dataset as impacted.
4. Repeat from each output dataset.

This answers questions such as:

```text
What downstream datasets are affected if raw.customers changes?
```

## Freshness

Each dataset has:

```text
last_updated
freshness_sla_minutes
```

The service computes:

```text
age_seconds = now - last_updated
status = FRESH if age_seconds <= SLA else STALE
```

## Production Considerations

A production version would add:

- metadata ingestion from warehouses and catalogs
- column-level lineage from SQL parsing
- policy-as-code integration
- real quality check execution
- event-driven freshness updates
- lineage graph database indexing
- access control and tenant isolation
- workflow scheduler integrations
- compliance reports and attestations
