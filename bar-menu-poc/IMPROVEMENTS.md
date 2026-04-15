# Bar Menu POC Improvements

## Production Gaps

- Store drinks, recipes, sessions, and events in durable storage.
- Add menu administration for creating seasonal drinks and updating recipes.
- Add order grouping so multiple drinks can belong to the same ticket.
- Track bartender assignment and station routing.

## Reliability Improvements

- Add optimistic locking or session version checks for concurrent step changes.
- Make transition requests idempotent with request IDs.
- Persist the event log before mutating external systems such as inventory.
- Add graceful recovery so active sessions resume after restart.

## Scaling Improvements

- Move live helper updates to WebSockets or Server-Sent Events.
- Partition active sessions by bar location or station.
- Publish prep events to a message broker for analytics and display screens.
- Cache static menu data behind an invalidation strategy.

## Security Improvements

- Add authentication for bartenders and managers.
- Validate permissions for menu edits and session controls.
- Rate-limit JSON transition endpoints.
- Add CSRF handling for production form workflows.

## Testing Improvements

- Add service tests for all state transitions.
- Add controller tests for UI and JSON error cases.
- Add browser tests for the helper workflow.
- Add concurrency tests for simultaneous Next and Reset actions.
