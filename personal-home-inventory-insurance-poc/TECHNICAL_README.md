# Technical Notes

## Architecture

The API owns a single `HomeInventoryInsurance` domain model. Events enter through HTTP or Kafka, are deduplicated by `itemId:eventId`, applied to the in-memory projection, and persisted as a snapshot plus event rows when Postgres is configured.

Adapters are intentionally small:

- Kafka publishes/consumes inventory events, or buffers messages in memory.
- Postgres stores `inventory_snapshots` and `inventory_events`.
- Redis stores the latest serialized snapshot.
- In-memory mode keeps the POC runnable without local infrastructure.

## Domain Model

Primary entities:

- `InventoryItem`: household item, location, owner, value, serial number, proof links, policy link, coverage limit, and status.
- `Proof`: receipt, photo, appraisal, serial card, or manual proof metadata with a checksum.
- `Policy`: insurance policy or rider with limits, deductible, and covered categories.
- `ExportBundle`: insurance-ready item export with total value and checksum.
- `Alert`: deduped operational issue such as missing proof, duplicate item, underinsurance, policy gap, stale valuation, or export readiness.
- `Job`: retryable background work for scans, valuation refreshes, exports, reminders, and retention.
- `Audit`: append-only UI-visible action history.

## Event Handling

Supported events:

- `ITEM_ADDED`
- `ITEM_UPDATED`
- `LOCATION_MOVED`
- `PROOF_ATTACHED`
- `VALUATION_UPDATED`
- `COVERAGE_UPDATED`
- `ITEM_ARCHIVED`
- `EXPORT_REQUESTED`
- `INVENTORY_SCAN`

Each event is normalized into a full `InventoryEvent`. If the event timestamp is older than the item's `updatedAt`, the event is recorded but not applied to the current item projection.

## Inventory Scan

`scanInventory()` evaluates active items for:

- duplicate records using category plus serial number, or category plus normalized name
- missing proof for items valued at `$500` or more
- policy gaps when no policy covers the item's category
- underinsurance when replacement value exceeds item coverage
- stale valuations when item metadata has not changed in more than 180 days

Alerts use deterministic dedupe keys so repeated scans do not flood the queue.

## Export Generation

`generateExport()` creates an insurance-ready bundle containing item count, total replacement value, generation time, and a checksum over item ids, replacement values, and proof ids. This models a claim-prep or policy-review export without storing real files.

## Job Semantics

Jobs are deduped per kind and hour. A job can be forced to fail with `/api/jobs/fail-next`, then the next dispatch moves it to `RETRY`. The following dispatch completes it unless another failure is armed.

Job kinds:

- `INVENTORY_SCAN`
- `VALUATION_REFRESH`
- `EXPORT_GENERATION`
- `REMINDER_DISPATCH`
- `RETENTION`

## Failure Modes Covered

- Duplicate event delivery
- Late event delivery
- Duplicate item records
- Missing proof of ownership
- Underinsured replacement value
- Policy category gaps
- Stale valuations
- Retryable job failure
- Snapshot export/import recovery
