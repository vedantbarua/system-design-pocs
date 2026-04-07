# Improvements

## Production Gaps

- Replace the single committed value with a real replicated log and conflict resolution.
- Persist node term, vote, and log state so restart behavior is meaningful.
- Add membership changes so nodes can join or leave the cluster.

## Reliability Improvements

- Add explicit network partition and delayed-heartbeat simulation.
- Add log consistency checks during leader changes and follower catch-up.
- Add crash-recovery tests that validate term and vote persistence.

## Scaling Improvements

- Separate simulated nodes into independent processes or containers.
- Add snapshotting and log compaction for longer-lived replicated state.
- Add cluster metrics for election frequency, heartbeat latency, and failover time.

## Security Improvements

- Add authentication and authorization for control endpoints like `kill-leader`.
- Add audit trails for topology and failure-injection actions.
- Restrict operational WebSocket streams to authorized viewers.

## Testing Improvements

- Add deterministic election tests for timeout, vote, and majority behavior.
- Add failure tests for repeated leader loss and follower recovery.
- Add UI integration tests for real-time cluster-state rendering.
