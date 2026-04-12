# Library Organizer Technical README

## Problem Statement

Libraries need more than catalog CRUD. A useful organizer has to place books predictably, keep circulation state consistent, support discovery, and tell staff when shelf capacity is becoming a physical operations problem.

This POC models those workflows in memory so the system behavior is easy to inspect from a browser and through JSON APIs.

## Architecture Overview

The system has two runtime components:

- Express backend on port `8134`
- Vite React frontend on port `5179`

The backend owns all state:

- `books` stores catalog entries and current circulation status.
- `shelves` stores category shelves, capacity, zone, and ordered book IDs.
- `searchIndex` maps normalized tokens to book IDs.
- `holds` stores waiting, ready, and released holds.
- `loans` stores active and returned checkouts.
- `events` stores bounded operational history.

The frontend polls the backend every 2.5 seconds and renders the current operational state. This keeps the POC simple while still making state transitions visible.

## Core Data Model

Book:

- `id`
- `title`
- `author`
- `category`
- `publishedYear`
- `tags`
- `condition`
- `status`: `available`, `checked_out`, `on_hold`, or `processing`
- `shelfId`
- `callNumber`

Shelf:

- `id`
- `category`
- `name`
- `zone`
- `capacity`
- `bookIds`

Hold:

- `id`
- `bookId`
- `patronName`
- `status`: `waiting`, `ready`, or `released`
- timestamps for creation, readiness, and release

Loan:

- `id`
- `bookId`
- `patronName`
- `checkedOutAt`
- `dueAt`
- `status`: `active` or `returned`

## Request And Event Flow

### Book Intake

1. `POST /api/books` validates title and author.
2. The backend creates a book with `processing` status.
3. `placeBook` selects the category shelf, generates a call number, sorts the shelf by call number, marks the book available, and updates the inverted search index.
4. A `catalog.placed` event records placement details and shelf pressure.

### Search

1. `GET /api/books/search?q=...` tokenizes the query.
2. Exact token matches receive higher score than partial token matches.
3. Results are sorted by score and enriched with active loan and hold counts.

### Checkout

1. `POST /api/books/:id/checkout` verifies the book is currently available.
2. A 21-day loan is created.
3. The book moves to `checked_out`.
4. A `circulation.checked_out` event is emitted.

### Return

1. `POST /api/books/:id/return` closes the active loan if present.
2. The oldest waiting hold is promoted to `ready` when one exists.
3. If no hold exists, the book returns to `available`.
4. The backend emits either `holds.ready` or `circulation.returned`.

### Reclassification

1. `POST /api/books/:id/reclassify` validates the target category.
2. The book is removed from its existing shelf.
3. It is placed into the new category shelf.
4. The call number and search index are rebuilt.

## Key Tradeoffs

- Polling is used instead of WebSockets because the POC has a low event rate and benefits from fewer moving parts.
- The search index is kept in memory so index mutation is transparent and easy to reset.
- Shelf placement is category-first, then call-number sorted. This is simple and deterministic, but not a full library classification standard.
- Holds are FIFO per book. This demonstrates reservation ordering without patron policy complexity.

## Failure Handling

- Invalid book intake returns `400`.
- Checkout of a non-available book returns `409`.
- Unknown books or holds return `404`.
- Error responses are JSON and shown in the React UI.
- The event log is bounded to avoid unbounded memory growth during long demo sessions.

## Scaling Path

Production-ready evolution would split responsibilities:

- Store books, shelves, holds, and loans in a relational database.
- Add optimistic concurrency or row-level locking around checkout, return, and hold promotion.
- Move search indexing to Elasticsearch, OpenSearch, Meilisearch, or Postgres full-text search.
- Represent shelf movement as work orders assigned to staff.
- Publish circulation events to a broker for notifications, analytics, and audit consumers.
- Add branch, section, and copy-level inventory models.

## What Is Intentionally Simplified

- No durable persistence.
- No user accounts, authentication, or authorization.
- No barcode scanning or ISBN metadata import.
- No branch transfers or interlibrary loan.
- No renewals, fines, pickup expiry, lost-item handling, or damaged-item workflows.
- No real classification taxonomy beyond category prefixes.
