# Improvements and Next Steps: Google Docs POC

## Core Collaboration
- Add real-time cursor presence and typing indicators.
- Support change diffs and per-paragraph merges.
- Add suggestion mode with accept/reject flow.
- Enable document templates and cover pages.

## API & UX
- Add search across docs and comments.
- Provide per-document activity timeline.
- Allow comment threads and mentions.
- Add export to PDF/Markdown endpoints.

## Reliability & Ops
- Persist documents to a database or object store.
- Add background jobs for archiving old versions.
- Add metrics for edits, collaborators, and comment volume.
- Add Dockerfile and CI workflow.

## Security
- Add authentication and per-user workspaces.
- Support share links with permissions and expiry.
- Add audit log for document access.

## Testing
- Unit tests for role validation and version tracking.
- MVC tests for API validation errors.
