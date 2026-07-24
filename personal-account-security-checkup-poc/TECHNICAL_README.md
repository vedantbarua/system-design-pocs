# Technical Notes

## Architecture

The API owns a single `AccountSecurityCheckup` domain model. Events enter through HTTP or Kafka, are deduplicated by `accountId:eventId`, applied to the in-memory projection, and persisted as a snapshot plus event rows when Postgres is configured.

Adapters are intentionally small:

- Kafka publishes/consumes account security events, or buffers messages in memory.
- Postgres stores `account_security_snapshots` and `account_security_events`.
- Redis stores the latest serialized snapshot.
- In-memory mode keeps the POC runnable without local infrastructure.

## Domain Model

Primary entities:

- `Account`: provider, username, category, domain, importance, MFA state, recovery metadata, password age metadata, active sessions, risk score, and status.
- `BreachFinding`: open or resolved breach findings imported from manual or scheduled feeds.
- `RecoveryChecklist`: exportable account recovery checklist metadata with checksum.
- `Alert`: deduped security issue such as missing MFA, incomplete recovery, stale password, open breach, duplicate account, session spike, or export readiness.
- `Job`: retryable background work for scans, breach imports, checklist exports, reminders, and retention.
- `Audit`: append-only UI-visible action history.

## Event Handling

Supported events:

- `ACCOUNT_ADDED`
- `ACCOUNT_UPDATED`
- `MFA_ENABLED`
- `MFA_DISABLED`
- `RECOVERY_UPDATED`
- `PASSWORD_ROTATED`
- `BREACH_IMPORTED`
- `SESSION_REVOKED`
- `ACCOUNT_ARCHIVED`
- `EXPORT_REQUESTED`
- `SECURITY_SCAN`

Each event is normalized into a full `AccountEvent`. If the event timestamp is older than the account's `updatedAt`, the event is recorded but not applied to the current projection.

## Risk Scoring

`calculateRisk()` uses account importance plus operational risk factors:

- missing MFA
- weaker SMS MFA
- missing recovery email or phone
- password age over 180 days
- stale login activity
- high active session count
- open breach findings

The dashboard converts average risk into a readiness score.

## Security Scan

`scanSecurity()` evaluates active accounts for:

- duplicate records by normalized domain and username
- open breach findings
- missing MFA
- incomplete recovery methods
- stale passwords
- session spikes

Alerts use deterministic dedupe keys so repeated scans do not flood the queue.

## Job Semantics

Jobs are deduped per kind and hour. A job can be forced to fail with `/api/jobs/fail-next`, then the next dispatch moves it to `RETRY`. The following dispatch completes it unless another failure is armed.

Job kinds:

- `SECURITY_SCAN`
- `BREACH_IMPORT`
- `CHECKLIST_EXPORT`
- `REMINDER_DISPATCH`
- `RETENTION`

## Failure Modes Covered

- Duplicate event delivery
- Late event delivery
- Duplicate account records
- Missing MFA and incomplete recovery metadata
- Open breach findings
- Session spikes
- Retryable job failure
- Snapshot export/import recovery
