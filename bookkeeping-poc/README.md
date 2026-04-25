# LedgerFlow Bookkeeping POC

LedgerFlow is an interactive bookkeeping application POC with QuickBooks-style workflows for invoices, transactions, bills, reconciliation, and financial reports.

## Goal

Demonstrate a user-friendly small-business bookkeeping workspace that turns common accounting tasks into guided, visible flows.

## What It Covers

- Dashboard with bank balance, receivables, payables, overdue risk, cash flow chart, queue, and audit timeline
- Invoice creation, payment recording, and overdue filtering
- Transaction register with search, categorization, matching, and bank-feed status
- Vendor bill scheduling and payment posting
- Reconciliation workflow with suggested matches and selected item matching
- Reports for profit and loss, expense mix, and aging
- Local browser persistence via `localStorage`

## Quick Start

Open `index.html` in a browser:

```bash
open bookkeeping-poc/index.html
```

No package install or server is required.

## UI Flows

1. Use the dashboard to review cash position, open work, and recent audit events.
2. Create an invoice from the Invoices tab, then record payment to post a matched income transaction.
3. Add and categorize bank transactions from the Transactions tab.
4. Schedule a vendor bill, then pay it to create a matched expense transaction.
5. Use Reconcile to mark unmatched bank feed items as matched.
6. Review profit and loss, category spending, and aging from Reports.

## JSON or WebSocket Endpoints

This POC is frontend-only. There are no HTTP or WebSocket endpoints.

## Configuration

No runtime configuration is required. Demo data is stored under the `ledgerflow-bookkeeping-poc` key in browser `localStorage`.

## Notes and Limitations

- This is not an accounting engine and does not implement double-entry ledger posting.
- Dates are seeded around April 24, 2026 for deterministic demo behavior.
- Data is per-browser and can be reset with the Reset demo data button.
- Authentication, bank integrations, tax rules, and audit-grade exports are intentionally omitted.

## Technologies Used

- HTML
- CSS
- Vanilla JavaScript
- Canvas for the cash flow chart
- Browser `localStorage`
