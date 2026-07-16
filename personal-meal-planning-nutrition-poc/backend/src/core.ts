import crypto from "node:crypto";

export type MealSlot = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type MealStatus = "PLANNED" | "PREPPED" | "COOKED" | "SKIPPED" | "SWAPPED" | "NEEDS_GROCERIES" | "DUPLICATE";
export type MealEventType = "MEAL_PLANNED" | "RECIPE_SWAPPED" | "MEAL_PREPPED" | "MEAL_COOKED" | "MEAL_SKIPPED" | "INGREDIENT_CONSUMED" | "GROCERY_ADDED" | "NUTRITION_SCAN" | "TARGET_UPDATED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type MealPlan = {
  id: string;
  day: string;
  slot: MealSlot;
  recipe: string;
  servings: number;
  calories: number;
  protein: number;
  fiber: number;
  sodium: number;
  budget: number;
  ingredients: string[];
  status: MealStatus;
  updatedAt: string;
  notes: string;
};

export type GroceryGap = {
  id: string;
  item: string;
  quantity: number;
  unit: string;
  neededBy: string;
  sourceMealId: string;
  duplicateOf: string | null;
  status: "NEEDED" | "BOUGHT" | "DUPLICATE";
};

export type PantryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expiresAt: string;
  updatedAt: string;
};

export type NutritionTarget = {
  calories: number;
  protein: number;
  fiber: number;
  sodium: number;
  budget: number;
  restrictions: string[];
};

export type MealEventInput = {
  eventId: string;
  mealId: string;
  type: MealEventType;
  occurredAt?: string;
  day?: string;
  slot?: MealSlot;
  recipe?: string;
  servings?: number;
  calories?: number;
  protein?: number;
  fiber?: number;
  sodium?: number;
  budget?: number;
  ingredients?: string[];
  status?: MealStatus;
  item?: string;
  quantity?: number;
  unit?: string;
  restrictions?: string[];
  notes?: string;
  source?: string;
};

export type MealEvent = Required<Omit<MealEventInput, "occurredAt" | "day" | "slot" | "recipe" | "servings" | "calories" | "protein" | "fiber" | "sodium" | "budget" | "ingredients" | "status" | "item" | "quantity" | "unit" | "restrictions" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  day: string;
  slot: MealSlot;
  recipe: string;
  servings: number;
  calories: number;
  protein: number;
  fiber: number;
  sodium: number;
  budget: number;
  ingredients: string[];
  status: MealStatus;
  item: string;
  quantity: number;
  unit: string;
  restrictions: string[];
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  mealId: string;
  kind: "GROCERY_NEEDED" | "DUPLICATE_GROCERY" | "NUTRITION_OVER" | "NUTRITION_UNDER" | "EXPIRING_INGREDIENT" | "BUDGET_OVER";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "MEAL_SCAN" | "GROCERY_REBUILD" | "REMINDER_DISPATCH" | "RETENTION";
  status: JobStatus;
  attempts: number;
  dedupeKey: string;
  queuedAt: string;
  completedAt: string | null;
  lastError: string | null;
};

