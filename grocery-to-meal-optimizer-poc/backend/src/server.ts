import crypto from "node:crypto";
import cors from "cors";
import express from "express";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8132;
const EVENT_LIMIT = 160;

type Category =
  | "produce"
  | "protein"
  | "dairy"
  | "grain"
  | "pantry"
  | "frozen"
  | "spice";

type MealType = "breakfast" | "lunch" | "dinner";

type InventoryItem = {
  id: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  expiresInDays: number;
  costPerUnit: number;
  tags: string[];
};

type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  alternatives?: string[];
};

type Recipe = {
  id: string;
  name: string;
  mealType: MealType;
  servings: number;
  prepMinutes: number;
  ingredients: Ingredient[];
  tags: string[];
  caloriesPerServing: number;
  proteinPerServing: number;
  estimatedCostPerServing: number;
};

type OptimizerConstraints = {
  days: number;
  servings: number;
  budgetCap: number;
  avoidTags: string[];
  preferredTags: string[];
  weights: {
    waste: number;
    budget: number;
    protein: number;
    speed: number;
    variety: number;
  };
};

type MealPlanItem = {
  slot: string;
  day: number;
  mealType: MealType;
  recipeId: string;
  recipeName: string;
  score: number;
  servings: number;
  prepMinutes: number;
  caloriesPerServing: number;
  proteinPerServing: number;
  scoreBreakdown: Record<string, number>;
  matchedIngredients: string[];
  missingIngredients: Ingredient[];
};

type ShoppingItem = {
  name: string;
  quantity: number;
  unit: string;
  estimatedCost: number;
  recipes: string[];
};

type OptimizationResult = {
  id: string;
  constraints: OptimizerConstraints;
  plan: MealPlanItem[];
  shoppingList: ShoppingItem[];
  metrics: {
    totalMeals: number;
    totalServings: number;
    pantryCoveragePct: number;
    estimatedSpend: number;
    rescuedExpiringItems: number;
    avgProteinPerServing: number;
    avgPrepMinutes: number;
  };
  createdAt: number;
};

type EventEntry = {
  id: string;
  type: string;
  message: string;
  payload: Record<string, unknown>;
  at: number;
};

const DEFAULT_CONSTRAINTS: OptimizerConstraints = {
  days: 3,
  servings: 2,
  budgetCap: 55,
  avoidTags: [],
  preferredTags: ["high-protein", "quick"],
  weights: {
    waste: 34,
    budget: 24,
    protein: 18,
    speed: 14,
    variety: 10
  }
};

let inventory: InventoryItem[] = [];
let recipes: Recipe[] = [];
let latestPlan: OptimizationResult | null = null;
const events: EventEntry[] = [];

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function logEvent(type: string, message: string, payload: Record<string, unknown> = {}) {
  events.unshift({
    id: id("evt"),
    type,
    message,
    payload,
    at: Date.now()
  });
  if (events.length > EVENT_LIMIT) events.pop();
}

function inventoryKey(item: Pick<InventoryItem, "name">) {
  return normalize(item.name);
}

