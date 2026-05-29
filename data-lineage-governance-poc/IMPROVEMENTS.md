# Improvements

## Metadata Ingestion

- Add warehouse crawlers for tables, columns, partitions, and owners.
- Add schema drift detection.
- Add automatic classification suggestions from column names and samples.
- Add dataset lifecycle states such as proposed, active, deprecated, and deleted.
- Add metadata import from dbt, Airflow, Spark, and BI tools.

## Lineage

- Add column-level lineage from SQL parsing.
- Add versioned lineage snapshots.
- Add graph search by upstream, downstream, owner, or tag.
- Add cycle detection and lineage confidence scoring.
- Add impact diffing between job code versions.

## Governance Policies

- Add policy-as-code rules.
- Add approval workflows for restricted data movement.
- Add purpose-based access controls.
- Add region and residency constraints.
- Add retention and deletion policy checks.

## Quality And Freshness

- Execute real data quality checks against datasets.
- Add freshness monitors and alerting.
- Add quality score rollups by owner and domain.
- Add anomaly detection for row count, null rate, and distribution changes.
- Add quality gates for downstream jobs.

## Compliance

- Add data processing purpose records.
- Add subject access request impact reports.
- Add deletion propagation tracking.
- Add audit exports for compliance reviews.
- Add evidence bundles for regulated datasets.

## Operations

- Add graph database storage for large lineage graphs.
- Add async ingestion workers.
- Add API authentication and tenant isolation.
- Add metrics for stale datasets, policy violations, and failed checks.
- Add dashboards for ownership gaps and high-risk flows.
