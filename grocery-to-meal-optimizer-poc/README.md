# Grocery-to-Meal Optimizer POC

Node, Express, and React TSX proof-of-concept for turning grocery inventory into an explainable meal plan that balances expiring food, budget, protein, prep time, and variety.

## Goal

Show how a meal planning service can treat a pantry as constrained supply, score recipe candidates, and produce both a plan and a shopping delta with enough visibility to understand why each meal was selected.

## What It Covers

- In-memory pantry inventory with quantity, cost, category, tags, and expiry windows
- Recipe catalog with meal types, servings, prep time, nutrition, tags, and ingredients
- Constraint-based meal optimization across days and meal slots
- Greedy candidate selection with scoring dimensions for waste, budget, protein, speed, variety, and pantry coverage
- Simulated pantry freshness drift with event logging
- Shopping-list aggregation for missing ingredients
- React dashboard for controls, meal plan scoring, inventory state, and optimizer events

## Quick Start

1. Start the backend:
   ```bash
   cd grocery-to-meal-optimizer-poc/backend
   npm install
   npm run dev
   ```
2. Start the frontend:
   ```bash
   cd grocery-to-meal-optimizer-poc/frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:5184`.

The backend listens on `http://localhost:8132`, and the frontend proxies `/api` to it.

## UI Flows

- Adjust optimizer weights to favor waste reduction, budget control, protein, prep speed, or variety
- Toggle preferred and avoided tags to simulate household preferences
- Add pantry items and watch the plan re-optimize around the new supply
- Advance the pantry by one day to expose expiry pressure and spoilage risk
- Inspect per-meal score breakdowns and the shopping delta created by missing ingredients

## JSON Endpoints

- `GET /api/health`
- `GET /api/snapshot`
- `POST /api/optimize`
- `POST /api/inventory`
- `PATCH /api/inventory/:id`
- `DELETE /api/inventory/:id`
- `POST /api/simulate/day-pass`
- `POST /api/seed`

Example optimization request:

```json
{
  "days": 3,
  "servings": 2,
  "budgetCap": 55,
  "preferredTags": ["high-protein", "quick"],
  "avoidTags": ["pescatarian"],
  "weights": {
    "waste": 34,
    "budget": 24,
    "protein": 18,
    "speed": 14,
    "variety": 10
  }
}
```

## Configuration

- `PORT` controls the backend port and defaults to `8132`
- optimizer data is seeded in memory on process start
- event retention is bounded to the most recent `160` events

## Notes and Limitations

- State is in memory and resets on restart.
- Ingredient unit conversion is intentionally simple; quantities only compare within the same named item.
- The optimizer uses a greedy heuristic, not a global linear/integer solver.
- Prices, nutrition, and recipes are seeded sample data, not an external grocery catalog.

## Technologies Used

- Node.js
- Express
- TypeScript
- React
- Vite
- TSX
