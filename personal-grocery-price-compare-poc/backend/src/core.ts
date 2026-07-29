import crypto from "node:crypto";

export type GroceryCategory = "PRODUCE" | "DAIRY" | "MEAT" | "PANTRY" | "FROZEN" | "BAKERY" | "HOUSEHOLD" | "OTHER";
export type GroceryStatus = "NEEDED" | "BOUGHT" | "UNAVAILABLE" | "SUBSTITUTED" | "DUPLICATE";
export type PriceEventType = "ITEM_ADDED" | "ITEM_UPDATED" | "ITEM_BOUGHT" | "PRICE_UPDATED" | "AVAILABILITY_UPDATED" | "SUBSTITUTION_FOUND" | "STORE_SELECTED" | "PRICE_SCAN" | "REMINDER_SENT";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type GroceryItem = {
  id: string;
  name: string;
  category: GroceryCategory;
  quantity: number;
  unit: string;
  preferredBrand: string;
  maxPrice: number;
  status: GroceryStatus;
  updatedAt: string;
  notes: string;
};

export type Store = {
  id: string;
  name: string;
  distanceMiles: number;
  pickupAvailable: boolean;
  updatedAt: string;
};

export type StorePrice = {
  id: string;
  itemId: string;
  storeId: string;
  brand: string;
  price: number;
  unit: string;
  available: boolean;
  previousPrice: number | null;
  updatedAt: string;
};

export type Recommendation = {
  id: string;
  kind: "SINGLE_STORE" | "SPLIT_STORE";
  total: number;
  savings: number;
  storePlan: Record<string, string[]>;
  generatedAt: string;
};

export type PriceEventInput = {
  eventId: string;
  itemId: string;
  type: PriceEventType;
  occurredAt?: string;
  name?: string;
  category?: GroceryCategory;
  quantity?: number;
  unit?: string;
  preferredBrand?: string;
  maxPrice?: number;
  status?: GroceryStatus;
  storeId?: string;
  storeName?: string;
  brand?: string;
  price?: number;
  available?: boolean;
  substituteItemId?: string;
  notes?: string;
  source?: string;
};

export type PriceEvent = Required<Omit<PriceEventInput, "occurredAt" | "name" | "category" | "quantity" | "unit" | "preferredBrand" | "maxPrice" | "status" | "storeId" | "storeName" | "brand" | "price" | "available" | "substituteItemId" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  name: string;
  category: GroceryCategory;
  quantity: number;
  unit: string;
  preferredBrand: string;
  maxPrice: number;
  status: GroceryStatus;
  storeId: string;
  storeName: string;
  brand: string;
  price: number;
  available: boolean;
  substituteItemId: string;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  itemId: string;
  kind: "PRICE_DROP" | "OVER_BUDGET" | "UNAVAILABLE" | "SUBSTITUTION" | "DUPLICATE_ITEM" | "BEST_STORE_CHANGED";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "PRICE_REFRESH" | "AVAILABILITY_CHECK" | "RECOMMENDATION_BUILD" | "ALERT_DISPATCH" | "RETENTION";
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

export function priceEventKey(input: Pick<PriceEventInput, "itemId" | "eventId">) {
  if (!input.itemId || !input.eventId) throw new Error("itemId and eventId are required");
  return `${input.itemId}:${input.eventId}`;
}

export function groceryFingerprint(input: Pick<GroceryItem, "name" | "preferredBrand" | "unit">) {
  return `${input.name.trim().toLowerCase().replace(/\s+/g, " ")}:${input.preferredBrand.trim().toLowerCase().replace(/\s+/g, " ")}:${input.unit.trim().toLowerCase()}`;
}

export class GroceryPriceCompare {
  items: GroceryItem[] = [];
  stores: Store[] = [];
  prices: StorePrice[] = [];
  recommendations: Recommendation[] = [];
  events: PriceEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;
  selectedStoreId: string | null = null;