function seedData() {
  inventory = [
    {
      id: id("inv"),
      name: "spinach",
      category: "produce",
      quantity: 8,
      unit: "oz",
      expiresInDays: 2,
      costPerUnit: 0.28,
      tags: ["vegetarian", "low-carb"]
    },
    {
      id: id("inv"),
      name: "chicken breast",
      category: "protein",
      quantity: 2.2,
      unit: "lb",
      expiresInDays: 3,
      costPerUnit: 4.5,
      tags: ["high-protein"]
    },
    {
      id: id("inv"),
      name: "eggs",
      category: "protein",
      quantity: 10,
      unit: "count",
      expiresInDays: 9,
      costPerUnit: 0.34,
      tags: ["vegetarian", "high-protein"]
    },
    {
      id: id("inv"),
      name: "greek yogurt",
      category: "dairy",
      quantity: 24,
      unit: "oz",
      expiresInDays: 4,
      costPerUnit: 0.16,
      tags: ["vegetarian", "high-protein"]
    },
    {
      id: id("inv"),
      name: "brown rice",
      category: "grain",
      quantity: 5,
      unit: "cup",
      expiresInDays: 60,
      costPerUnit: 0.48,
      tags: ["vegetarian"]
    },
    {
      id: id("inv"),
      name: "black beans",
      category: "pantry",
      quantity: 4,
      unit: "cup",
      expiresInDays: 90,
      costPerUnit: 0.55,
      tags: ["vegetarian", "high-fiber"]
    },
    {
      id: id("inv"),
      name: "bell peppers",
      category: "produce",
      quantity: 3,
      unit: "count",
      expiresInDays: 2,
      costPerUnit: 1.15,
      tags: ["vegetarian"]
    },
    {
      id: id("inv"),
      name: "tortillas",
      category: "grain",
      quantity: 8,
      unit: "count",
      expiresInDays: 6,
      costPerUnit: 0.32,
      tags: ["vegetarian"]
    },
    {
      id: id("inv"),
      name: "salmon",
      category: "protein",
      quantity: 1.2,
      unit: "lb",
      expiresInDays: 1,
      costPerUnit: 9.5,
      tags: ["high-protein", "pescatarian"]
    },
    {
      id: id("inv"),
      name: "sweet potatoes",
      category: "produce",
      quantity: 5,
      unit: "count",
      expiresInDays: 14,
      costPerUnit: 0.85,
      tags: ["vegetarian"]
    },
    {
      id: id("inv"),
      name: "oats",
      category: "grain",
      quantity: 6,
      unit: "cup",
      expiresInDays: 120,
      costPerUnit: 0.42,
      tags: ["vegetarian"]
    },
    {
      id: id("inv"),
      name: "frozen berries",
      category: "frozen",
      quantity: 4,
      unit: "cup",
      expiresInDays: 180,
      costPerUnit: 1.1,
      tags: ["vegetarian"]
    }
  ];

  recipes = [
    {
      id: "recipe-spinach-egg-wrap",
      name: "Spinach Egg Breakfast Wrap",
      mealType: "breakfast",
      servings: 2,
      prepMinutes: 14,
      ingredients: [
        { name: "eggs", quantity: 4, unit: "count" },
        { name: "spinach", quantity: 3, unit: "oz" },
        { name: "tortillas", quantity: 2, unit: "count" }
      ],
      tags: ["quick", "vegetarian", "high-protein"],
      caloriesPerServing: 390,
      proteinPerServing: 24,
      estimatedCostPerServing: 2.25
    },
    {
      id: "recipe-yogurt-oat-bowl",
      name: "Greek Yogurt Oat Bowl",
      mealType: "breakfast",
      servings: 2,
      prepMinutes: 8,
      ingredients: [
        { name: "greek yogurt", quantity: 12, unit: "oz" },
        { name: "oats", quantity: 1, unit: "cup" },
        { name: "frozen berries", quantity: 1.5, unit: "cup" }
      ],
      tags: ["quick", "vegetarian", "high-protein"],
      caloriesPerServing: 430,
      proteinPerServing: 30,
      estimatedCostPerServing: 2.75
    },
    {
      id: "recipe-chicken-rice-bowl",
      name: "Chicken Rice Power Bowl",
      mealType: "lunch",
      servings: 2,
      prepMinutes: 28,
      ingredients: [
        { name: "chicken breast", quantity: 0.9, unit: "lb" },
        { name: "brown rice", quantity: 1.25, unit: "cup" },
        { name: "bell peppers", quantity: 1, unit: "count" },
        { name: "spinach", quantity: 2, unit: "oz" }
      ],
      tags: ["high-protein", "meal-prep"],
      caloriesPerServing: 620,
      proteinPerServing: 47,
      estimatedCostPerServing: 4.85
    },
    {
      id: "recipe-bean-pepper-tacos",
      name: "Black Bean Pepper Tacos",
      mealType: "lunch",
      servings: 2,
      prepMinutes: 18,
      ingredients: [
        { name: "black beans", quantity: 1.5, unit: "cup" },
        { name: "bell peppers", quantity: 1.5, unit: "count" },
        { name: "tortillas", quantity: 4, unit: "count" },
        { name: "greek yogurt", quantity: 4, unit: "oz", alternatives: ["sour cream"] }
      ],
      tags: ["quick", "vegetarian", "high-fiber"],
      caloriesPerServing: 510,
      proteinPerServing: 22,
      estimatedCostPerServing: 2.95
    },
    {
      id: "recipe-salmon-sweet-potato",
      name: "Salmon with Sweet Potato Mash",
      mealType: "dinner",
      servings: 2,
      prepMinutes: 32,
      ingredients: [
        { name: "salmon", quantity: 1, unit: "lb" },
        { name: "sweet potatoes", quantity: 3, unit: "count" },
        { name: "spinach", quantity: 2, unit: "oz" }
      ],
      tags: ["high-protein", "pescatarian"],
      caloriesPerServing: 680,
      proteinPerServing: 42,
      estimatedCostPerServing: 7.6
    },
    {
      id: "recipe-chicken-bean-skillet",
      name: "Chicken Bean Skillet",
      mealType: "dinner",
      servings: 3,
      prepMinutes: 30,
      ingredients: [
        { name: "chicken breast", quantity: 1.1, unit: "lb" },
        { name: "black beans", quantity: 1.25, unit: "cup" },
        { name: "bell peppers", quantity: 1, unit: "count" },
        { name: "brown rice", quantity: 1, unit: "cup" }
      ],
      tags: ["high-protein", "meal-prep"],
      caloriesPerServing: 590,
      proteinPerServing: 45,
      estimatedCostPerServing: 4.25
    },
    {
      id: "recipe-sweet-potato-bean-bowl",
      name: "Sweet Potato Bean Bowl",
      mealType: "dinner",
      servings: 2,
      prepMinutes: 26,
      ingredients: [
        { name: "sweet potatoes", quantity: 2, unit: "count" },
        { name: "black beans", quantity: 1.5, unit: "cup" },
        { name: "spinach", quantity: 2, unit: "oz" },
        { name: "greek yogurt", quantity: 3, unit: "oz" }
      ],
      tags: ["vegetarian", "high-fiber"],
      caloriesPerServing: 540,
      proteinPerServing: 20,
      estimatedCostPerServing: 3.35
    },
    {
      id: "recipe-salmon-rice-wrap",
      name: "Salmon Rice Lettuce Wrap",
      mealType: "lunch",
      servings: 2,
      prepMinutes: 22,
      ingredients: [
        { name: "salmon", quantity: 0.7, unit: "lb" },
        { name: "brown rice", quantity: 1, unit: "cup" },
        { name: "spinach", quantity: 3, unit: "oz" }
      ],
      tags: ["quick", "high-protein", "pescatarian"],
      caloriesPerServing: 560,
      proteinPerServing: 35,
      estimatedCostPerServing: 5.95
    }
  ];

  latestPlan = optimize(DEFAULT_CONSTRAINTS);
  logEvent("seed.loaded", "Loaded starter pantry, recipes, and default plan", {
    inventoryItems: inventory.length,
    recipes: recipes.length
  });
}

