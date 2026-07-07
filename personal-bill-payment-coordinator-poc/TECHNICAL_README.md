# Technical README

## Architecture

```text
Bill/payment events -> Express API -> Kafka topic/fallback -> BillPaymentCoordinator
                                                |
                                                +-> Postgres event/snapshot tables
                                                +-> Redis latest snapshot cache
                                                +-> React dashboard
```

The backend runs without external services by default. `BILL_DATABASE_URL`, `BILL_REDIS_URL`, and `BILL_KAFKA_BROKERS` enable real adapters when available.

## Reliability Behaviors

- Duplicate bill events are ignored by `{billId}:{eventId}` keys.
- Out-of-order statement/payment updates are stored in the event log but ignored by the bill projection.
- Duplicate bills are detected by payee, account suffix, and due-date fingerprints.
- Bill scans detect due-soon bills, overdue balances, failed autopay, missing confirmations, duplicate bills, and changed statement amounts.
- Alerts and reminders are deduplicated by stable bill-oriented keys.
- Jobs support retry and dead-letter style status transitions.

## Tests

The test suite covers seeded state, idempotency, statement updates, stale update protection, duplicate bills, due reminders, overdue detection, autopay failures, scheduled/confirmed payments, reminder dedupe, dispatch, retention, job retries, and restore.
