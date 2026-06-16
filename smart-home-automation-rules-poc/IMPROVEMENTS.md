# Improvements

## Production Gaps

- Move Kafka consumers and command workers out of the API process.
- Persist rules as versioned database records instead of seeded in-memory definitions.
- Add user accounts, household membership, and role-based rule editing.
- Add real smart-device vendor adapters with secrets stored in a managed vault.
- Add event schema validation before rule evaluation.

## Reliability Improvements

- Add DLQ topics for invalid events and permanently failed commands.
- Add command leases so multiple workers cannot dispatch the same command.
- Store command idempotency keys in Redis with explicit TTLs.
- Add exponential backoff and jitter for device retries.
- Persist command status transitions as immutable events.

## Scaling Improvements

- Partition Kafka topics by household ID or device ID.
- Introduce a materialized device-state read model per household.
- Add rule precompilation for faster evaluation.
- Use Redis sorted sets for delayed retry scheduling.
- Split audit storage from hot dashboard state.

## Security Improvements

- Add signed device acknowledgements.
- Add allowlists for high-risk commands like valve shutoff or garage close.
- Require step-up confirmation for rule changes affecting safety-critical devices.
- Add per-rule ownership and change-review workflow.
- Encrypt vendor integration tokens and rotate them automatically.

## Testing Improvements

- Add API integration tests against Express routes.
- Add Kafka contract tests with a real broker in CI.
- Add property tests for condition evaluation and cooldown windows.
- Add browser tests for dashboard workflows.
- Add chaos tests for worker crashes between send and acknowledgement.