function sanitizeConstraints(input: Partial<OptimizerConstraints>): OptimizerConstraints {
  const rawWeights: Partial<OptimizerConstraints["weights"]> = input.weights || {};
  return {
    days: clamp(Number(input.days ?? DEFAULT_CONSTRAINTS.days), 1, 7),
    servings: clamp(Number(input.servings ?? DEFAULT_CONSTRAINTS.servings), 1, 8),
    budgetCap: clamp(Number(input.budgetCap ?? DEFAULT_CONSTRAINTS.budgetCap), 5, 500),
    avoidTags: Array.isArray(input.avoidTags)
      ? input.avoidTags.map(String).map(normalize).filter(Boolean)
      : [],
    preferredTags: Array.isArray(input.preferredTags)
      ? input.preferredTags.map(String).map(normalize).filter(Boolean)
      : DEFAULT_CONSTRAINTS.preferredTags,
    weights: {
      waste: clamp(Number(rawWeights.waste ?? DEFAULT_CONSTRAINTS.weights.waste), 0, 100),
      budget: clamp(Number(rawWeights.budget ?? DEFAULT_CONSTRAINTS.weights.budget), 0, 100),
      protein: clamp(Number(rawWeights.protein ?? DEFAULT_CONSTRAINTS.weights.protein), 0, 100),
      speed: clamp(Number(rawWeights.speed ?? DEFAULT_CONSTRAINTS.weights.speed), 0, 100),
      variety: clamp(Number(rawWeights.variety ?? DEFAULT_CONSTRAINTS.weights.variety), 0, 100)
    }
  };
}

function findInventoryMatch(
  ingredient: Ingredient,
  stock: Map<string, InventoryItem>
): InventoryItem | undefined {
  const names = [ingredient.name, ...(ingredient.alternatives || [])].map(normalize);
  return names.map((name) => stock.get(name)).find(Boolean);
}

