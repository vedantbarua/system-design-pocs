# LedgerFlow Technical README

## Problem Statement

Small-business bookkeeping tools need to bring invoices, bank feed transactions, bills, reconciliation, and reporting into one coherent workflow. This POC models that workflow in a static browser app so the user can interact with the core product behavior without backend setup.

## Architecture Overview

The app is a single-page static application:

- `index.html` defines the view structure.
- `styles.css` provides the responsive desktop and mobile interface.
- `app.js` owns state, rendering, user events, derived financial metrics, and persistence.

State is loaded from `localStorage`, seeded when empty, then re-rendered after every write. The UI is deterministic and does not call external services.

## Core Data Model

The POC keeps three main collections:

- `invoices`: customer, service, due date, amount, and status.
- `transactions`: date, merchant, category, type, amount, and bank-match status.
- `bills`: vendor, category, due date, amount, and payment status.

An `audit` array records major user actions so the dashboard can show a traceable activity stream.

## Request or Event Flow

1. User submits a form or clicks an action button.
2. The handler updates the relevant collection.
3. Related side effects are applied. For example, invoice payment creates an income transaction; bill payment creates an expense transaction.
4. An audit event is prepended.
5. State is persisted to `localStorage`.
6. The app re-renders dashboard metrics, tables, reconciliation, and reports.

## Key Tradeoffs

- Vanilla JavaScript keeps the POC portable and dependency-free.
- Rendering is full-view refresh instead of component diffing because the dataset is intentionally small.
- Financial calculations are derived from current in-memory state rather than precomputed aggregates.
- Reconciliation suggestions use simple deterministic matching on vendor and amount.

## Failure Handling

- Invalid or unreadable `localStorage` data falls back to seeded demo data.
- Empty reconciliation selections show a toast instead of mutating state.
- Form inputs rely on native browser validation for required fields, date values, and positive amounts.

## Scaling Path

To turn this into a production-grade system:

- Move state to a backend ledger service with durable storage.
- Add double-entry journal entries for every financial event.
- Introduce idempotency keys for payment and bank-feed ingestion.
- Stream bank transactions into a reconciliation queue.
- Materialize reporting read models for profit and loss, balance sheet, and cash flow.
- Add role-based permissions and immutable audit logs.

## What Is Intentionally Simplified

- No authentication or company switching.
- No real bank feeds, payment rails, tax engine, or invoice delivery.
- No double-entry ledger, chart of accounts hierarchy, accrual rules, or close-period locking.
- No server-side persistence or multi-user collaboration.
