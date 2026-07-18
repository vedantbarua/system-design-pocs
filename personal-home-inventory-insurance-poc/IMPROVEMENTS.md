# Production Improvements

## Product

- Add photo and receipt upload flows with object storage.
- Support barcode, serial-number, and receipt OCR ingestion.
- Add household members, rooms, labels, and shared ownership.
- Add insurance export templates for renters, homeowners, and scheduled personal property riders.
- Add renewal reminders for appraisals, policy updates, and stale high-value records.

## Backend

- Replace full snapshots with event-sourced projections and periodic compacted snapshots.
- Add schema validation for all event payloads.
- Add optimistic concurrency for item updates.
- Split projections for item search, proof coverage, policy readiness, and exports.
- Add signed export downloads with expiration.

## Data

- Normalize categories, brands, models, rooms, and owners.
- Add full-text and faceted search for large inventories.
- Track valuation source, confidence, and market-change history.
- Add retention policies for archived items and old export bundles.

## Reliability

- Move retry attempts to durable job storage.
- Add dead-letter handling for invalid Kafka events.
- Add consumer lag and projection freshness metrics.
- Add object checksum verification for uploaded proof files.
- Add load tests for large households and long event histories.

## Security

- Add authentication and household-level authorization.
- Encrypt proof metadata and policy identifiers at rest.
- Use malware scanning for uploaded documents and images.
- Add audit views for exports and proof access.
- Separate read-only, item-editor, and export-capable roles.