function scoreRecipe(
  recipe: Recipe,
  constraints: OptimizerConstraints,
  stock: Map<string, InventoryItem>,
  selectedCounts: Map<string, number>,
  currentSpend: number
) {
  if (recipe.tags.some((tag) => constraints.avoidTags.includes(normalize(tag)))) {
    return null;
  }

  let availableValue = 0;
  let requiredValue = 0;
  let missingCost = 0;
  let expiringQuantity = 0;
  const matchedIngredients: string[] = [];
  const missingIngredients: Ingredient[] = [];

  const scale = constraints.servings / recipe.servings;
  for (const ingredient of recipe.ingredients) {
    const requiredQty = ingredient.quantity * scale;
    const match = findInventoryMatch(ingredient, stock);
    const fallbackCostPerUnit = recipe.estimatedCostPerServing / recipe.ingredients.length;
    const itemCost = match?.costPerUnit ?? fallbackCostPerUnit;
    const requiredCost = requiredQty * itemCost;
    requiredValue += requiredCost;

    if (match) {
      const coveredQty = Math.min(match.quantity, requiredQty);
      availableValue += coveredQty * itemCost;
      if (coveredQty > 0) matchedIngredients.push(match.name);
      if (match.expiresInDays <= 3) expiringQuantity += coveredQty;
      if (coveredQty < requiredQty) {
        const shortage = round(requiredQty - coveredQty);
        missingCost += shortage * itemCost;
        missingIngredients.push({ ...ingredient, quantity: shortage });
      }
    } else {
      missingCost += requiredCost;
      missingIngredients.push({ ...ingredient, quantity: round(requiredQty) });
    }
  }

  const pantryCoverage = requiredValue > 0 ? availableValue / requiredValue : 0;
  const budgetHeadroom = Math.max(0, constraints.budgetCap - currentSpend);
  const budgetScore = budgetHeadroom <= 0 ? 0 : 1 - Math.min(1, missingCost / budgetHeadroom);
  const wasteScore = Math.min(1, expiringQuantity / 4);
  const proteinScore = Math.min(1, recipe.proteinPerServing / 42);
  const speedScore = 1 - Math.min(1, recipe.prepMinutes / 45);
  const varietyPenalty = Math.min(1, (selectedCounts.get(recipe.id) || 0) * 0.35);
  const preferenceBoost = constraints.preferredTags.some((tag) =>
    recipe.tags.map(normalize).includes(tag)
  )
    ? 0.08
    : 0;

  const totalWeight =
    constraints.weights.waste +
    constraints.weights.budget +
    constraints.weights.protein +
    constraints.weights.speed +
    constraints.weights.variety ||
    1;

  const breakdown = {
    pantry: pantryCoverage,
    waste: wasteScore,
    budget: budgetScore,
    protein: proteinScore,
    speed: speedScore,
    variety: 1 - varietyPenalty
  };

  const weighted =
    (breakdown.waste * constraints.weights.waste +
      breakdown.budget * constraints.weights.budget +
      breakdown.protein * constraints.weights.protein +
      breakdown.speed * constraints.weights.speed +
      breakdown.variety * constraints.weights.variety) /
    totalWeight;

  return {
    score: clamp(weighted + pantryCoverage * 0.18 + preferenceBoost, 0, 1),
    missingCost,
    matchedIngredients,
    missingIngredients,
    scoreBreakdown: Object.fromEntries(
      Object.entries(breakdown).map(([key, value]) => [key, round(value * 100, 0)])
    )
  };
}

function consumeRecipe(recipe: Recipe, servings: number, stock: Map<string, InventoryItem>) {
  const scale = servings / recipe.servings;
  for (const ingredient of recipe.ingredients) {
    const match = findInventoryMatch(ingredient, stock);
    if (!match) continue;
    match.quantity = round(Math.max(0, match.quantity - ingredient.quantity * scale));
  }
}

function addShoppingItem(
  shopping: Map<string, ShoppingItem>,
  ingredient: Ingredient,
  recipeName: string,
  fallbackUnitCost: number
) {
  const key = `${normalize(ingredient.name)}:${ingredient.unit}`;
  const existing = shopping.get(key);
  const estimatedCost = round(ingredient.quantity * fallbackUnitCost);
  if (existing) {
    existing.quantity = round(existing.quantity + ingredient.quantity);
    existing.estimatedCost = round(existing.estimatedCost + estimatedCost);
    if (!existing.recipes.includes(recipeName)) existing.recipes.push(recipeName);
    return;
  }
  shopping.set(key, {
    name: ingredient.name,
    quantity: round(ingredient.quantity),
    unit: ingredient.unit,
    estimatedCost,
    recipes: [recipeName]
  });
}

