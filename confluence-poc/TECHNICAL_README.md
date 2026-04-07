# Technical README

## Problem Statement

A knowledge hub has to organize content into spaces, track edits over time, support lightweight discussion, and help users rediscover information through search and recent activity. This POC focuses on that content-management core in a single-process design.

## Architecture Overview

The backend is a Spring Boot API with one in-memory service layer that owns all application state:

- spaces group pages
- pages store title, body, labels, version, and publication status
- comments are stored per page
- users are seeded for author and editor selection

The frontend is a React application that loads spaces, pages, users, and recent activity, then drives create, update, comment, and search flows through the API.

## Core Data Model

- `Space`: id, key, name, owner, created time, and list of page ids
- `Page`: id, space id, title, body, labels, status, version, editor, and last-updated timestamp
- `Comment`: id, page id, author, text, and creation time
- `User`: simple seeded directory entry used by the UI

## Request and Event Flow

### Space and page flow

1. The UI loads spaces and selects an active space.
2. Listing pages for that space returns the newest pages first.
3. Creating a page assigns it to the active space, sets version `1`, and stores labels plus author.

### Edit flow

1. The UI fetches a page and populates the editor.
2. Saving a page updates title, body, labels, status, and editor.
3. The backend increments the version and updates the last-edited timestamp.

### Comment and discovery flow

1. Comments are stored per page and returned oldest-first.
2. Search scans title, body, and labels for substring matches.
3. Recent pages are derived from last-updated ordering across all spaces.

## Key Tradeoffs

- In-memory maps keep the system small and easy to explain, but there is no durability or concurrency control.
- Page versioning is simple increment-on-save rather than diff-based history.
- Search is fast to implement with substring checks, but it does not model indexing or ranking.
- Seed data improves demo quality, but real systems need permissions, workflows, and richer activity tracking.

## Failure Handling

- Missing spaces or pages return errors through the service layer.
- Invalid or empty optional fields are normalized rather than rejected aggressively.
- Restart clears all runtime state and re-seeds the demo workspace.

## Scaling Path

To move toward production:

- persist spaces, pages, comments, and users in a database
- add full-text indexing and ranked search
- introduce document-history snapshots or diffs
- add permissions, drafts, approvals, and audit trails
- support collaborative editing and conflict resolution

## What Is Intentionally Simplified

- one process and one in-memory dataset
- no authentication or permissions
- no real-time collaboration
- no attachments, mentions, or notification flows
- no page hierarchy beyond spaces containing pages
