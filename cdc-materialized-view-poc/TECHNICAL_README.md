# CDC Materialized View Technical README

## Problem Statement

Many production systems keep normalized source-of-truth data in one database while serving reads from denormalized stores such as search indexes, analytics tables, caches, or API-specific read models. Change Data Capture is a common way to stream row changes from the source database into those downstream systems.

This POC models the mechanics that matter most: append-only changes, connector offsets, lag, idempotency, replay, and backfill.

## Architecture Overview

The application is a single Spring Boot process with four logical parts:

- source `orders` table
- append-only CDC log
- connector with committed offset
- downstream materialized views

`CdcMaterializedViewService` owns the in-memory state and all transitions. Source table mutations append change events. The connector polls events above its committed offset and applies them to projections.

## Core Data Model

`OrderRow`

- order ID
- customer ID
- SKU
- quantity
- unit price
- status
- row version
- deleted flag

`ChangeEvent`

- sequence
- dedupe sequence
- operation
- row payload
- duplicate flag
- source label

`ConnectorView`

- paused flag
- committed offset
- latest sequence
- lag
- processed event count
- duplicate event count

`ProjectionView`

- order summary view
- customer totals view
- search index view

## Request And Event Flow

### Source Write

1. `POST /api/orders`, `PATCH /api/orders/{id}`, or `DELETE /api/orders/{id}` mutates the source table.
2. The service assigns a new row version where needed.
3. A CDC event is appended with a monotonically increasing sequence.
4. The connector lag increases until polling catches up.

### Connector Poll

1. `POST /api/cdc/poll` reads events with sequence greater than the committed offset.
2. The connector applies up to `maxEvents`.
3. Each event is checked against the applied sequence set.
4. New events update projections and advance the committed offset.
5. Duplicate events advance the offset but do not apply side effects again.

### Replay

1. `POST /api/cdc/replay` sets the committed offset to a requested value.
2. If requested, projections and idempotency state are cleared.
3. Subsequent polls rebuild projections from the log.

### Backfill

1. `POST /api/cdc/backfill` scans current source rows.
2. One `SNAPSHOT` event is appended per source row.
3. Polling applies snapshots like current-row upserts.

## Key Tradeoffs

- **Manual connector polling:** makes lag and catch-up explicit for the demo.
- **Single-process log:** keeps the POC runnable while still separating source, log, connector, and projections.
- **Sequence-based idempotency:** demonstrates duplicate defense without introducing a durable inbox table.
- **Snapshots as events:** backfill uses the same projection path as CDC events.
- **Projection rebuild via replay:** shows why offsets and replayability matter for derived stores.

## Failure Handling

The POC simulates:

- connector pause and growing lag
- duplicate delivery
- projection rebuild after offset reset
- backfill after projection drift
- deletes that remove downstream documents

The connector records duplicate events but still advances offsets so replay does not get stuck on already-seen deliveries.

## Scaling Path

A production implementation would add:

- a real database WAL/binlog reader
- Kafka, Pulsar, Kinesis, or another durable log
- connector leases and partitions
- durable offset storage
- schema registry and migration handling
- out-of-order and retry handling
- dead-letter queues for poison events
- projection-specific idempotency tables
- metrics for lag, apply latency, and projection freshness

## What Is Intentionally Simplified

- No real database transaction log.
- No external broker.
- No distributed connector workers.
- No schema evolution.
- No partial projection failure or DLQ.
- No exactly-once processing guarantees.
- No authentication or tenant isolation.
