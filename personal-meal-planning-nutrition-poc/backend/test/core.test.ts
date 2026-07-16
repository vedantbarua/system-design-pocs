import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededMealPlanner, groceryFingerprint, mealEventKey } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("MealPlanningNutrition", () => {
  it("seeds meals, pantry, grocery gaps, and alerts", () => {
    const planner = createSeededMealPlanner(NOW);
    assert.equal(planner.meals.length, 5);
    assert.equal(planner.pantry.length, 4);
    assert.ok(planner.groceries.length > 0);
    assert.ok(planner.alerts.length > 0);
  });

  it("uses stable event keys and grocery fingerprints", () => {
    assert.equal(mealEventKey({ mealId: "meal-1", eventId: "abc" }), "meal-1:abc");
    assert.equal(groceryFingerprint(" Fresh  Greens ", NOW.toISOString()), "fresh greens:2026-07-09");
  });

  it("deduplicates meal events", () => {
    const planner = createSeededMealPlanner(NOW);
    const input = { eventId: "dup", mealId: "meal-tacos", type: "MEAL_PREPPED" as const, occurredAt: NOW.toISOString() };
    assert.equal(planner.ingest(input).duplicate, false);
    assert.equal(planner.ingest(input).duplicate, true);
  });

  it("updates meal metadata on recipe swaps", () => {
    const planner = createSeededMealPlanner(NOW);
    planner.ingest({ eventId: "swap", mealId: "meal-pasta", type: "RECIPE_SWAPPED", recipe: "Chickpea pasta", ingredients: ["chickpea pasta", "spinach", "tomato sauce"], calories: 700, protein: 44, fiber: 18, occurredAt: NOW.toISOString(), notes: "Higher protein." });
    const meal = planner.mealById("meal-pasta");
    assert.equal(meal.recipe, "Chickpea pasta");
    assert.equal(meal.status, "SWAPPED");
    assert.equal(meal.protein, 44);
  });

  it("ignores stale meal updates", () => {
    const planner = createSeededMealPlanner(NOW);
    const before = planner.mealById("meal-salad").recipe;
    const result = planner.ingest({ eventId: "old", mealId: "meal-salad", type: "RECIPE_SWAPPED", recipe: "Old salad", occurredAt: addMinutes(-20 * 24 * 60, NOW) });
    assert.equal(result.stale, true);
    assert.equal(planner.mealById("meal-salad").recipe, before);
  });

  it("creates new planned meals", () => {
    const planner = createSeededMealPlanner(NOW);
    planner.ingest({ eventId: "create", mealId: "meal-soup", type: "MEAL_PLANNED", day: addMinutes(4 * 24 * 60, NOW), slot: "DINNER", recipe: "Vegetable soup", ingredients: ["carrots", "beans"], occurredAt: NOW.toISOString() });
    assert.equal(planner.mealById("meal-soup").recipe, "Vegetable soup");
  });

  it("cooks and skips meals", () => {
    const planner = createSeededMealPlanner(NOW);
    planner.ingest({ eventId: "cook", mealId: "meal-tacos", type: "MEAL_COOKED", occurredAt: NOW.toISOString() });
    planner.ingest({ eventId: "skip", mealId: "meal-smoothie", type: "MEAL_SKIPPED", occurredAt: NOW.toISOString() });
    assert.equal(planner.mealById("meal-tacos").status, "COOKED");
    assert.equal(planner.mealById("meal-smoothie").status, "SKIPPED");
  });

  it("consumes pantry ingredients", () => {
    const planner = createSeededMealPlanner(NOW);
    planner.ingest({ eventId: "consume", mealId: "meal-oats", type: "INGREDIENT_CONSUMED", item: "yogurt", quantity: 1, unit: "cups", occurredAt: NOW.toISOString() });
    assert.equal(planner.pantry.find((item) => item.name === "yogurt")?.quantity, 1);
  });

  it("rebuilds groceries from missing pantry", () => {
    const planner = createSeededMealPlanner(NOW);
    planner.pantry = planner.pantry.filter((item) => item.name !== "spinach");
    const gaps = planner.rebuildGroceries();
    assert.ok(gaps.some((gap) => gap.item === "spinach"));
  });

  it("detects duplicate manual grocery entries", () => {
    const planner = createSeededMealPlanner(NOW);
    planner.ingest({ eventId: "grocery-1", mealId: "meal-tacos", type: "GROCERY_ADDED", item: "tortillas", day: addMinutes(1 * 24 * 60, NOW), occurredAt: NOW.toISOString() });
    planner.ingest({ eventId: "grocery-2", mealId: "meal-tacos", type: "GROCERY_ADDED", item: " Tortillas ", day: addMinutes(1 * 24 * 60, NOW), occurredAt: addMinutes(1, NOW) });
    assert.ok(planner.groceries.some((gap) => gap.status === "DUPLICATE"));
    assert.ok(planner.alerts.some((alert) => alert.kind === "DUPLICATE_GROCERY"));
  });

  it("detects nutrition and budget alerts", () => {
    const planner = createSeededMealPlanner(NOW);
    planner.target = { calories: 900, protein: 180, fiber: 60, sodium: 600, budget: 8, restrictions: [] };
    planner.scanNutrition(NOW);
    assert.ok(planner.alerts.some((alert) => alert.kind === "NUTRITION_OVER"));
    assert.ok(planner.alerts.some((alert) => alert.kind === "NUTRITION_UNDER"));
    assert.ok(planner.alerts.some((alert) => alert.kind === "BUDGET_OVER"));
  });

  it("detects expiring pantry ingredients", () => {
    const planner = createSeededMealPlanner(NOW);
    assert.ok(planner.alerts.some((alert) => alert.kind === "EXPIRING_INGREDIENT"));
  });

  it("dispatches alerts", () => {
    const planner = createSeededMealPlanner(NOW);
    assert.ok(planner.dispatchAlerts() > 0);
    assert.ok(planner.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const planner = createSeededMealPlanner(NOW);
    planner.ingest({ eventId: "old-event", mealId: "meal-oats", type: "MEAL_PREPPED", occurredAt: addMinutes(-500 * 24 * 60, NOW) });
    const result = planner.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(planner.events.length, planner.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const planner = createSeededMealPlanner(NOW);
    planner.ensureJob("MEAL_SCAN");
    planner.failNextJob = true;
    assert.equal(planner.dispatchNextJob().job?.status, "RETRY");
    assert.equal(planner.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const planner = createSeededMealPlanner(NOW);
    assert.equal(planner.ensureJob("REMINDER_DISPATCH").id, planner.ensureJob("REMINDER_DISPATCH").id);
    const restored = createSeededMealPlanner(NOW);
    restored.importState(planner.exportState());
    assert.equal(restored.meals.length, planner.meals.length);
    assert.equal(restored.pantry.length, planner.pantry.length);
    assert.equal(restored.alerts.length, planner.alerts.length);
  });
});
