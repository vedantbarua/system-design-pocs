# Returns and Refunds Tracker POC

React, Node.js, Express, PostgreSQL, and Redis proof-of-concept for tracking return deadlines, reverse shipments, merchant decisions, and payment-provider refunds as one reconciled workflow.

## Goal

Demonstrate how a practical returns system coordinates state across purchases, merchants, carriers, and payment providers without double-refunding customers or letting stale webhooks regress a case.

## What It Covers

- Purchases, receipts, orders, and line items
- Return-window and ship-by countdowns
- Full, partial, and multi-item returns
- Return authorization and inspection states
- Reverse-shipment tracking
- Merchant, carrier, and payment-provider webhooks
- Duplicate webhook suppression
- Out-of-order event auditing
- Partial-refund reconciliation
- Integer-cent financial calculations
- Refund caps based on approved merchandise
- SLA risk and breach alerts
- PostgreSQL snapshot and event-log persistence
- Redis deduplication, hot snapshots, and event streams
- Responsive React operations dashboard

## Quick Start

Install dependencies:

```bash
cd returns-refunds-tracker-poc/backend
npm install

cd ../frontend
npm install
```

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Run the API with infrastructure:

```bash
cd backend
RETURNS_DATABASE_URL=postgresql://returns:returns@127.0.0.1:5432/returns_refunds \
RETURNS_REDIS_URL=redis://127.0.0.1:6379 \
npm start
```

Run without infrastructure:

```bash
cd backend
RETURNS_DATABASE_URL=memory:// RETURNS_REDIS_URL=memory:// npm start
```

Start the React application:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5180`.

## UI Flows

1. Review open cases ordered by SLA risk.
2. Open a return to inspect line items, receipt data, deadlines, and its event timeline.
3. Create a new return from an eligible purchase.
4. Simulate merchant authorization, receipt, approval, or rejection.
5. Simulate reverse-carrier scans.
6. Post partial and final payment-provider refunds.
7. Reuse a provider event ID to demonstrate idempotency.
8. Backdate an event to demonstrate out-of-order protection.
9. Inspect the refund ledger and provider event audit.

## JSON Endpoints

- `GET /api/health`
- `GET /api/snapshot?asOf=2026-06-11`
- `GET /api/returns/{returnId}`
- `POST /api/returns`
- `POST /api/returns/{returnId}/transition`
- `POST /api/webhooks/merchant`
- `POST /api/webhooks/carrier`
- `POST /api/webhooks/refund`
- `POST /api/alerts/refresh`
- `POST /api/reset`

Example refund webhook:

```json
{
  "eventId": "evt-refund-4108",
  "provider": "stripe",
  "providerRefundId": "re_4108",
  "returnId": "return-blender",
  "amountCents": 2999,
  "occurredAt": "2026-06-11T16:00:00Z"
}
```

## Configuration

- `PORT` defaults to `8179`
- `HOST` defaults to `127.0.0.1`
- `RETURNS_DATABASE_URL` defaults to `memory://`
- `RETURNS_REDIS_URL` defaults to `memory://`
- Both infrastructure URLs must be configured to enable PostgreSQL and Redis mode
- Redis webhook dedupe keys expire after seven days
- The Redis operational stream is approximately capped at 1,000 events

## Testing

```bash
cd backend
npm test

cd ../frontend
npm run build
```

## Notes and Limitations

- Merchant, carrier, receipt, and payment integrations are simulated.
- Memory mode resets when the API restarts.
- PostgreSQL stores a JSONB domain snapshot plus a separate immutable provider-event log.
- The demo clock is fixed at June 11, 2026 for deterministic SLA states.
- Authentication, receipt file uploads, taxes, and foreign exchange are intentionally omitted.

## Technologies Used

- React 18
- Vite
- Lucide React
- Node.js
- Express
- PostgreSQL
- Redis
- Node built-in test runner