  seed(now: Date = new Date()) {
    this.stores = [
      { id: "store-market", name: "Neighborhood Market", distanceMiles: 1.2, pickupAvailable: true, updatedAt: iso(now) },
      { id: "store-value", name: "Value Foods", distanceMiles: 3.5, pickupAvailable: true, updatedAt: iso(now) },
      { id: "store-organic", name: "Green Basket", distanceMiles: 2.1, pickupAvailable: false, updatedAt: iso(now) }
    ];
    this.items = [
      this.item("item-milk", "Milk", "DAIRY", 1, "gallon", "Any", 4.5, "NEEDED", addMinutes(-90, now), "Weekly staple."),
      this.item("item-eggs", "Eggs", "DAIRY", 1, "dozen", "Any", 5, "NEEDED", addMinutes(-80, now), "Large eggs."),
      this.item("item-apples", "Apples", "PRODUCE", 3, "lb", "Honeycrisp", 8, "NEEDED", addMinutes(-70, now), "Lunch snacks."),
      this.item("item-chicken", "Chicken breast", "MEAT", 2, "lb", "Store brand", 14, "NEEDED", addMinutes(-60, now), "Meal prep."),
      this.item("item-detergent", "Laundry detergent", "HOUSEHOLD", 1, "bottle", "CleanCo", 13, "NEEDED", addMinutes(-50, now), "Buy if below cap.")
    ];
    this.prices = [
      this.price("price-milk-market", "item-milk", "store-market", "Any", 4.29, "gallon", true, 4.79, addMinutes(-35, now)),
      this.price("price-milk-value", "item-milk", "store-value", "Any", 3.99, "gallon", true, 4.19, addMinutes(-35, now)),
      this.price("price-milk-organic", "item-milk", "store-organic", "Organic Valley", 6.49, "gallon", true, 6.49, addMinutes(-35, now)),
      this.price("price-eggs-market", "item-eggs", "store-market", "Any", 4.89, "dozen", true, 4.89, addMinutes(-35, now)),
      this.price("price-eggs-value", "item-eggs", "store-value", "Any", 4.39, "dozen", true, 4.99, addMinutes(-35, now)),
      this.price("price-eggs-organic", "item-eggs", "store-organic", "Organic Farm", 6.79, "dozen", true, 6.99, addMinutes(-35, now)),
      this.price("price-apples-market", "item-apples", "store-market", "Honeycrisp", 2.49, "lb", true, 2.99, addMinutes(-35, now)),
      this.price("price-apples-value", "item-apples", "store-value", "Honeycrisp", 2.89, "lb", false, 2.89, addMinutes(-35, now)),
      this.price("price-apples-organic", "item-apples", "store-organic", "Honeycrisp", 3.49, "lb", true, 3.99, addMinutes(-35, now)),
      this.price("price-chicken-market", "item-chicken", "store-market", "Store brand", 6.49, "lb", true, 6.49, addMinutes(-35, now)),
      this.price("price-chicken-value", "item-chicken", "store-value", "Store brand", 5.79, "lb", true, 6.29, addMinutes(-35, now)),
      this.price("price-chicken-organic", "item-chicken", "store-organic", "Organic", 9.99, "lb", true, 9.99, addMinutes(-35, now)),
      this.price("price-detergent-market", "item-detergent", "store-market", "CleanCo", 12.99, "bottle", true, 15.99, addMinutes(-35, now)),
      this.price("price-detergent-value", "item-detergent", "store-value", "CleanCo", 14.49, "bottle", true, 14.49, addMinutes(-35, now)),
      this.price("price-detergent-organic", "item-detergent", "store-organic", "CleanCo", 16.99, "bottle", false, 16.99, addMinutes(-35, now))
    ];
    this.recommendations = [];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.selectedStoreId = null;
    this.buildRecommendations(now);
    this.scanPrices(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { items: this.items.length, stores: this.stores.length, alerts: this.alerts.length });
  }

  item(idValue: string, name: string, category: GroceryCategory, quantity: number, unit: string, preferredBrand: string, maxPrice: number, status: GroceryStatus, updatedAt: string, notes: string): GroceryItem {
    return { id: idValue, name, category, quantity, unit, preferredBrand, maxPrice, status, updatedAt: iso(updatedAt), notes };
  }

