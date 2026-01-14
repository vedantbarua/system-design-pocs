# Improvements and Next Steps: Design Dropbox POC

## Core Behavior
- Add delta sync and per-device cursors.
- Implement file versioning and restore points.
- Add conflict handling with merge UI.
- Support file metadata tags and search.

## API & UX
- Add folder tree navigation and breadcrumbs.
- Provide file preview and diff views.
- Allow multi-file uploads and bulk actions.
- Add audit log for share activity.

## Reliability & Ops
- Persist files to S3 or a local disk store.
- Add background cleanup for expired share links.
- Add metrics for storage usage and share traffic.
- Add Dockerfile and CI workflow.

## Security
- Require authentication and per-user workspaces.
- Add allow-list/deny-list for share downloads.
- Add encryption-at-rest for file content.

## Testing
- Unit tests for TTL expiry and size limits.
- MVC tests for validation errors and API responses.
