# Data Lineage Governance POC

Python proof-of-concept for data governance: dataset ownership, classification, column-level PII tags, transformation lineage, data quality checks, freshness SLAs, policy gates, impact analysis, and audit logging.

## Goal

Show how data platforms track where data came from, what transformed it, who owns it, whether it is fresh and trustworthy, and whether sensitive data is allowed to flow downstream.

## What It Covers

- Dataset registry with owners, descriptions, zones, and classifications
- Supported classifications:
  - `PUBLIC`
  - `INTERNAL`
  - `CONFIDENTIAL`
  - `RESTRICTED`
- Dataset zones:
  - `raw`
  - `warehouse`
  - `ml`
  - `external`
- Column metadata with types, PII flags, and tags
- Transformation jobs with code version, schedule, inputs, and outputs
- Lineage graph from source datasets to derived datasets
- Policy gates for PII and restricted data movement
- Data quality checks with `PASS`, `WARN`, and `FAIL`
- Freshness SLA tracking
- Impact analysis for downstream dependencies
- Audit log for registry writes, lineage queries, policy decisions, and freshness updates
- SQLite-backed state
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd data-lineage-governance-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8169
```

Open:

```text
http://127.0.0.1:8169
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Register raw customer and order datasets.
2. Register column-level metadata and PII tags.
3. Register a transformation job from raw datasets to `warehouse.customer_ltv`.
4. Create an unsafe external export from restricted customer data and observe policy rejection.
5. Mark a dataset stale and observe freshness SLA status.
6. Record a failing quality check.
7. Run impact analysis for `raw.customers`.
8. Inspect `/snapshot`, `/lineage/{dataset_id}`, `/impact/{dataset_id}`, or `/audit`.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /datasets`
- `GET /jobs`
- `GET /quality`
- `GET /policies/decisions`
- `GET /audit`
- `GET /lineage/{dataset_id}`
- `GET /impact/{dataset_id}`
- `POST /datasets`
- `POST /jobs`
- `POST /quality`
- `POST /datasets/{dataset_id}/freshness`

Example dataset:

```json
{
  "dataset_id": "raw.customers",
  "owner_team": "growth-data",
  "classification": "RESTRICTED",
  "zone": "raw",
  "freshness_sla_minutes": 60,
  "description": "Customer records from signup and profile systems.",
  "columns": [
    {
      "name": "customer_id",
      "type": "string",
      "pii": false,
      "tags": ["identifier"]
    },
    {
      "name": "email",
      "type": "string",
      "pii": true,
      "tags": ["email"]
    }
  ]
}
```

Example job:

```json
{
  "job_id": "job.customer-ltv",
  "owner_team": "growth-data",
  "code_version": "git:abc123",
  "schedule": "hourly",
  "description": "Build customer LTV from orders and customer profile metadata.",
  "inputs": ["raw.customers", "raw.orders"],
  "outputs": ["warehouse.customer_ltv"]
}
```

Example quality check:

```json
{
  "dataset_id": "warehouse.customer_ltv",
  "check_name": "not_null_customer_id",
  "status": "PASS",
  "metric_value": 0,
  "threshold": 0,
  "message": "No null customer identifiers."
}
```

## Configuration

- `--db-path` defaults to `runtime/lineage.db`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8169`

## Notes and Limitations

- The lineage graph is stored in SQLite and evaluated in process.
- Policy gates are intentionally small and focused on PII/restricted data movement.
- Freshness is computed from `last_updated` and an SLA window.
- Quality checks are recorded, not executed against real data.
- The HTTP server is standard-library only so the POC runs without installed dependencies.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
