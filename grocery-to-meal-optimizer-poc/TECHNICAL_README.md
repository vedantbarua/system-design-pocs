# Grocery-to-Meal Optimizer Technical README

## Problem Statement

Households often optimize meals across competing constraints: use food before it spoils, stay within budget, hit nutrition goals, avoid disliked categories, reduce prep effort, and keep meals varied. This POC models that as an online planning problem over a changing inventory.

## Architecture Overview

The backend is a single Express process with an in-memory catalog:

- `inventory` stores current pantry supply, unit cost, and freshness windows
- `recipes` stores candidate meals and ingredient requirements
- `latestPlan` stores the latest optimizer result
- `events` stores recent operational activity for the UI

The frontend is a Vite React TSX app. It polls `/api/snapshot`, posts optimizer constraints to `/api/optimize`, and sends inventory mutations back to the backend. Vite proxies `/api` to the Express server during local development.

## Core Data Model

- `InventoryItem`: item name, category, quantity, unit, days until expiry, cost per unit, and tags
- `Recipe`: meal type, servings, prep minutes, ingredients, tags, calories, protein, and estimated cost
- `OptimizerConstraints`: planning horizon, servings, budget cap, preferred and avoided tags, and scoring weights
- `MealPlanItem`: selected recipe, score, score breakdown, matched inventory, and missing ingredients
- `ShoppingItem`: aggregated missing quantity, estimated cost, and recipes that require it

## Request Flow

1. UI loads `/api/snapshot`.
2. Backend returns inventory, recipe catalog, latest plan, expiring items, system counters, and events.
3. User changes constraints and posts to `/api/optimize`.
4. Backend sanitizes constraints and simulates planning against a copy of pantry inventory.
5. For each day and meal slot, candidate recipes are scored and the best candidate is selected.
6. Selected recipes consume simulated inventory; missing quantities are merged into the shopping list.
7. Backend stores the result as `latestPlan`, logs an event, and returns the plan.

## Optimization Flow

The optimizer scores each recipe using:

- pantry coverage: portion of required ingredient value already available
- waste rescue: amount of expiring inventory used by the recipe
- budget score: expected missing spend relative to remaining budget
- protein score: protein per serving relative to a target
- speed score: prep time relative to a practical upper bound
- variety score: penalty for repeating the same recipe
- preference boost: small bonus for preferred tags

Avoided tags remove recipes from the candidate set. The algorithm is intentionally greedy so the behavior is easy to inspect in a POC.

## Key Tradeoffs

- Greedy selection is explainable and fast but can miss a globally better plan.
- In-memory state keeps the demo small but loses data on restart.
- Ingredient matching uses normalized names and optional alternatives instead of a product ontology.
- Unit conversion is omitted to keep the scoring model focused on planning behavior.
- Missing ingredient costs are approximated from seeded unit costs and recipe cost estimates.

## Failure Handling

- Request bodies are sanitized before optimizer use.
- Invalid inventory creation requests return `400`.
- Missing inventory IDs return `404`.
- Events expose optimizer runs, inventory mutations, simulations, and seed resets.
- The UI catches request failures and shows an inline status message.

## Scaling Path

- Move recipes and pantry state into a database with household-level partitioning.
- Add a durable plan history table so users can compare previous optimizations.
- Replace greedy selection with an integer programming solver for larger catalogs.
- Add a grocery catalog service for price normalization and substitutions.
- Cache recipe candidate features and recompute only when inventory or preferences change.
- Run optimization asynchronously for large households or long planning horizons.

## What Is Intentionally Simplified

- No authentication or household sharing model
- No persistence layer
- No external grocery, nutrition, or recipe API
- No cross-unit conversion
- No calendar integration
- No real checkout or grocery delivery integration
