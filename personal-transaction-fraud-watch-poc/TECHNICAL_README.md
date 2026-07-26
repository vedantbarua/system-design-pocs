# Technical Notes

## Architecture

The API owns a single `TransactionFraudWatch` domain model. Events enter through HTTP or Kafka, are deduplicated by `transactionId:eventId`, applied to the in-memory projection, and persisted as a snapshot plus event rows when Postgres is configured.

Adapters are intentionally small:

- Kafka publishes/consumes fraud events, or buffers messages in memory.
- Postgres stores `fraud_watch_snapshots` and `fraud_watch_events`.
- Redis stores the latest serialized snapshot.
- In-memory mode keeps the POC runnable without local infrastructure.

## Domain Model

Primary entities:

- `Card`: card metadata, home country, frozen state, and daily limit.
- `Transaction`: merchant, category, amount, location, status, risk score, risk reasons, and duplicate fingerprint.
- `FraudRules`: threshold and velocity-window configuration.
- `Alert`: deduped fraud issue such as high risk, duplicate transaction, velocity spike, large transaction, location anomaly, merchant anomaly, card freeze, or dispute.
- `Job`: retryable background work for scans, velocity rebuilds, alert dispatch, and retention.
- `Audit`: append-only UI-visible action history.

## Event Handling

Supported events:

- `TRANSACTION_AUTHORIZED`
- `TRANSACTION_SETTLED`
- `TRANSACTION_DECLINED`
- `TRANSACTION_MARKED_SAFE`
- `DISPUTE_OPENED`
- `CARD_FROZEN`
- `CARD_UNFROZEN`
- `RISK_SCAN`

Each event is normalized into a full `FraudEvent`. If the event timestamp is older than the transaction's `updatedAt`, the event is recorded but not applied to the current projection.

## Risk Scoring

`calculateRisk()` evaluates:

- large transaction thresholds
- foreign location relative to card home country
- high-risk merchant categories
- frozen-card state
- velocity windows over recent transactions
- duplicate transaction fingerprints
- card daily limit overages

The dashboard converts average active transaction risk into a readiness score.

## Duplicate And Velocity Detection

Transaction fingerprints use card id, normalized merchant, amount, currency, and event minute. This models duplicate authorization detection without requiring raw bank identifiers.

Velocity windows count non-declined transactions for a card within a configurable number of minutes. If the count crosses the configured threshold, the system adds a velocity risk reason and emits a deduped alert.

## Job Semantics

Jobs are deduped per kind and hour. A job can be forced to fail with `/api/jobs/fail-next`, then the next dispatch moves it to `RETRY`. The following dispatch completes it unless another failure is armed.

Job kinds:

- `RISK_SCAN`
- `VELOCITY_REBUILD`
- `ALERT_DISPATCH`
- `RETENTION`

## Failure Modes Covered

- Duplicate event delivery
- Late event delivery
- Duplicate transaction authorizations
- Velocity spikes
- Foreign location anomalies
- High-risk merchant categories
- Card freeze and dispute workflows
- Retryable job failure
- Snapshot export/import recovery
