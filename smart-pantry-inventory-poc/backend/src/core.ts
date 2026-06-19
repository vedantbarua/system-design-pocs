import crypto from "node:crypto";

export type Unit = "each" | "carton" | "bag" | "bottle";
export type Category = "produce" | "dairy" | "pantry" | "beverage" | "household";
export type StockEventType = "RECEIVE" | "CONSUME" | "WASTE" | "ADJUST";
export type EventSource = "seed" | "api" | "kafka" | "replay";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";
export type ShoppingStatus = "NEEDED" | "IN_CART" | "BOUGHT";

export type Product = {
  id: string;
  name: string;
  category: Category;
  barcode: string;
  unit: Unit;
  lowStockThreshold: number;
  defaultLocation: string;
};

export type InventoryLot = {
  id: string;
  productId: string;
  quantity: number;
  initialQuantity: number;
  expiresAt: string | null;
  receivedAt: string;
  location: string;
  unitCost: number;
};

export type Allocation = { lotId: string; quantity: number };

export type StockEvent = {
  id: string;
  eventId: string;
  eventKey: string;
  productId: string;
  type: StockEventType;
  quantity: number;
  allocations: Allocation[];
  actor: string;
  source: EventSource;
  occurredAt: string;
};

export type ShoppingItem = {
  id: string;
  productId: string;
  quantity: number;
  status: ShoppingStatus;
  reason: "LOW_STOCK" | "MANUAL";
  createdAt: string;
  updatedAt: string;
};

export type PantryJob = {
  id: string;
  kind: "EXPIRATION_SCAN" | "SHOPPING_REBUILD";
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  dedupeKey: string;
  payload: Record<string, string | number>;
  queuedAt: string;
  completedAt: string | null;
  lastError: string | null;
};

export type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  at: string;
};

export type StockEventInput = {
  eventId: string;
  productId: string;
  type: StockEventType;
  quantity: number;
  expiresAt?: string | null;
  location?: string;
  unitCost?: number;
  actor?: string;
  source?: EventSource;
  occurredAt?: string;
};

export function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function iso(value: string | number | Date = new Date()): string {
  const parsed = new Date(value);
  assertCondition(!Number.isNaN(parsed.getTime()), "invalid timestamp");
  return parsed.toISOString();
}

