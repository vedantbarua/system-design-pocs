# Library Organizer POC

Node, Express, and React proof-of-concept for a library operations board that catalogs books, assigns shelf placement, manages holds and loans, maintains a search index, and surfaces shelf capacity pressure.

## Goal

Demonstrate how a library organizer can coordinate catalog intake, circulation state, shelf assignment, lightweight indexing, and rebalance planning without a database or external search engine.

## What It Covers

- Book intake with category-based shelf placement and call-number generation
- In-memory inverted index for title, author, category, and tag search
- Circulation workflow for checkout, return, holds, and hold release
- First-waiting-hold promotion when a checked-out book returns
- Shelf utilization metrics and rebalance recommendations
- Event log for catalog, circulation, hold, and reclassification actions
- React dashboard for operational visibility and demo controls

## Quick Start

1. Start the backend:
   ```bash
   cd library-organizer-poc/backend
   npm install
   npm run dev
   ```
2. Start the frontend:
   ```bash
   cd library-organizer-poc/frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:5179`.

The backend listens on `http://localhost:8134`, and the frontend proxies `/api` to it.

## UI Flows

- Search the catalog by title, author, tag, or domain term.
- Add a new book and watch it receive a shelf, category prefix, and call number.
- Select an available book, check it out to a patron, then return it.
- Place a hold on an available or checked-out book and release holds from the hold queue.
- Reclassify a book to another category and watch its call number and shelf placement change.
- Add books into a category until shelf pressure triggers a rebalance recommendation.
- Reset demo data to restore the seeded catalog and sample circulation state.

## JSON Endpoints

- `GET /api/health`
- `GET /api/categories`
- `GET /api/metrics`
- `GET /api/books`
- `GET /api/books?category=technology&status=available`
- `GET /api/books/search?q=systems`
- `POST /api/books`
- `POST /api/books/:id/reclassify`
- `POST /api/books/:id/checkout`
- `POST /api/books/:id/return`
- `POST /api/books/:id/holds`
- `GET /api/holds`
- `POST /api/holds/:id/release`
- `GET /api/loans`
- `GET /api/events`
- `POST /api/seed`

Example book intake request:

```json
{
  "title": "The Staff Engineer's Path",
  "author": "Tanya Reilly",
  "category": "technology",
  "publishedYear": 2022,
  "tags": ["software", "leadership"],
  "condition": "good"
}
```

Example checkout request:

```json
{
  "patronName": "Alex Rivera"
}
```

## Configuration

- `PORT` controls the backend port and defaults to `8134`.
- `LOAN_DAYS` is fixed at 21 days in code for the POC.
- Shelf categories, capacities, and seeded books are initialized in `backend/server.js`.
- All data is in memory and resets when the backend restarts or `/api/seed` is called.

## Notes and Limitations

- There is no persistent database, authentication, or patron identity system.
- Search uses a simple in-memory inverted index, not a ranked external search service.
- Call numbers are deterministic enough for the demo but not a full Dewey or Library of Congress implementation.
- Shelf rebalancing produces recommendations only; it does not model physical carts, branches, or staff work orders.
- Holds and loans do not enforce fines, renewals, pickup expiry, or patron eligibility.

## Technologies Used

- Node.js
- Express
- React
- Vite
