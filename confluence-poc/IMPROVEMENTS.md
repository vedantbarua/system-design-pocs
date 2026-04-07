# Improvements

## Production Gaps

- Move spaces, pages, comments, and users into durable storage.
- Add authentication, permissions, and space-level access controls.
- Add attachments, page hierarchy, and richer content formatting capabilities.

## Reliability Improvements

- Add optimistic locking so concurrent page edits do not overwrite each other silently.
- Add durable audit history for edits, comments, and space changes.
- Add backup and restore semantics instead of relying on seed data after restart.

## Scaling Improvements

- Add indexed search and pagination for large page sets.
- Add caching and background indexing for hot spaces and queries.
- Add collaborative-editing or draft-locking primitives for higher write concurrency.

## Security Improvements

- Add role-based access control for spaces, pages, and comments.
- Add content sanitization and markdown or rich-text validation.
- Add audit trails for administrative changes and search access.

## Testing Improvements

- Add controller tests for create, update, search, and comment flows.
- Add service tests for version increments and recent-page ordering.
- Add UI tests for the editor, search, and space navigation flows.