export function addDays(days: number, from: Date = new Date()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export function stockEventKey(input: Pick<StockEventInput, "productId" | "eventId">): string {
  assertCondition(input.productId, "productId is required");
  assertCondition(input.eventId, "eventId is required");
  return `${input.productId}:${input.eventId}`;
}

export class SmartPantry {
  products: Product[] = [];
  lots: InventoryLot[] = [];
  stockEvents: StockEvent[] = [];
  shoppingItems: ShoppingItem[] = [];
  jobs: PantryJob[] = [];
  audit: AuditEvent[] = [];
  processedEvents = new Set<string>();
  failNextJob = false;

  seed(): void {
    this.products = [
      { id: "prod-milk", name: "Oat milk", category: "dairy", barcode: "012345000101", unit: "carton", lowStockThreshold: 1, defaultLocation: "Fridge" },
      { id: "prod-spinach", name: "Baby spinach", category: "produce", barcode: "012345000102", unit: "bag", lowStockThreshold: 1, defaultLocation: "Fridge" },
      { id: "prod-eggs", name: "Eggs", category: "dairy", barcode: "012345000103", unit: "each", lowStockThreshold: 6, defaultLocation: "Fridge" },
      { id: "prod-rice", name: "Jasmine rice", category: "pantry", barcode: "012345000104", unit: "bag", lowStockThreshold: 1, defaultLocation: "Pantry" },
      { id: "prod-coffee", name: "Coffee beans", category: "beverage", barcode: "012345000105", unit: "bag", lowStockThreshold: 1, defaultLocation: "Pantry" }
    ];
    this.lots = [];
    this.stockEvents = [];
    this.shoppingItems = [];
    this.jobs = [];
    this.audit = [];
    this.processedEvents = new Set();
    this.failNextJob = false;
    this.applyStockEvent({ eventId: "seed-milk", productId: "prod-milk", type: "RECEIVE", quantity: 2, expiresAt: addDays(3), unitCost: 4.49, source: "seed" });
    this.applyStockEvent({ eventId: "seed-spinach", productId: "prod-spinach", type: "RECEIVE", quantity: 1, expiresAt: addDays(1), unitCost: 3.29, source: "seed" });
    this.applyStockEvent({ eventId: "seed-eggs", productId: "prod-eggs", type: "RECEIVE", quantity: 8, expiresAt: addDays(12), unitCost: 0.35, source: "seed" });
    this.applyStockEvent({ eventId: "seed-rice", productId: "prod-rice", type: "RECEIVE", quantity: 1, expiresAt: addDays(90), unitCost: 8.99, source: "seed" });
    this.applyStockEvent({ eventId: "seed-coffee", productId: "prod-coffee", type: "RECEIVE", quantity: 3, expiresAt: addDays(45), unitCost: 13.5, source: "seed" });
    this.audit = [];
    this.createAudit("DEMO_SEEDED", "system", { products: this.products.length, lots: this.lots.length });
  }

  createAudit(action: string, actor: string, details: Record<string, unknown>): AuditEvent {
    const event = { id: id("audit"), action, actor, details, at: iso() };
    this.audit.unshift(event);
    return event;
  }

  quantityFor(productId: string): number {
    return this.lots.filter((lot) => lot.productId === productId).reduce((total, lot) => total + lot.quantity, 0);
  }

  findProduct(productId: string): Product {
    const product = this.products.find((item) => item.id === productId);
    assertCondition(product, "product not found");
    return product;
  }

  lookupBarcode(barcode: string): Product {
    const product = this.products.find((item) => item.barcode === barcode);
    assertCondition(product, "barcode not found");
    return product;
  }

  applyStockEvent(input: StockEventInput): { duplicate: boolean; event?: StockEvent } {
    const product = this.findProduct(input.productId);
    assertCondition(Number.isFinite(input.quantity) && input.quantity > 0, "quantity must be positive");
    const key = stockEventKey(input);
    if (this.processedEvents.has(key)) return { duplicate: true };
    const allocations: Allocation[] = [];
    if (input.type === "RECEIVE" || input.type === "ADJUST") {
      const lot: InventoryLot = {
        id: id("lot"),
        productId: product.id,
        quantity: input.quantity,
        initialQuantity: input.quantity,
        expiresAt: input.expiresAt ? iso(input.expiresAt) : null,
        receivedAt: iso(input.occurredAt || new Date()),
        location: input.location || product.defaultLocation,
        unitCost: Number(input.unitCost || 0)
      };
      this.lots.push(lot);
      allocations.push({ lotId: lot.id, quantity: input.quantity });
    } else {
      assertCondition(this.quantityFor(product.id) >= input.quantity, "insufficient stock");
      let remaining = input.quantity;
      const candidates = this.lots
        .filter((lot) => lot.productId === product.id && lot.quantity > 0)
        .sort((left, right) => (left.expiresAt || "9999").localeCompare(right.expiresAt || "9999") || left.receivedAt.localeCompare(right.receivedAt));
      for (const lot of candidates) {
        if (remaining <= 0) break;
        const allocated = Math.min(remaining, lot.quantity);
        lot.quantity -= allocated;
        remaining -= allocated;
        allocations.push({ lotId: lot.id, quantity: allocated });
      }
    }
    const event: StockEvent = {
      id: id("event"), eventId: input.eventId, eventKey: key, productId: product.id,
      type: input.type, quantity: input.quantity, allocations, actor: input.actor || "vedant",
      source: input.source || "api", occurredAt: iso(input.occurredAt || new Date())
    };
    this.stockEvents.unshift(event);
    this.processedEvents.add(key);
    this.refreshLowStock(product.id);
    this.createAudit(`STOCK_${input.type}`, event.actor, { productId: product.id, quantity: input.quantity, allocations });
    return { duplicate: false, event };
  }

  refreshLowStock(productId: string): void {
    const product = this.findProduct(productId);
    const onHand = this.quantityFor(productId);
    const open = this.shoppingItems.find((item) => item.productId === productId && item.reason === "LOW_STOCK" && item.status !== "BOUGHT");
    if (onHand <= product.lowStockThreshold && !open) {
      const target = Math.max(product.lowStockThreshold * 2, 1);
      this.shoppingItems.unshift({
        id: id("shop"), productId, quantity: Math.max(target - onHand, 1), status: "NEEDED", reason: "LOW_STOCK",
        createdAt: iso(), updatedAt: iso()
      });
    }
    if (onHand > product.lowStockThreshold && open) {
      open.status = "BOUGHT";
      open.updatedAt = iso();
    }
  }

  rebuildShoppingList(): number {
    for (const product of this.products) this.refreshLowStock(product.id);
    const count = this.shoppingItems.filter((item) => item.status !== "BOUGHT").length;
    this.createAudit("SHOPPING_LIST_REBUILT", "worker:projection", { openItems: count });
    return count;
  }

  addShoppingItem(productId: string, quantity: number): ShoppingItem {
    this.findProduct(productId);
    assertCondition(Number.isFinite(quantity) && quantity > 0, "quantity must be positive");
    const item: ShoppingItem = { id: id("shop"), productId, quantity, status: "NEEDED", reason: "MANUAL", createdAt: iso(), updatedAt: iso() };
    this.shoppingItems.unshift(item);
    this.createAudit("SHOPPING_ITEM_ADDED", "vedant", { productId, quantity });
    return item;
  }

  updateShoppingStatus(itemId: string, status: ShoppingStatus): ShoppingItem {
    assertCondition(["NEEDED", "IN_CART", "BOUGHT"].includes(status), "invalid shopping status");
    const item = this.shoppingItems.find((entry) => entry.id === itemId);
    assertCondition(item, "shopping item not found");
    item.status = status;
    item.updatedAt = iso();
    this.createAudit("SHOPPING_STATUS_CHANGED", "vedant", { itemId, status });
    return item;
  }

  scanExpirations(withinDays = 7, asOf: string | Date = new Date()): { expired: number; expiring: number; lots: string[] } {
    assertCondition(withinDays >= 0, "withinDays cannot be negative");
    const now = new Date(asOf).getTime();
    const boundary = now + withinDays * 86_400_000;
    let expired = 0;
    let expiring = 0;
    const lots: string[] = [];
    for (const lot of this.lots.filter((item) => item.quantity > 0 && item.expiresAt)) {
      const expiry = new Date(lot.expiresAt!).getTime();
      if (expiry <= now) expired += 1;
      else if (expiry <= boundary) expiring += 1;
      if (expiry <= boundary) lots.push(lot.id);
    }
    this.createAudit("EXPIRATION_SCAN_COMPLETED", "worker:expiry", { withinDays, expired, expiring });
    return { expired, expiring, lots };
  }

  ensureJob(kind: PantryJob["kind"], dedupeKey: string, payload: PantryJob["payload"]): PantryJob {
    const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey);
    if (existing) return existing;
    const job: PantryJob = { id: id("job"), kind, status: "QUEUED", attempts: 0, maxAttempts: 3, dedupeKey, payload, queuedAt: iso(), completedAt: null, lastError: null };
    this.jobs.unshift(job);
    return job;
  }

  queueExpirationScan(withinDays = 7): PantryJob {
    return this.ensureJob("EXPIRATION_SCAN", `expiry:${iso().slice(0, 13)}:${withinDays}`, { withinDays });
  }

  queueShoppingRebuild(): PantryJob {
    return this.ensureJob("SHOPPING_REBUILD", `shopping:${iso().slice(0, 13)}`, {});
  }

  dispatchNextJob(): { processed: boolean; job?: PantryJob } {
    const job = this.jobs.find((item) => item.status === "QUEUED" || item.status === "RETRY");
    if (!job) return { processed: false };
    job.status = "RUNNING";
    job.attempts += 1;
    if (this.failNextJob) {
      this.failNextJob = false;
      job.status = job.attempts >= job.maxAttempts ? "DEAD" : "RETRY";
      job.lastError = "simulated worker timeout";
      this.createAudit("JOB_RETRY", "worker", { jobId: job.id, attempts: job.attempts });
      return { processed: true, job };
    }
    if (job.kind === "EXPIRATION_SCAN") this.scanExpirations(Number(job.payload.withinDays || 7));
    if (job.kind === "SHOPPING_REBUILD") this.rebuildShoppingList();
    job.status = "COMPLETED";
    job.completedAt = iso();
    job.lastError = null;
    this.createAudit("JOB_COMPLETED", "worker", { jobId: job.id, kind: job.kind });
    return { processed: true, job };
  }

  drainJobs(max = 50): { processed: number; completed: number } {
    let processed = 0;
    let completed = 0;
    while (processed < max) {
      const result = this.dispatchNextJob();
      if (!result.processed || !result.job) break;
      processed += 1;
      if (result.job.status === "COMPLETED") completed += 1;
    }
    return { processed, completed };
  }

  snapshot(): Record<string, unknown> {
    const now = Date.now();
    const sevenDays = now + 7 * 86_400_000;
    const inventory = this.products.map((product) => {
      const lots = this.lots.filter((lot) => lot.productId === product.id && lot.quantity > 0);
      const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
      const nextExpiry = lots.map((lot) => lot.expiresAt).filter(Boolean).sort()[0] || null;
      const value = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
      return { ...product, quantity, nextExpiry, value: Number(value.toFixed(2)), lots: lots.length, lowStock: quantity <= product.lowStockThreshold };
    });
    const activeLots = this.lots.filter((lot) => lot.quantity > 0);
    const expiringLots = activeLots.filter((lot) => lot.expiresAt && new Date(lot.expiresAt).getTime() > now && new Date(lot.expiresAt).getTime() <= sevenDays).length;
    const expiredLots = activeLots.filter((lot) => lot.expiresAt && new Date(lot.expiresAt).getTime() <= now).length;
    const inventoryValue = activeLots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
    const wastedUnits = this.stockEvents.filter((event) => event.type === "WASTE").reduce((sum, event) => sum + event.quantity, 0);
    return {
      products: this.products,
      lots: this.lots,
      inventory,
      stockEvents: this.stockEvents,
      shoppingItems: this.shoppingItems,
      jobs: this.jobs,
      audit: this.audit,
      metrics: {
        products: this.products.length,
        unitsOnHand: activeLots.reduce((sum, lot) => sum + lot.quantity, 0),
        lowStock: inventory.filter((item) => item.lowStock).length,
        expiringLots,
        expiredLots,
        openShoppingItems: this.shoppingItems.filter((item) => item.status !== "BOUGHT").length,
        inventoryValue: Number(inventoryValue.toFixed(2)),
        wastedUnits,
        queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length
      }
    };
  }

  exportState(): Record<string, unknown> {
    return { products: this.products, lots: this.lots, stockEvents: this.stockEvents, shoppingItems: this.shoppingItems, jobs: this.jobs, audit: this.audit, processedEvents: [...this.processedEvents] };
  }

  importState(state: Record<string, unknown>): void {
    this.products = (state.products as Product[]) || [];
    this.lots = (state.lots as InventoryLot[]) || [];
    this.stockEvents = (state.stockEvents as StockEvent[]) || [];
    this.shoppingItems = (state.shoppingItems as ShoppingItem[]) || [];
    this.jobs = (state.jobs as PantryJob[]) || [];
    this.audit = (state.audit as AuditEvent[]) || [];
    this.processedEvents = new Set((state.processedEvents as string[]) || []);
  }
}

export function createSeededPantry(): SmartPantry {
  const pantry = new SmartPantry();
  pantry.seed();
  return pantry;
}