function optimize(rawConstraints: Partial<OptimizerConstraints>) {
  const constraints = sanitizeConstraints(rawConstraints);
  const stock = new Map(inventory.map((item) => [inventoryKey(item), { ...item }]));
  const selectedCounts = new Map<string, number>();
  const shopping = new Map<string, ShoppingItem>();
  const plan: MealPlanItem[] = [];
  let currentSpend = 0;

  const mealSlots: MealType[] = ["breakfast", "lunch", "dinner"];
  for (let day = 1; day <= constraints.days; day += 1) {
    for (const mealType of mealSlots) {
      const candidates = recipes
        .filter((recipe) => recipe.mealType === mealType)
        .map((recipe) => ({
          recipe,
          scored: scoreRecipe(recipe, constraints, stock, selectedCounts, currentSpend)
        }))
        .filter(
          (candidate): candidate is { recipe: Recipe; scored: NonNullable<ReturnType<typeof scoreRecipe>> } =>
            Boolean(candidate.scored)
        )
        .sort((a, b) => b.scored.score - a.scored.score);

      const selected = candidates[0];
      if (!selected) continue;

      consumeRecipe(selected.recipe, constraints.servings, stock);
      selectedCounts.set(
        selected.recipe.id,
        (selectedCounts.get(selected.recipe.id) || 0) + 1
      );
      currentSpend += selected.scored.missingCost;
      const fallbackUnitCost =
        selected.recipe.estimatedCostPerServing / selected.recipe.ingredients.length;
      for (const missing of selected.scored.missingIngredients) {
        addShoppingItem(shopping, missing, selected.recipe.name, fallbackUnitCost);
      }

      plan.push({
        slot: `Day ${day} ${mealType}`,
        day,
        mealType,
        recipeId: selected.recipe.id,
        recipeName: selected.recipe.name,
        score: round(selected.scored.score * 100, 0),
        servings: constraints.servings,
        prepMinutes: selected.recipe.prepMinutes,
        caloriesPerServing: selected.recipe.caloriesPerServing,
        proteinPerServing: selected.recipe.proteinPerServing,
        scoreBreakdown: selected.scored.scoreBreakdown,
        matchedIngredients: selected.scored.matchedIngredients,
        missingIngredients: selected.scored.missingIngredients
      });
    }
  }

  const rescued = new Set<string>();
  for (const item of inventory) {
    if (item.expiresInDays > 3) continue;
    const planned = plan.some((meal) =>
      meal.matchedIngredients.map(normalize).includes(normalize(item.name))
    );
    if (planned) rescued.add(item.id);
  }

  const totalRequiredIngredients = plan.reduce(
    (sum, meal) => sum + recipes.find((recipe) => recipe.id === meal.recipeId)!.ingredients.length,
    0
  );
  const totalMissingIngredients = plan.reduce(
    (sum, meal) => sum + meal.missingIngredients.length,
    0
  );
  const totalProtein = plan.reduce(
    (sum, meal) => sum + meal.proteinPerServing * meal.servings,
    0
  );
  const totalServings = plan.reduce((sum, meal) => sum + meal.servings, 0);
  const totalPrep = plan.reduce((sum, meal) => sum + meal.prepMinutes, 0);

  return {
    id: id("plan"),
    constraints,
    plan,
    shoppingList: [...shopping.values()].sort((a, b) => b.estimatedCost - a.estimatedCost),
    metrics: {
      totalMeals: plan.length,
      totalServings,
      pantryCoveragePct:
        totalRequiredIngredients === 0
          ? 0
          : round(((totalRequiredIngredients - totalMissingIngredients) / totalRequiredIngredients) * 100, 0),
      estimatedSpend: round([...shopping.values()].reduce((sum, item) => sum + item.estimatedCost, 0)),
      rescuedExpiringItems: rescued.size,
      avgProteinPerServing: totalServings === 0 ? 0 : round(totalProtein / totalServings),
      avgPrepMinutes: plan.length === 0 ? 0 : round(totalPrep / plan.length, 0)
    },
    createdAt: Date.now()
  };
}

