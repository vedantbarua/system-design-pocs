import { FormEvent, useEffect, useMemo, useState } from "react";

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

type Recipe = {
  id: string;
  name: string;
  mealType: MealType;
  servings: number;
  prepMinutes: number;
  tags: string[];
  caloriesPerServing: number;
  proteinPerServing: number;
  estimatedCostPerServing: number;
};

type Constraints = {
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

type MissingIngredient = {
  name: string;
  quantity: number;
  unit: string;
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
  missingIngredients: MissingIngredient[];
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
  constraints: Constraints;
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

type Snapshot = {
  inventory: InventoryItem[];
  recipes: Recipe[];
  latestPlan: OptimizationResult | null;
  expiringItems: InventoryItem[];
  events: EventEntry[];
  system: {
    recipes: number;
    inventoryItems: number;
    lowStockItems: number;
    expiringItems: number;
  };
};

type NewInventoryForm = {
  name: string;
  category: Category;
  quantity: string;
  unit: string;
  expiresInDays: string;
  costPerUnit: string;
  tags: string;
};

const DEFAULT_CONSTRAINTS: Constraints = {
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

const DEFAULT_INVENTORY_FORM: NewInventoryForm = {
  name: "",
  category: "produce",
  quantity: "1",
  unit: "count",
  expiresInDays: "7",
  costPerUnit: "1.00",
  tags: ""
};

const CATEGORIES: Category[] = [
  "produce",
  "protein",
  "dairy",
  "grain",
  "pantry",
  "frozen",
  "spice"
];

const TAG_OPTIONS = [
  "quick",
  "high-protein",
  "vegetarian",
  "pescatarian",
  "meal-prep",
  "high-fiber",
  "low-carb"
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function formatTime(epochMs: number) {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function freshnessClass(days: number) {
  if (days <= 1) return "freshness urgent";
  if (days <= 3) return "freshness warning";
  return "freshness stable";
}

function scoreClass(score: number) {
  if (score >= 82) return "score high";
  if (score >= 66) return "score medium";
  return "score low";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [constraints, setConstraints] = useState<Constraints>(DEFAULT_CONSTRAINTS);
  const [inventoryForm, setInventoryForm] = useState<NewInventoryForm>(DEFAULT_INVENTORY_FORM);
  const [selectedDay, setSelectedDay] = useState(1);
  const [status, setStatus] = useState("Loading pantry state...");
  const [error, setError] = useState<string | null>(null);

  const plan = snapshot?.latestPlan;
  const visibleMeals = useMemo(
    () => plan?.plan.filter((meal) => meal.day === selectedDay) || [],
    [plan, selectedDay]
  );

  const groupedInventory = useMemo(() => {
    const groups = new Map<Category, InventoryItem[]>();
    for (const item of snapshot?.inventory || []) {
      const group = groups.get(item.category) || [];
      group.push(item);
      groups.set(item.category, group);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [snapshot]);

  const days = useMemo(() => {
    const count = plan?.constraints.days || constraints.days;
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [constraints.days, plan?.constraints.days]);

  const loadSnapshot = async () => {
    const data = await fetchJson<Snapshot>("/api/snapshot");
    setSnapshot(data);
    if (data.latestPlan) {
      setConstraints(data.latestPlan.constraints);
      setSelectedDay((current) => Math.min(current, data.latestPlan?.constraints.days || 1));
    }
  };

  useEffect(() => {
    loadSnapshot()
      .then(() => setStatus("Live optimizer snapshot loaded"))
      .catch((err: Error) => setError(err.message));

    const interval = setInterval(() => {
      loadSnapshot().catch((err: Error) => setError(err.message));
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const runOptimizer = async (nextConstraints = constraints) => {
    setError(null);
    const result = await fetchJson<OptimizationResult>("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextConstraints)
    });
    setSnapshot((current) =>
      current
        ? {
            ...current,
            latestPlan: result
          }
        : current
    );
    setSelectedDay(1);
    setStatus(`Generated ${result.metrics.totalMeals} meals with ${result.metrics.pantryCoveragePct}% pantry coverage`);
    await loadSnapshot();
  };

  const updateWeight = (key: keyof Constraints["weights"], value: number) => {
    setConstraints((current) => ({
      ...current,
      weights: {
        ...current.weights,
        [key]: value
      }
    }));
  };

  const toggleTag = (mode: "preferredTags" | "avoidTags", tag: string) => {
    setConstraints((current) => {
      const existing = current[mode];
      const next = existing.includes(tag)
        ? existing.filter((entry) => entry !== tag)
        : [...existing, tag];
      return { ...current, [mode]: next };
    });
  };

  const addInventory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const payload = {
      ...inventoryForm,
      quantity: Number(inventoryForm.quantity),
      expiresInDays: Number(inventoryForm.expiresInDays),
      costPerUnit: Number(inventoryForm.costPerUnit),
      tags: inventoryForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    };
    await fetchJson<InventoryItem>("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setInventoryForm(DEFAULT_INVENTORY_FORM);
    setStatus(`Added ${payload.name} and re-optimized the plan`);
    await loadSnapshot();
  };

  const adjustQuantity = async (item: InventoryItem, delta: number) => {
    const nextQuantity = Math.max(0, Number((item.quantity + delta).toFixed(2)));
    await fetchJson<InventoryItem>(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: nextQuantity })
    });
    await loadSnapshot();
  };

  const simulateDay = async () => {
    setError(null);
    const data = await fetchJson<Snapshot>("/api/simulate/day-pass", { method: "POST" });
    setSnapshot(data);
    setStatus("Advanced freshness by one day and recalculated the optimizer");
  };

  const resetSeed = async () => {
    const data = await fetchJson<Snapshot>("/api/seed", { method: "POST" });
    setSnapshot(data);
    setSelectedDay(1);
    setStatus("Seed pantry restored");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">System Design POC</p>
          <h1>Grocery-to-Meal Optimizer</h1>
          <p className="summary">
            Converts pantry state, freshness windows, budget pressure, and nutrition goals
            into an explainable meal plan with shopping deltas.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={simulateDay}>
            Advance day
          </button>
          <button type="button" className="secondary" onClick={resetSeed}>
            Reset seed
          </button>
          <button type="button" onClick={() => runOptimizer()}>
            Optimize
          </button>
        </div>
      </header>

      <section className="status-row" aria-live="polite">
        <span>{status}</span>
        {error ? <strong>{error}</strong> : null}
      </section>

      <section className="metric-grid">
        <Metric label="Meals" value={plan?.metrics.totalMeals ?? 0} detail={`${plan?.metrics.totalServings ?? 0} servings`} />
        <Metric label="Pantry coverage" value={`${plan?.metrics.pantryCoveragePct ?? 0}%`} detail="required ingredients matched" />
        <Metric label="Shopping spend" value={formatMoney(plan?.metrics.estimatedSpend ?? 0)} detail={`cap ${formatMoney(constraints.budgetCap)}`} />
        <Metric label="Expiring rescued" value={plan?.metrics.rescuedExpiringItems ?? 0} detail={`${snapshot?.system.expiringItems ?? 0} at risk`} />
        <Metric label="Protein" value={`${plan?.metrics.avgProteinPerServing ?? 0}g`} detail="avg per serving" />
      </section>

      <div className="workspace">
        <section className="panel controls-panel">
          <div className="section-heading">
            <h2>Optimizer Controls</h2>
            <span>{snapshot?.recipes.length ?? 0} recipe candidates</span>
          </div>

          <div className="control-grid">
            <label>
              Days
              <input
                type="number"
                min="1"
                max="7"
                value={constraints.days}
                onChange={(event) =>
                  setConstraints((current) => ({ ...current, days: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              Servings
              <input
                type="number"
                min="1"
                max="8"
                value={constraints.servings}
                onChange={(event) =>
                  setConstraints((current) => ({
                    ...current,
                    servings: Number(event.target.value)
                  }))
                }
              />
            </label>
            <label>
              Budget cap
              <input
                type="number"
                min="5"
                value={constraints.budgetCap}
                onChange={(event) =>
                  setConstraints((current) => ({
                    ...current,
                    budgetCap: Number(event.target.value)
                  }))
                }
              />
            </label>
          </div>

          <div className="slider-stack">
            {Object.entries(constraints.weights).map(([key, value]) => (
              <label key={key} className="slider-row">
                <span>{key}</span>
                <input
                  type="range"
                  min="0"
                  max="60"
                  value={value}
                  onChange={(event) =>
                    updateWeight(key as keyof Constraints["weights"], Number(event.target.value))
                  }
                />
                <b>{value}</b>
              </label>
            ))}
          </div>

          <div className="tag-columns">
            <TagChooser
              label="Prefer"
              active={constraints.preferredTags}
              onToggle={(tag) => toggleTag("preferredTags", tag)}
            />
            <TagChooser
              label="Avoid"
              active={constraints.avoidTags}
              onToggle={(tag) => toggleTag("avoidTags", tag)}
            />
          </div>
        </section>

        <section className="panel plan-panel">
          <div className="section-heading">
            <h2>Meal Plan</h2>
            <div className="segmented">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={selectedDay === day ? "active" : ""}
                  onClick={() => setSelectedDay(day)}
                >
                  Day {day}
                </button>
              ))}
            </div>
          </div>

          <div className="meal-list">
            {visibleMeals.map((meal) => (
              <article className="meal-row" key={meal.slot}>
                <div className="meal-main">
                  <span className="meal-type">{meal.mealType}</span>
                  <h3>{meal.recipeName}</h3>
                  <p>
                    {meal.servings} servings, {meal.prepMinutes} min, {meal.proteinPerServing}g
                    protein per serving
                  </p>
                  <div className="ingredient-line">
                    <span>Using {meal.matchedIngredients.join(", ") || "shopping list items"}</span>
                  </div>
                </div>
                <div className="meal-score">
                  <span className={scoreClass(meal.score)}>{meal.score}</span>
                  <ScoreBars breakdown={meal.scoreBreakdown} />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="lower-grid">
        <section className="panel inventory-panel">
          <div className="section-heading">
            <h2>Pantry Inventory</h2>
            <span>{snapshot?.inventory.length ?? 0} items</span>
          </div>

          <form className="inventory-form" onSubmit={addInventory}>
            <input
              placeholder="Item name"
              value={inventoryForm.name}
              onChange={(event) =>
                setInventoryForm((current) => ({ ...current, name: event.target.value }))
              }
            />
            <select
              value={inventoryForm.category}
              onChange={(event) =>
                setInventoryForm((current) => ({
                  ...current,
                  category: event.target.value as Category
                }))
              }
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.1"
              aria-label="Quantity"
              value={inventoryForm.quantity}
              onChange={(event) =>
                setInventoryForm((current) => ({ ...current, quantity: event.target.value }))
              }
            />
            <input
              placeholder="unit"
              value={inventoryForm.unit}
              onChange={(event) =>
                setInventoryForm((current) => ({ ...current, unit: event.target.value }))
              }
            />
            <input
              type="number"
              min="0"
              aria-label="Days until expiry"
              value={inventoryForm.expiresInDays}
              onChange={(event) =>
                setInventoryForm((current) => ({
                  ...current,
                  expiresInDays: event.target.value
                }))
              }
            />
            <button type="submit">Add</button>
          </form>

          <div className="inventory-groups">
            {groupedInventory.map(([category, items]) => (
              <div className="inventory-group" key={category}>
                <h3>{category}</h3>
                {items.map((item) => (
                  <div className="inventory-row" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.quantity} {item.unit} at {formatMoney(item.costPerUnit)} / {item.unit}
                      </span>
                    </div>
                    <div className="inventory-actions">
                      <span className={freshnessClass(item.expiresInDays)}>
                        {item.expiresInDays}d
                      </span>
                      <button type="button" onClick={() => adjustQuantity(item, -1)}>
                        -
                      </button>
                      <button type="button" onClick={() => adjustQuantity(item, 1)}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="panel shopping-panel">
          <div className="section-heading">
            <h2>Shopping Delta</h2>
            <span>{plan?.shoppingList.length ?? 0} missing groups</span>
          </div>

          <div className="shopping-list">
            {(plan?.shoppingList || []).map((item) => (
              <div className="shopping-row" key={`${item.name}-${item.unit}`}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.quantity} {item.unit} for {item.recipes.join(", ")}
                  </span>
                </div>
                <b>{formatMoney(item.estimatedCost)}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="panel events-panel">
          <div className="section-heading">
            <h2>Optimizer Events</h2>
            <span>latest {snapshot?.events.length ?? 0}</span>
          </div>
          <div className="event-list">
            {(snapshot?.events || []).slice(0, 10).map((event) => (
              <div className="event-row" key={event.id}>
                <time>{formatTime(event.at)}</time>
                <div>
                  <strong>{event.type}</strong>
                  <span>{event.message}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function TagChooser({
  label,
  active,
  onToggle
}: {
  label: string;
  active: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div>
      <h3>{label}</h3>
      <div className="chips">
        {TAG_OPTIONS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={active.includes(tag) ? "selected" : ""}
            onClick={() => onToggle(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreBars({ breakdown }: { breakdown: Record<string, number> }) {
  return (
    <div className="score-bars">
      {Object.entries(breakdown).map(([key, value]) => (
        <div className="score-bar" key={key}>
          <span>{key}</span>
          <i>
            <b style={{ width: `${value}%` }} />
          </i>
        </div>
      ))}
    </div>
  );
}
