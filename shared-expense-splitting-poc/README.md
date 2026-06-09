# Shared Expense Splitting POC

Full-stack React, Node, and Express proof-of-concept for shared expenses between roommates, trips, couples, and teams.

## What It Covers

- Expense groups and members
- Integer-cent money calculations
- Equal, exact, percentage, and share-based splits
- Multiple payers on one expense
- Immutable ledger entries
- Expense edits through reversal and replacement
- Member balance projections
- Simplified settlement recommendations
- Repayment recording
- Recurring expenses
- Payment reminder generation
- Responsive operational dashboard

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
cd shared-expense-splitting-poc/backend
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
http://127.0.0.1:5176
```

## Testing

Backend domain tests:

```bash
cd backend
npm test
```

Frontend production build:

```bash
cd frontend
npm run build
```

## API

- `GET /api/health`
- `GET /api/groups`
- `GET /api/snapshot?groupId=...`
- `GET /api/ledger?groupId=...`
- `POST /api/expenses`
- `PUT /api/expenses/{expenseId}`
- `POST /api/expenses/{expenseId}/reverse`
- `POST /api/repayments`
- `POST /api/recurring/run`
- `POST /api/reminders/run`

## Demo Workflows

1. Switch between the apartment and trip groups.
2. Add an expense using equal, exact, percentage, or share-based splitting.
3. Add a second payer and specify their contribution.
4. Inspect projected member balances.
5. Record suggested repayments.
6. Generate the next recurring expense.
7. Queue payment reminders for members above the outstanding threshold.
8. Inspect immutable credit, debit, repayment, and reversal entries.

## Notes

- Backend state is in memory and resets when Node restarts.
- All money is stored and calculated in integer cents.
- The settlement algorithm greedily matches the largest debtors and creditors.
- Production persistence, authentication, and payment-provider integration are intentionally out of scope.
