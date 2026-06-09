# Home Maintenance Reminder POC

Full-stack React, Node, and Express proof-of-concept for tracking recurring home maintenance, equipment health, warranties, service history, and reminder delivery.

## What It Covers

- Multiple properties, rooms, and installed assets
- Recurring date-based maintenance
- Usage-based service intervals
- Derived upcoming, due, overdue, completed, and skipped states
- Automatic next-service calculation
- Warranty and document expiry tracking
- Idempotent email reminder simulation
- Service vendors, notes, and integer-cent costs
- Monthly maintenance calendar
- Asset-health scoring
- Annual maintenance spending
- Responsive React operations dashboard

## Stack

- React 18
- Vite
- Lucide React
- Node.js
- Express
- Node built-in test runner

## Quick Start

Install dependencies:

```bash
cd home-maintenance-reminder-poc/backend
npm install

cd ../frontend
npm install
```

Start the API:

```bash
cd backend
npm start
```

Start the React application in another terminal:

```bash
cd frontend
npm run dev
```

Open:

```text
http://127.0.0.1:5177
```

## Testing

```bash
cd backend
npm test

cd ../frontend
npm run build
```

## API

- `GET /api/health`
- `GET /api/snapshot?propertyId=...&asOf=...`
- `GET /api/calendar?propertyId=...&month=...`
- `POST /api/assets`
- `POST /api/assets/{assetId}/documents`
- `POST /api/tasks`
- `POST /api/tasks/{taskId}/complete`
- `POST /api/tasks/{taskId}/skip`
- `POST /api/tasks/{taskId}/usage`
- `POST /api/reminders/run`

## Demo Workflows

1. Review overdue and due maintenance for Maple Street Home.
2. Complete the HVAC filter task and inspect its next due date.
3. Skip a recurring task for one cycle.
4. Add a new date-based maintenance task.
5. Switch to the cabin and inspect its usage-based generator service.
6. Run reminders for due tasks and the expiring water-heater warranty.
7. Review asset health, service history, annual spend, and the monthly calendar.

## Notes

- Backend state is in memory and resets when Node restarts.
- The demo date is fixed at June 9, 2026 so task states remain deterministic.
- Costs use integer cents.
- Reminder delivery is simulated; no external email or SMS provider is called.
