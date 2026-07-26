# Production Improvements

## Product

- Add bank/card provider import using OAuth-style account linking.
- Add user notification preferences for SMS, email, and push.
- Add merchant allowlists, travel notices, and card-specific risk rules.
- Add explainability views for every score contribution.
- Add a dispute evidence workflow with document attachments.

## Backend

- Replace full snapshots with event-sourced projections and periodic compacted snapshots.
- Add schema validation for all event payloads.
- Add optimistic concurrency for user actions.
- Split projections for transaction stream, card state, risk windows, alerts, and audits.
- Add feature-flagged rule rollouts and shadow scoring.

## Data

- Store provider transaction ids and authorization ids when available.
- Normalize merchants and geolocation metadata.
- Track rule versions used for each risk score.
- Add retention policies for old transactions, alerts, and audits.

## Reliability

- Move retry attempts to durable job storage.
- Add dead-letter handling for invalid Kafka events.
- Add consumer lag and projection freshness metrics.
- Add load tests for bursty transaction streams.
- Add replay tests to prove deterministic scoring across rule versions.

## Security

- Add authentication and user-level authorization.
- Tokenize card identifiers and avoid storing full PANs.
- Encrypt sensitive transaction metadata at rest.
- Add field-level redaction in logs and audit events.
- Add rate limiting and abuse detection around event ingestion.
