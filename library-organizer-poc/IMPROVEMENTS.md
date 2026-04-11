# Library Organizer Improvements

## Production Gaps

- Add durable persistence for books, shelves, holds, loans, patrons, and event history.
- Model individual copies separately from bibliographic records so multiple copies of the same title can circulate independently.
- Add ISBN import and metadata enrichment from trusted catalog sources.
- Add barcode scanning flows for intake, checkout, return, and shelf audit.
- Add branch, floor, aisle, bay, and bin-level location hierarchy.

## Reliability Improvements

- Use database transactions for checkout, return, and hold promotion.
- Add optimistic concurrency checks to prevent double checkout under concurrent requests.
- Persist events to an append-only audit table.
- Add retryable outbox events for notifications such as hold-ready emails.
- Add background jobs for expired holds, overdue notices, and shelf audit reconciliation.

## Scaling Improvements

- Move search to a real full-text index with relevance tuning, synonyms, typo tolerance, and faceting.
- Partition operational data by branch or library system.
- Cache hot catalog searches while invalidating by book update events.
- Add queue-backed shelf rebalance work orders for high-volume intake days.
- Stream circulation events into analytics for demand forecasting and collection planning.

## Security Improvements

- Add staff authentication and role-based authorization.
- Separate patron PII from operational book state.
- Add audit logging for staff actions such as hold release and reclassification.
- Validate and sanitize all imported metadata.
- Add rate limits to public search and patron-facing hold endpoints.

## Testing Improvements

- Add backend unit tests for search indexing, shelf placement, hold promotion, and checkout conflicts.
- Add API integration tests for the full circulation lifecycle.
- Add frontend component tests for form validation and error rendering.
- Add browser tests for core demo flows.
- Add concurrency tests for simultaneous checkout and hold creation.