function getSnapshot() {
  const expiringItems = inventory
    .filter((item) => item.expiresInDays <= 3)
    .sort((a, b) => a.expiresInDays - b.expiresInDays);

  return {
    inventory,
    recipes,
    latestPlan,
    expiringItems,
    events,
    system: {
      recipes: recipes.length,
      inventoryItems: inventory.length,
      lowStockItems: inventory.filter((item) => item.quantity <= 1).length,
      expiringItems: expiringItems.length
    }
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "grocery-to-meal-optimizer", at: Date.now() });
});

app.get("/api/snapshot", (_req, res) => {
  res.json(getSnapshot());
});

app.post("/api/optimize", (req, res) => {
  latestPlan = optimize(req.body || {});
  logEvent("optimizer.ran", "Generated a meal plan from current constraints", {
    planId: latestPlan.id,
    meals: latestPlan.metrics.totalMeals,
    spend: latestPlan.metrics.estimatedSpend,
    coverage: latestPlan.metrics.pantryCoveragePct
  });
  res.json(latestPlan);
});

app.post("/api/inventory", (req, res) => {
  const body = req.body || {};
  const item: InventoryItem = {
    id: id("inv"),
    name: String(body.name || "").trim(),
    category: body.category || "pantry",
    quantity: Number(body.quantity || 0),
    unit: String(body.unit || "count").trim(),
    expiresInDays: Number(body.expiresInDays ?? 14),
    costPerUnit: Number(body.costPerUnit ?? 1),
    tags: Array.isArray(body.tags) ? body.tags.map(String).map(normalize).filter(Boolean) : []
  };

  if (!item.name || item.quantity < 0) {
    res.status(400).json({ error: "name and non-negative quantity are required" });
    return;
  }

  inventory.unshift(item);
  latestPlan = optimize(latestPlan?.constraints || DEFAULT_CONSTRAINTS);
  logEvent("inventory.added", `Added ${item.name} to pantry`, {
    itemId: item.id,
    quantity: item.quantity,
    unit: item.unit
  });
  res.status(201).json(item);
});

app.patch("/api/inventory/:id", (req, res) => {
  const item = inventory.find((entry) => entry.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: "inventory item not found" });
    return;
  }

  const body = req.body || {};
  if (body.name !== undefined) item.name = String(body.name).trim();
  if (body.category !== undefined) item.category = body.category;
  if (body.quantity !== undefined) item.quantity = Number(body.quantity);
  if (body.unit !== undefined) item.unit = String(body.unit).trim();
  if (body.expiresInDays !== undefined) item.expiresInDays = Number(body.expiresInDays);
  if (body.costPerUnit !== undefined) item.costPerUnit = Number(body.costPerUnit);
  if (body.tags !== undefined && Array.isArray(body.tags)) {
    item.tags = body.tags.map(String).map(normalize).filter(Boolean);
  }

  latestPlan = optimize(latestPlan?.constraints || DEFAULT_CONSTRAINTS);
  logEvent("inventory.updated", `Updated ${item.name}`, { itemId: item.id });
  res.json(item);
});

app.delete("/api/inventory/:id", (req, res) => {
  const before = inventory.length;
  inventory = inventory.filter((item) => item.id !== req.params.id);
  if (inventory.length === before) {
    res.status(404).json({ error: "inventory item not found" });
    return;
  }
  latestPlan = optimize(latestPlan?.constraints || DEFAULT_CONSTRAINTS);
  logEvent("inventory.removed", "Removed an inventory item", { itemId: req.params.id });
  res.status(204).send();
});

app.post("/api/simulate/day-pass", (_req, res) => {
  const spoiled = inventory.filter((item) => item.expiresInDays <= 0);
  inventory = inventory
    .map((item) => ({ ...item, expiresInDays: item.expiresInDays - 1 }))
    .filter((item) => item.expiresInDays >= 0 && item.quantity > 0);
  latestPlan = optimize(latestPlan?.constraints || DEFAULT_CONSTRAINTS);
  logEvent("simulation.day_passed", "Advanced pantry freshness by one day", {
    spoiledItems: spoiled.map((item) => item.name)
  });
  res.json(getSnapshot());
});

app.post("/api/seed", (_req, res) => {
  seedData();
  res.json(getSnapshot());
});

seedData();

app.listen(PORT, () => {
  logEvent("server.started", `Backend listening on ${PORT}`, { port: PORT });
  console.log(`Grocery-to-meal optimizer backend listening on ${PORT}`);
});
