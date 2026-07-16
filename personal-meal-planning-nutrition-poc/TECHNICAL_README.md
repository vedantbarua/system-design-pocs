# Technical Notes

## Architecture

The API owns a single `MealPlanningNutrition` domain model. Events enter through HTTP or Kafka, are deduplicated by `mealId:eventId`, applied to the in-memory projection, and then persisted as a snapshot plus event records when Postgres is enabled.

The adapters are intentionally thin:

- Kafka publishes/consumes meal events, or stores messages in an in-memory buffer.
- Postgres stores `meal_snapshots` and `meal_events`.
- Redis stores the latest serialized snapshot.
- In-memory mode keeps the POC runnable without infrastructure.

## Domain Model

Primary entities:

- `MealPlan`: planned meal, slot, recipe, nutrition, ingredients, budget, and status.
- `PantryItem`: available household ingredient with quantity and expiry.
- `GroceryGap`: missing ingredient or manually added grocery row.
- `Alert`: deduped operational issue such as grocery gaps, duplicate groceries, nutrition drift, budget overage, or expiring pantry.
- `Job`: retryable background work for scans, grocery rebuilds, reminders, and retention.
- `Audit`: append-only UI-visible action history.

## Event Handling

Supported events:

- `MEAL_PLANNED`
- `RECIPE_SWAPPED`
- `MEAL_PREPPED`
- `MEAL_COOKED`
- `MEAL_SKIPPED`
- `INGREDIENT_CONSUMED`
- `GROCERY_ADDED`
- `NUTRITION_SCAN`
- `TARGET_UPDATED`

Each event is normalized into a full `MealEvent`. If the event timestamp is older than the meal's `updatedAt`, the event is recorded but not applied to the meal projection.

## Grocery Projection

`rebuildGroceries()` keeps manual grocery entries, clears generated gaps, then scans every non-cooked and non-skipped meal. If an ingredient is missing from the pantry or has zero quantity, a grocery gap is generated and the meal is marked `NEEDS_GROCERIES` when appropriate.

Duplicate grocery detection uses:

```ts
normalized item + neededBy date
```

That catches repeated grocery additions like `tortillas` and ` Tortillas ` for the same date.

## Nutrition Scan

`scanNutrition()` groups active meals by day and compares totals with the active target:

- calories or sodium over target -> `NUTRITION_OVER`
- protein or fiber under target -> `NUTRITION_UNDER`
- budget over target -> `BUDGET_OVER`
- pantry expiring within three days -> `EXPIRING_INGREDIENT`

Alerts are deduped by deterministic keys so repeated scans do not flood the dashboard.

## Job Semantics

Jobs are deduped per kind and hour. A job can be forced to fail with `/api/jobs/fail-next`, then the next dispatch moves it to `RETRY`. The following dispatch completes it unless another failure is armed.

Job kinds:

- `MEAL_SCAN`
- `GROCERY_REBUILD`
- `REMINDER_DISPATCH`
- `RETENTION`

## Failure Modes Covered

- Duplicate event delivery
- Late event delivery
- Duplicate grocery entry
- Missing pantry ingredients
- Expiring pantry items
- Nutrition target drift
- Retryable job failure
- Snapshot export/import recovery
