# Feature Store Technical README

## Problem Statement

ML systems need the same feature definitions available in two different contexts: offline training and online inference. A feature store centralizes feature computation, materialization, online serving, freshness checks, and point-in-time training data generation.

This POC models those system-design concerns using raw user events and a local SQLite-backed feature store.

## Architecture Overview

The application is a single Python process with four logical layers:

- raw event ingestion
- offline feature store
- online feature store
- training-set generator

`FeatureStore` owns the SQLite schema and all feature operations. Events are stored in `raw_events`. Backfills write historical feature values to `offline_features`. Ingest operations refresh `online_features` for the affected user. Training-set generation computes features as of each label timestamp.

## Core Data Model

`raw_events`

- event ID
- event type
- user ID
- event timestamp
- payload JSON
- ingested timestamp

`offline_features`

- user ID
- feature name
- feature value
- as-of timestamp
- computed timestamp
- source

`online_features`

- user ID
- feature name
- feature value
- computed timestamp
- expiry timestamp
- source

`audit_events`

- timestamp
- event type
- message

## Feature Definitions

`user_7d_purchase_count`

- Counts purchase events in the seven days before the requested as-of timestamp.

`user_30d_spend`

- Sums purchase amount in the thirty days before the requested as-of timestamp.

`last_seen_category`

- Uses the latest category from any event at or before the requested as-of timestamp.

`account_age_days`

- Uses the oldest observed profile `created_at` value and compares it to the requested as-of timestamp.

## Request Flow

### Event Ingestion

1. `POST /events` validates event type, user ID, timestamp, and payload.
2. The event is inserted into `raw_events`.
3. Features are recomputed for that user as of the event timestamp.
4. Online features are upserted with a TTL.
5. Matching offline feature values are also recorded for auditability.

### Backfill

1. `POST /features/backfill` selects an as-of timestamp.
2. The store enumerates all users.
3. Each feature is recomputed from raw events.
4. Values are written to `offline_features`.
5. Online features are refreshed from the same computation.

### Training Set

1. `POST /training-set` receives labels with `user_id`, `label_ts`, and `label`.
2. For each label, features are computed using only events at or before `label_ts`.
3. The response returns one training row per label.

## Key Tradeoffs

- **SQLite instead of external stores:** keeps the POC runnable while preserving storage boundaries.
- **Hard-coded feature definitions:** makes feature logic easy to inspect.
- **Point-in-time computation from raw events:** avoids training leakage and shows why event timestamps matter.
- **TTL-based freshness:** simple enough for a demo while exposing online staleness.
- **Skew report:** compares offline and online values so derived-data drift is visible.

## Failure Handling

The POC surfaces common feature-store risks:

- stale online values through TTL freshness checks
- offline/online skew through the snapshot report
- point-in-time leakage prevention in training-set generation
- replay/backfill recovery by recomputing from raw events

The implementation does not include retries, background jobs, or distributed locks.

## Scaling Path

A production system would add:

- declarative feature registry
- feature versioning
- batch engine such as Spark, Ray, or Flink
- online store such as Redis, Cassandra, DynamoDB, or RocksDB
- streaming ingestion
- scheduler/orchestrator integration
- materialization jobs with checkpoints
- freshness SLAs and alerts
- access control and entity-level authorization
- data quality checks and feature drift monitoring

## What Is Intentionally Simplified

- No external stream processor.
- No distributed online store.
- No feature registry DSL.
- No model-serving integration.
- No entity joins beyond `user_id`.
- No background scheduler.
- No auth, tenancy, or PII controls.
