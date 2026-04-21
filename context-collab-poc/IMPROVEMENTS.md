# Context Collab Improvements

## Production Gaps

- Replace snapshot JSON writes with SQLite transactions and branch revision checks.
- Add a real pull workflow that imports branch files from another local checkout or remote server.
- Add explicit review states: proposed, accepted, rejected, superseded, and archived.
- Add workspace membership, user identity, and branch permissions.
- Add bundle curation filters by type, confidence, file path, owner, source, and recency.

## Reliability Improvements

- Use atomic file writes or database transactions to prevent partial branch snapshots.
- Add schema validation for every workspace, branch, item, merge, and bundle file.
- Add branch revision numbers to detect concurrent edits.
- Add backup and restore commands for `.context-collab`.
- Add better import failure reporting for malformed JSONL session files.

## Scaling Improvements

- Move from local files to SQLite for single-user local mode.
- Move from SQLite to Postgres for team server mode.
- Add pagination for timelines, branches, audit events, and item lists.
- Add inverted indexes for file references, symbols, owners, and context type.
- Add WebSocket updates for branch changes and merge review events.

## Security Improvements

- Add authentication for shared server mode.
- Add authorization rules for workspace, branch, merge, and bundle operations.
- Scrub secrets from imported sessions before storing context items.
- Add signed provenance metadata for exported bundles.
- Add configurable retention policies for raw imported transcript fragments.

## Testing Improvements

- Add API integration tests for every endpoint.
- Add CLI snapshot tests for common workflows.
- Add browser tests for seed, merge preview, accepted merge, and bundle export flows.
- Add fixture-based session import tests for Codex JSONL, Markdown notes, and generic JSON exports.
- Add concurrency tests before introducing shared server mode.
