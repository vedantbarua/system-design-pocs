# Feature Store POC

Python proof-of-concept for an ML feature store with raw event ingestion, offline materialization, online serving, point-in-time training-set generation, freshness checks, and skew detection.

## Goal

Show how derived ML features move from raw events into offline training data and online low-latency serving while preserving point-in-time correctness and operational visibility.

## What It Covers

- Raw event ingestion for:
  - `purchase`
  - `page_view`
  - `profile_update`
- SQLite-backed raw event log
- Offline feature materialization table
- Online feature serving table with TTL/freshness metadata
- Feature definitions:
  - `user_7d_purchase_count`
  - `user_30d_spend`
  - `last_seen_category`
  - `account_age_days`
- Backfill job for historical materialization
- Incremental online refresh after ingest
- Point-in-time training-set generation
- Offline/online skew report
- Lightweight HTML dashboard and JSON API

## Quick Start

Run the demo:

```bash
cd feature-store-poc
python3 app.py demo
```

Start the HTTP server:

```bash
python3 app.py serve --port 8160
```

Open:

```text
http://127.0.0.1:8160
```

Run tests:

```bash
python3 -m unittest discover -s tests
```

## Demo Flows

1. Ingest a `purchase` event and inspect online features for that user.
2. Ingest a `profile_update` with an older `created_at` and verify `account_age_days`.
3. Run backfill and confirm offline and online feature values are refreshed.
4. Generate a training set with labels at historical timestamps and verify future events are excluded.
5. Check `/freshness` to see TTL metadata for online features.
6. Inspect the skew report in `/snapshot` to compare latest offline and online feature values.

## JSON Endpoints

- `GET /health`
- `GET /snapshot`
- `GET /freshness`
- `GET /features/online/{user_id}`
- `POST /events`
- `POST /features/backfill`
- `POST /training-set`

Example event:

```json
{
  "event_type": "purchase",
  "user_id": "user-3",
  "amount": 79.99,
  "category": "headphones"
}
```

Example training-set request:

```json
{
  "labels": [
    {
      "user_id": "user-1",
      "label_ts": 1760000000,
      "label": "converted"
    }
  ]
}
```

## Configuration

- `--db-path` defaults to `runtime/feature_store.db`
- `--ttl-seconds` defaults to `900`
- `serve --host` defaults to `127.0.0.1`
- `serve --port` defaults to `8160`

## Notes and Limitations

- Uses SQLite and standard-library HTTP to keep the POC local and dependency-free.
- Feature definitions are hard-coded Python functions, not a declarative registry.
- Online serving is process-local SQLite, not Redis/Cassandra/DynamoDB.
- Freshness is TTL-based and does not include background expiry.
- Skew detection compares latest materialized offline values to online values.
- There is no authentication, tenant isolation, feature versioning, or workflow scheduler.

## Technologies Used

- Python 3 standard library
- `sqlite3`
- `http.server`
- `unittest`