export type Audit = { id: string; action: string; details: Record<string, unknown>; at: string };

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export function iso(value: string | number | Date = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

export function addMinutes(minutes: number, value: string | number | Date = new Date()) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

export function mealEventKey(input: Pick<MealEventInput, "mealId" | "eventId">) {
  if (!input.mealId || !input.eventId) throw new Error("mealId and eventId are required");
  return `${input.mealId}:${input.eventId}`;
}

export function groceryFingerprint(item: string, neededBy: string) {
  return `${item.trim().toLowerCase().replace(/\s+/g, " ")}:${iso(neededBy).slice(0, 10)}`;
}

export class MealPlanningNutrition {
  meals: MealPlan[] = [];
  groceries: GroceryGap[] = [];
  pantry: PantryItem[] = [];
  target: NutritionTarget = { calories: 2100, protein: 120, fiber: 30, sodium: 2300, budget: 24, restrictions: ["no shellfish"] };
  events: MealEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.meals = [
      this.meal("meal-oats", addMinutes(1 * 24 * 60, now), "BREAKFAST", "Overnight oats", 1, 420, 28, 9, 180, 3.5, ["oats", "yogurt", "berries"], "PLANNED", addMinutes(-2 * 24 * 60, now), "Prep tonight."),
      this.meal("meal-salad", addMinutes(1 * 24 * 60, now), "LUNCH", "Chicken grain salad", 1, 610, 45, 11, 520, 7.25, ["chicken", "quinoa", "greens", "avocado"], "PLANNED", addMinutes(-2 * 24 * 60, now), "Use leftover chicken."),
      this.meal("meal-tacos", addMinutes(1 * 24 * 60, now), "DINNER", "Turkey tacos", 2, 760, 52, 8, 980, 9.5, ["turkey", "tortillas", "salsa", "lettuce"], "NEEDS_GROCERIES", addMinutes(-1 * 24 * 60, now), "Buy tortillas."),
      this.meal("meal-smoothie", addMinutes(2 * 24 * 60, now), "BREAKFAST", "Green smoothie", 1, 360, 24, 7, 120, 4.5, ["spinach", "banana", "protein powder"], "PLANNED", addMinutes(-1 * 24 * 60, now), "Use spinach before expiry."),
      this.meal("meal-pasta", addMinutes(2 * 24 * 60, now), "DINNER", "Lentil pasta", 2, 820, 38, 16, 690, 8.75, ["lentil pasta", "tomato sauce", "parmesan"], "PLANNED", addMinutes(-1 * 24 * 60, now), "Good leftovers.")
    ];
    this.pantry = [
      { id: "pantry-oats", name: "oats", quantity: 1, unit: "bag", expiresAt: addMinutes(90 * 24 * 60, now), updatedAt: iso(now) },
      { id: "pantry-yogurt", name: "yogurt", quantity: 2, unit: "cups", expiresAt: addMinutes(2 * 24 * 60, now), updatedAt: iso(now) },
      { id: "pantry-spinach", name: "spinach", quantity: 1, unit: "box", expiresAt: addMinutes(1 * 24 * 60, now), updatedAt: iso(now) },
      { id: "pantry-chicken", name: "chicken", quantity: 1, unit: "pack", expiresAt: addMinutes(3 * 24 * 60, now), updatedAt: iso(now) }
    ];
    this.groceries = [];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.rebuildGroceries();
    this.scanNutrition(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { meals: this.meals.length, groceries: this.groceries.length, alerts: this.alerts.length });
  }

  meal(idValue: string, day: string, slot: MealSlot, recipe: string, servings: number, calories: number, protein: number, fiber: number, sodium: number, budget: number, ingredients: string[], status: MealStatus, updatedAt: string, notes: string): MealPlan {
    return { id: idValue, day: iso(day), slot, recipe, servings, calories, protein, fiber, sodium, budget, ingredients, status, updatedAt: iso(updatedAt), notes };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  mealById(mealId: string) {
    const meal = this.meals.find((candidate) => candidate.id === mealId);
    if (!meal) throw new Error("meal not found");
    return meal;
  }

  ingest(input: MealEventInput) {
    let meal = this.meals.find((candidate) => candidate.id === input.mealId);
    const eventKey = mealEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!meal && input.type !== "MEAL_PLANNED" && input.type !== "GROCERY_ADDED") throw new Error("meal not found");
    if (!meal) {
      meal = this.meal(input.mealId, input.day || occurredAt, input.slot || "DINNER", input.recipe || "New meal", input.servings || 1, input.calories || 500, input.protein || 25, input.fiber || 6, input.sodium || 500, input.budget || 6, input.ingredients || [], input.status || "PLANNED", occurredAt, input.notes || "");
      this.meals.push(meal);
    }

    const event: MealEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      mealId: input.mealId,
      type: input.type,
      occurredAt,
      day: input.day ? iso(input.day) : meal.day,
      slot: input.slot || meal.slot,
      recipe: input.recipe || meal.recipe,
      servings: input.servings || meal.servings,
      calories: input.calories ?? meal.calories,
      protein: input.protein ?? meal.protein,
      fiber: input.fiber ?? meal.fiber,
      sodium: input.sodium ?? meal.sodium,
      budget: input.budget ?? meal.budget,
      ingredients: input.ingredients || meal.ingredients,
      status: input.status || meal.status,
      item: input.item || "",
      quantity: input.quantity || 1,
      unit: input.unit || "each",
      restrictions: input.restrictions || this.target.restrictions,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(meal.updatedAt).getTime() && event.type !== "NUTRITION_SCAN";
    if (!staleUpdate) {
      if (event.type === "MEAL_PLANNED" || event.type === "RECIPE_SWAPPED") this.applyEventToMeal(meal, event, event.type === "RECIPE_SWAPPED" ? "SWAPPED" : "PLANNED");
      if (event.type === "MEAL_PREPPED") this.applyEventToMeal(meal, event, "PREPPED");
      if (event.type === "MEAL_COOKED") this.applyEventToMeal(meal, event, "COOKED");
      if (event.type === "MEAL_SKIPPED") this.applyEventToMeal(meal, event, "SKIPPED");
      if (event.type === "INGREDIENT_CONSUMED") this.consumeIngredient(event.item, event.quantity, event.unit, occurredAt);
      if (event.type === "GROCERY_ADDED") this.addGrocery(event.item, event.quantity, event.unit, event.day, "manual");
      if (event.type === "TARGET_UPDATED") this.target = { calories: event.calories, protein: event.protein, fiber: event.fiber, sodium: event.sodium, budget: event.budget, restrictions: event.restrictions };
    }

    this.rebuildGroceries();
    this.scanNutrition(occurredAt);
    this.createAudit(staleUpdate ? "STALE_MEAL_EVENT_IGNORED" : "MEAL_EVENT_INGESTED", { eventId: event.id, mealId: meal.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyEventToMeal(meal: MealPlan, event: MealEvent, status: MealStatus) {
    meal.day = event.day;
    meal.slot = event.slot;
    meal.recipe = event.recipe;
    meal.servings = event.servings;
    meal.calories = event.calories;
    meal.protein = event.protein;
    meal.fiber = event.fiber;
    meal.sodium = event.sodium;
    meal.budget = event.budget;
    meal.ingredients = event.ingredients;
    meal.status = status;
    meal.updatedAt = event.occurredAt;
    meal.notes = event.notes || meal.notes;
  }

  consumeIngredient(item: string, quantity: number, unit: string, at: string) {
    const pantry = this.pantry.find((candidate) => candidate.name.toLowerCase() === item.toLowerCase());
    if (!pantry) return null;
    pantry.quantity = Math.max(0, pantry.quantity - quantity);
    pantry.unit = unit || pantry.unit;
    pantry.updatedAt = iso(at);
    return pantry;
  }

  addGrocery(item: string, quantity: number, unit: string, neededBy: string, mealId: string) {
    const fingerprint = groceryFingerprint(item, neededBy);
    const duplicate = this.groceries.find((candidate) => groceryFingerprint(candidate.item, candidate.neededBy) === fingerprint && candidate.status !== "BOUGHT");
    const gap: GroceryGap = { id: id("grocery"), item, quantity, unit, neededBy: iso(neededBy), sourceMealId: mealId, duplicateOf: duplicate?.id || null, status: duplicate ? "DUPLICATE" : "NEEDED" };
    this.groceries.unshift(gap);
    if (duplicate) this.ensureAlert(this.meals.find((meal) => meal.id === mealId) || this.meals[0], "DUPLICATE_GROCERY", `duplicate-grocery:${fingerprint}`);
    return gap;
  }

  rebuildGroceries() {
    const manual = this.groceries.filter((gap) => gap.sourceMealId === "manual");
    this.groceries = manual;
    for (const meal of this.meals.filter((candidate) => candidate.status !== "COOKED" && candidate.status !== "SKIPPED")) {
      for (const ingredient of meal.ingredients) {
        const pantry = this.pantry.find((item) => item.name.toLowerCase() === ingredient.toLowerCase());
        if (!pantry || pantry.quantity <= 0) {
          this.addGrocery(ingredient, 1, "each", meal.day, meal.id);
          meal.status = meal.status === "PLANNED" ? "NEEDS_GROCERIES" : meal.status;
          this.ensureAlert(meal, "GROCERY_NEEDED", `grocery:${meal.id}:${ingredient}`);
        }
      }
    }
    return this.groceries;
  }

  scanNutrition(asOf: string | Date = new Date()) {
    const byDay = new Map<string, MealPlan[]>();
    for (const meal of this.meals.filter((candidate) => !["SKIPPED", "DUPLICATE"].includes(candidate.status))) {
      const day = meal.day.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) || []), meal]);
    }
    for (const [day, meals] of byDay) {
      const totals = meals.reduce((sum, meal) => ({ calories: sum.calories + meal.calories, protein: sum.protein + meal.protein, fiber: sum.fiber + meal.fiber, sodium: sum.sodium + meal.sodium, budget: sum.budget + meal.budget }), { calories: 0, protein: 0, fiber: 0, sodium: 0, budget: 0 });
      const meal = meals[0];
      if (totals.calories > this.target.calories || totals.sodium > this.target.sodium) this.ensureAlert(meal, "NUTRITION_OVER", `nutrition-over:${day}`);
      if (totals.protein < this.target.protein || totals.fiber < this.target.fiber) this.ensureAlert(meal, "NUTRITION_UNDER", `nutrition-under:${day}`);
      if (totals.budget > this.target.budget) this.ensureAlert(meal, "BUDGET_OVER", `budget:${day}`);
    }
    const now = new Date(asOf).getTime();
    for (const item of this.pantry) {
      const expiresIn = (new Date(item.expiresAt).getTime() - now) / 60_000;
      if (item.quantity > 0 && expiresIn <= 3 * 24 * 60) this.ensureAlertForMeal("EXPIRING_INGREDIENT", `expiring:${item.id}:${item.expiresAt.slice(0, 10)}`);
    }
    return { alerts: this.alerts.length };
  }

  ensureAlert(meal: MealPlan, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), mealId: meal.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureAlertForMeal(kind: Alert["kind"], dedupeKey: string) {
    return this.ensureAlert(this.meals[0], kind, dedupeKey);
  }

  nutritionScore() {
    if (this.meals.length === 0) return 100;
    const ready = this.meals.filter((meal) => ["PLANNED", "PREPPED", "COOKED"].includes(meal.status)).length;
    return Math.round((ready / this.meals.length) * 100);
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 180, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated grocery reminder provider timeout"; return { processed: true, job }; }
    if (job.kind === "MEAL_SCAN") this.scanNutrition();
    if (job.kind === "GROCERY_REBUILD") this.rebuildGroceries();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(180);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { meals: [...this.meals].sort((a, b) => a.day.localeCompare(b.day) || a.slot.localeCompare(b.slot)), groceries: this.groceries, pantry: this.pantry, target: this.target, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, metrics: { score: this.nutritionScore(), meals: this.meals.length, planned: this.meals.filter((meal) => meal.status === "PLANNED").length, needsGroceries: this.meals.filter((meal) => meal.status === "NEEDS_GROCERIES").length, cooked: this.meals.filter((meal) => meal.status === "COOKED").length, groceries: this.groceries.filter((gap) => gap.status === "NEEDED").length, duplicates: this.groceries.filter((gap) => gap.status === "DUPLICATE").length, expiring: this.pantry.filter((item) => item.quantity > 0 && new Date(item.expiresAt).getTime() - Date.now() <= 3 * 24 * 60 * 60_000).length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { meals: this.meals, groceries: this.groceries, pantry: this.pantry, target: this.target, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.meals = state.meals as MealPlan[]; this.groceries = state.groceries as GroceryGap[] || []; this.pantry = state.pantry as PantryItem[] || []; this.target = state.target as NutritionTarget; this.events = state.events as MealEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededMealPlanner(now: Date = new Date()) { const planner = new MealPlanningNutrition(); planner.seed(now); return planner; }