  price(idValue: string, itemId: string, storeId: string, brand: string, price: number, unit: string, available: boolean, previousPrice: number | null, updatedAt: string): StorePrice {
    return { id: idValue, itemId, storeId, brand, price, unit, available, previousPrice, updatedAt: iso(updatedAt) };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  itemById(itemId: string) {
    const item = this.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("item not found");
    return item;
  }

  storeById(storeId: string) {
    const store = this.stores.find((candidate) => candidate.id === storeId);
    if (!store) throw new Error("store not found");
    return store;
  }

  ingest(input: PriceEventInput) {
    let item = this.items.find((candidate) => candidate.id === input.itemId);
    const eventKey = priceEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!item && input.type !== "ITEM_ADDED") throw new Error("item not found");
    if (!item) {
      item = this.item(input.itemId, input.name || "New grocery", input.category || "OTHER", input.quantity || 1, input.unit || "each", input.preferredBrand || "Any", input.maxPrice || 999, "NEEDED", occurredAt, input.notes || "");
      this.items.push(item);
    }

    const event: PriceEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      itemId: input.itemId,
      type: input.type,
      occurredAt,
      name: input.name || item.name,
      category: input.category || item.category,
      quantity: input.quantity ?? item.quantity,
      unit: input.unit || item.unit,
      preferredBrand: input.preferredBrand || item.preferredBrand,
      maxPrice: input.maxPrice ?? item.maxPrice,
      status: input.status || item.status,
      storeId: input.storeId || "store-market",
      storeName: input.storeName || "",
      brand: input.brand || item.preferredBrand,
      price: input.price ?? 0,
      available: input.available ?? true,
      substituteItemId: input.substituteItemId || "",
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(item.updatedAt).getTime() && event.type !== "PRICE_SCAN";
    if (!staleUpdate) {
      if (event.type === "ITEM_ADDED" || event.type === "ITEM_UPDATED") this.applyItemEvent(item, event);
      if (event.type === "ITEM_BOUGHT") { item.status = "BOUGHT"; item.updatedAt = occurredAt; }
      if (event.type === "PRICE_UPDATED") this.applyPriceEvent(event);
      if (event.type === "AVAILABILITY_UPDATED") this.applyAvailabilityEvent(event);
      if (event.type === "SUBSTITUTION_FOUND") { item.status = "SUBSTITUTED"; item.updatedAt = occurredAt; this.ensureAlert(item, "SUBSTITUTION", `substitution:${item.id}:${event.substituteItemId || event.notes}`); }
      if (event.type === "STORE_SELECTED") { this.selectedStoreId = event.storeId; this.ensureAlert(item, "BEST_STORE_CHANGED", `store-selected:${event.storeId}:${occurredAt.slice(0, 13)}`); }
    }

    this.detectDuplicates();
    this.buildRecommendations(occurredAt);
    this.scanPrices(occurredAt);
    this.createAudit(staleUpdate ? "STALE_PRICE_EVENT_IGNORED" : "PRICE_EVENT_INGESTED", { eventId: event.id, itemId: item.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyItemEvent(item: GroceryItem, event: PriceEvent) {
    item.name = event.name;
    item.category = event.category;
    item.quantity = event.quantity;
    item.unit = event.unit;
    item.preferredBrand = event.preferredBrand;
    item.maxPrice = event.maxPrice;
    item.status = event.status;
    item.updatedAt = event.occurredAt;
    item.notes = event.notes || item.notes;
  }

  applyPriceEvent(event: PriceEvent) {
    this.storeById(event.storeId);
    const existing = this.prices.find((price) => price.itemId === event.itemId && price.storeId === event.storeId && price.brand.toLowerCase() === event.brand.toLowerCase());
    if (existing) {
      existing.previousPrice = existing.price;
      existing.price = event.price;
      existing.unit = event.unit;
      existing.available = event.available;
      existing.updatedAt = event.occurredAt;
      return existing;
    }
    const created = this.price(id("price"), event.itemId, event.storeId, event.brand, event.price, event.unit, event.available, null, event.occurredAt);
    this.prices.unshift(created);
    return created;
  }

  applyAvailabilityEvent(event: PriceEvent) {
    const price = this.prices.find((candidate) => candidate.itemId === event.itemId && candidate.storeId === event.storeId);
    if (!price) return this.applyPriceEvent(event);
    price.available = event.available;
    price.updatedAt = event.occurredAt;
    return price;
  }

  detectDuplicates() {
    const seen = new Map<string, GroceryItem>();
    for (const item of this.items.filter((candidate) => candidate.status !== "BOUGHT")) {
      const fingerprint = groceryFingerprint(item);
      const duplicate = seen.get(fingerprint);
      if (duplicate) {
        item.status = "DUPLICATE";
        this.ensureAlert(item, "DUPLICATE_ITEM", `duplicate:${fingerprint}`);
      } else {
        seen.set(fingerprint, item);
      }
    }
  }

  itemCostAtStore(item: GroceryItem, storeId: string) {
    const price = this.prices.find((candidate) => candidate.itemId === item.id && candidate.storeId === storeId && candidate.available);
    if (!price) return null;
    return { price, total: Number((price.price * item.quantity).toFixed(2)) };
  }

  storeCartTotal(storeId: string) {
    let total = 0;
    const missing: string[] = [];
    for (const item of this.items.filter((candidate) => candidate.status === "NEEDED" || candidate.status === "SUBSTITUTED")) {
      const cost = this.itemCostAtStore(item, storeId);
      if (!cost) missing.push(item.id);
      else total += cost.total;
    }
    return { storeId, total: Number(total.toFixed(2)), missing };
  }

  buildRecommendations(at: string | Date = new Date()) {
    const storeTotals = this.stores.map((store) => this.storeCartTotal(store.id)).sort((a, b) => a.missing.length - b.missing.length || a.total - b.total);
    const single = storeTotals[0];
    const splitPlan: Record<string, string[]> = {};
    let splitTotal = 0;
    for (const item of this.items.filter((candidate) => candidate.status === "NEEDED" || candidate.status === "SUBSTITUTED")) {
      const best = this.prices.filter((price) => price.itemId === item.id && price.available).map((price) => ({ storeId: price.storeId, total: Number((price.price * item.quantity).toFixed(2)) })).sort((a, b) => a.total - b.total)[0];
      if (best) {
        splitTotal += best.total;
        splitPlan[best.storeId] = [...(splitPlan[best.storeId] || []), item.id];
      }
    }
    const bestSingleComparable = storeTotals.find((total) => total.missing.length === 0) || single;
    this.recommendations = [
      { id: "rec-split", kind: "SPLIT_STORE", total: Number(splitTotal.toFixed(2)), savings: Number(Math.max(0, bestSingleComparable.total - splitTotal).toFixed(2)), storePlan: splitPlan, generatedAt: iso(at) },
      { id: "rec-single", kind: "SINGLE_STORE", total: bestSingleComparable.total, savings: 0, storePlan: { [bestSingleComparable.storeId]: this.items.filter((item) => item.status === "NEEDED" || item.status === "SUBSTITUTED").map((item) => item.id) }, generatedAt: iso(at) }
    ];
    return this.recommendations;
  }

  scanPrices(_asOf: string | Date = new Date()) {
    for (const item of this.items.filter((candidate) => candidate.status !== "BOUGHT" && candidate.status !== "DUPLICATE")) {
      const availablePrices = this.prices.filter((price) => price.itemId === item.id && price.available);
      if (availablePrices.length === 0) {
        item.status = "UNAVAILABLE";
        this.ensureAlert(item, "UNAVAILABLE", `unavailable:${item.id}`);
      }
      for (const price of availablePrices) {
        if (price.previousPrice !== null && price.price < price.previousPrice) this.ensureAlert(item, "PRICE_DROP", `drop:${item.id}:${price.storeId}:${price.updatedAt.slice(0, 13)}`);
        if (price.price * item.quantity > item.maxPrice) this.ensureAlert(item, "OVER_BUDGET", `budget:${item.id}:${price.storeId}`);
      }
    }
    return { alerts: this.alerts.length };
  }

  ensureAlert(item: GroceryItem, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), itemId: item.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  savingsScore() {
    const best = this.recommendations.find((rec) => rec.kind === "SPLIT_STORE");
    const single = this.recommendations.find((rec) => rec.kind === "SINGLE_STORE");
    if (!best || !single || single.total === 0) return 100;
    return Math.round(100 - (best.total / single.total) * 100 + 75);
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated grocery price provider timeout"; return { processed: true, job }; }
    if (job.kind === "PRICE_REFRESH") this.simulatePriceRefresh();
    if (job.kind === "AVAILABILITY_CHECK") this.scanPrices();
    if (job.kind === "RECOMMENDATION_BUILD") this.buildRecommendations();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  simulatePriceRefresh() { const price = this.prices.find((candidate) => candidate.itemId === "item-detergent" && candidate.storeId === "store-value"); if (price) { price.previousPrice = price.price; price.price = 11.99; price.updatedAt = iso(); } this.buildRecommendations(); this.scanPrices(); return price; }
  snapshot() { const needed = this.items.filter((item) => item.status === "NEEDED" || item.status === "SUBSTITUTED"); const split = this.recommendations.find((rec) => rec.kind === "SPLIT_STORE"); const single = this.recommendations.find((rec) => rec.kind === "SINGLE_STORE"); return { items: this.items, stores: this.stores, prices: this.prices, recommendations: this.recommendations, selectedStoreId: this.selectedStoreId, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, metrics: { score: this.savingsScore(), items: this.items.length, needed: needed.length, stores: this.stores.length, bestTotal: split?.total || 0, singleStoreTotal: single?.total || 0, savings: split?.savings || 0, unavailable: this.items.filter((item) => item.status === "UNAVAILABLE").length, duplicates: this.items.filter((item) => item.status === "DUPLICATE").length, priceDrops: this.alerts.filter((alert) => alert.kind === "PRICE_DROP").length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { items: this.items, stores: this.stores, prices: this.prices, recommendations: this.recommendations, selectedStoreId: this.selectedStoreId, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.items = state.items as GroceryItem[]; this.stores = state.stores as Store[]; this.prices = state.prices as StorePrice[]; this.recommendations = state.recommendations as Recommendation[] || []; this.selectedStoreId = state.selectedStoreId as string | null; this.events = state.events as PriceEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededGroceryCompare(now: Date = new Date()) { const compare = new GroceryPriceCompare(); compare.seed(now); return compare; }
