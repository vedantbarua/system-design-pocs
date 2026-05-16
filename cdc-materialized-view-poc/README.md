# CDC Materialized View POC

A Spring Boot proof-of-concept for Change Data Capture, connector offsets, replay, backfill, duplicate delivery, and downstream materialized views.

## Goal

Show how a source-of-truth table can emit an append-only change stream that keeps separate read models in sync while making lag, replay, and idempotency visible.

## What It Covers

- Source `orders` table simulated in memory
- Append-only CDC log with `INSERT`, `UPDATE`, `DELETE`, and `SNAPSHOT` events
- Connector state with pause/resume, committed offset, latest sequence, and lag
- Poll-based event application into downstream projections
- Idempotency using original event sequence tracking
- Duplicate delivery injection
- Replay from a chosen offset
- Backfill that emits snapshot events for current source rows
- Downstream projections:
  - order summary view
  - customer totals view
  - search index view
- Operational dashboard for source rows, change log, connector state, projections, and audit events

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd cdc-materialized-view-poc
   mvn spring-boot:run
   ```
3. Open `http://localhost:8159`.

## UI Flows

- Create a source order and watch CDC lag increase until the connector polls.
- Pause the connector, create/update/delete orders, then resume and poll to catch up.
- Inject a duplicate event and verify the connector records it without double-applying projections.
- Reset offset to `0`, clear projections, and poll to rebuild read models from the change log.
- Run a backfill to emit `SNAPSHOT` events for all current source rows.
- Delete an order and verify the order summary and search index remove it after polling.

## JSON Endpoints

- `GET /api/snapshot` inspect source orders, change log, connector state, projections, and events
- `POST /api/orders` create a source order and append an `INSERT`
- `PATCH /api/orders/{orderId}` update a source order and append an `UPDATE`
- `DELETE /api/orders/{orderId}` mark an order deleted and append a `DELETE`
- `POST /api/cdc/poll` apply pending CDC events to projections
- `POST /api/cdc/pause` pause the connector
- `POST /api/cdc/resume` resume the connector
- `POST /api/cdc/duplicate` append a duplicate delivery for an existing event
- `POST /api/cdc/replay` reset offset and optionally clear projections
- `POST /api/cdc/backfill` append `SNAPSHOT` events for current source rows

Example create request:

```json
{
  "customerId": "customer-3",
  "sku": "sku-desk",
  "quantity": 1,
  "unitPrice": 499.00
}
```

Example update request:

```json
{
  "sku": "sku-desk",
  "quantity": 2,
  "unitPrice": 479.00,
  "status": "PAID"
}
```

Example poll request:

```json
{
  "maxEvents": 5
}
```

Example replay request:

```json
{
  "fromOffset": 0,
  "clearProjections": true
}
```

## Configuration

- `server.port` defaults to `8159`
- `cdc.default-batch-size` controls default poll size
- `cdc.history-limit` controls retained audit events

## Notes and Limitations

- All state is in memory and resets on restart.
- The source table, change log, connector, and projections live in one process for inspectability.
- Deletes are represented as row tombstones in the source map.
- The connector is manual rather than scheduled so lag and replay are obvious.
- Duplicate detection is sequence-based, not based on a durable inbox table.
- There is no schema registry, real database log, Kafka, Debezium, or external search engine.

## Technologies Used

- Spring Boot 3.2
- Spring MVC
- Thymeleaf
- Java 17
- JUnit 5
- In-memory source table, CDC log, connector, and projections
