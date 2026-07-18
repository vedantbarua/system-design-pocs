import crypto from "node:crypto";

export type ItemCategory = "ELECTRONICS" | "JEWELRY" | "APPLIANCE" | "FURNITURE" | "TOOL" | "COLLECTIBLE" | "SPORTING_GOODS" | "OTHER";
export type ItemStatus = "ACTIVE" | "MISSING_PROOF" | "UNDERINSURED" | "DUPLICATE" | "ARCHIVED";
export type InventoryEventType = "ITEM_ADDED" | "ITEM_UPDATED" | "LOCATION_MOVED" | "PROOF_ATTACHED" | "VALUATION_UPDATED" | "COVERAGE_UPDATED" | "ITEM_ARCHIVED" | "EXPORT_REQUESTED" | "INVENTORY_SCAN";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type InventoryItem = {
  id: string;
  name: string;
  category: ItemCategory;
  room: string;
  owner: string;
  purchaseDate: string;
  value: number;
  replacementValue: number;
  serialNumber: string;
  proofIds: string[];
  policyId: string | null;
  coverageLimit: number;
  status: ItemStatus;
  updatedAt: string;
  notes: string;
};

export type Proof = {
  id: string;
  itemId: string;
  kind: "RECEIPT" | "PHOTO" | "APPRAISAL" | "SERIAL_CARD" | "MANUAL";
  label: string;
  capturedAt: string;
  checksum: string;
};

export type Policy = {
  id: string;
  provider: string;
  policyNumber: string;
  coverageLimit: number;
  deductible: number;
  coveredCategories: ItemCategory[];
  updatedAt: string;
};

export type ExportBundle = {
  id: string;
  status: "QUEUED" | "READY";
  itemCount: number;
  totalValue: number;
  generatedAt: string;
  checksum: string;
};

export type InventoryEventInput = {
  eventId: string;
  itemId: string;
  type: InventoryEventType;
  occurredAt?: string;
  name?: string;
  category?: ItemCategory;
  room?: string;
  owner?: string;
  purchaseDate?: string;
  value?: number;
  replacementValue?: number;
  serialNumber?: string;
  proofKind?: Proof["kind"];
  proofLabel?: string;
  policyId?: string | null;
  coverageLimit?: number;
  notes?: string;
  source?: string;
};

export type InventoryEvent = Required<Omit<InventoryEventInput, "occurredAt" | "name" | "category" | "room" | "owner" | "purchaseDate" | "value" | "replacementValue" | "serialNumber" | "proofKind" | "proofLabel" | "policyId" | "coverageLimit" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  name: string;
  category: ItemCategory;
  room: string;
  owner: string;
  purchaseDate: string;
  value: number;
  replacementValue: number;
  serialNumber: string;
  proofKind: Proof["kind"];
  proofLabel: string;
  policyId: string | null;
  coverageLimit: number;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  itemId: string;
  kind: "DUPLICATE_ITEM" | "MISSING_PROOF" | "UNDERINSURED" | "POLICY_GAP" | "VALUATION_STALE" | "EXPORT_READY";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "INVENTORY_SCAN" | "VALUATION_REFRESH" | "EXPORT_GENERATION" | "REMINDER_DISPATCH" | "RETENTION";
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

export function inventoryEventKey(input: Pick<InventoryEventInput, "itemId" | "eventId">) {
  if (!input.itemId || !input.eventId) throw new Error("itemId and eventId are required");
  return `${input.itemId}:${input.eventId}`;
}

export function itemFingerprint(input: Pick<InventoryItem, "name" | "category" | "serialNumber">) {
  const serial = input.serialNumber.trim().toLowerCase();
  const key = serial || input.name.trim().toLowerCase().replace(/\s+/g, " ");
  return `${input.category}:${key}`;
}

export function checksum(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export class HomeInventoryInsurance {
  items: InventoryItem[] = [];
  proofs: Proof[] = [];
  policies: Policy[] = [];
  exports: ExportBundle[] = [];
  events: InventoryEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.policies = [
      { id: "policy-home", provider: "Acme Home Insurance", policyNumber: "HOME-2048", coverageLimit: 4500, deductible: 500, coveredCategories: ["ELECTRONICS", "APPLIANCE", "FURNITURE", "TOOL", "SPORTING_GOODS"], updatedAt: iso(now) },
      { id: "policy-rider", provider: "Acme Valuable Items", policyNumber: "RIDER-77", coverageLimit: 8000, deductible: 100, coveredCategories: ["JEWELRY", "COLLECTIBLE"], updatedAt: iso(now) }
    ];
    this.items = [
      this.item("item-laptop", "MacBook Pro", "ELECTRONICS", "Office", "Ava", addMinutes(-420 * 24 * 60, now), 1800, 2100, "MBP-2024-A1", ["proof-laptop-receipt"], "policy-home", 2500, "ACTIVE", addMinutes(-20 * 24 * 60, now), "Work and personal laptop."),
      this.item("item-tv", "OLED TV", "ELECTRONICS", "Living Room", "Noah", addMinutes(-700 * 24 * 60, now), 1400, 1600, "TV-55-77", ["proof-tv-photo"], "policy-home", 1200, "ACTIVE", addMinutes(-220 * 24 * 60, now), "Needs updated valuation."),
      this.item("item-ring", "Engagement ring", "JEWELRY", "Bedroom", "Ava", addMinutes(-1200 * 24 * 60, now), 6200, 7200, "RING-18K-01", ["proof-ring-appraisal"], "policy-rider", 8000, "ACTIVE", addMinutes(-40 * 24 * 60, now), "Appraised rider."),
      this.item("item-bike", "Gravel bike", "SPORTING_GOODS", "Garage", "Noah", addMinutes(-300 * 24 * 60, now), 1700, 1900, "BIKE-AL-9", [], "policy-home", 1000, "MISSING_PROOF", addMinutes(-35 * 24 * 60, now), "Receipt missing."),
      this.item("item-sofa", "Sectional sofa", "FURNITURE", "Living Room", "Household", addMinutes(-900 * 24 * 60, now), 2200, 2400, "", ["proof-sofa-photo"], "policy-home", 2500, "ACTIVE", addMinutes(-10 * 24 * 60, now), "Photo proof only.")
    ];
    this.proofs = [
      { id: "proof-laptop-receipt", itemId: "item-laptop", kind: "RECEIPT", label: "Apple receipt PDF", capturedAt: addMinutes(-419 * 24 * 60, now), checksum: checksum("laptop") },
      { id: "proof-tv-photo", itemId: "item-tv", kind: "PHOTO", label: "Living room photo", capturedAt: addMinutes(-699 * 24 * 60, now), checksum: checksum("tv") },
      { id: "proof-ring-appraisal", itemId: "item-ring", kind: "APPRAISAL", label: "Jeweler appraisal", capturedAt: addMinutes(-60 * 24 * 60, now), checksum: checksum("ring") },
      { id: "proof-sofa-photo", itemId: "item-sofa", kind: "PHOTO", label: "Sofa condition photo", capturedAt: addMinutes(-40 * 24 * 60, now), checksum: checksum("sofa") }
    ];
    this.exports = [];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanInventory(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { items: this.items.length, proofs: this.proofs.length, alerts: this.alerts.length });
  }

  item(idValue: string, name: string, category: ItemCategory, room: string, owner: string, purchaseDate: string, value: number, replacementValue: number, serialNumber: string, proofIds: string[], policyId: string | null, coverageLimit: number, status: ItemStatus, updatedAt: string, notes: string): InventoryItem {
    return { id: idValue, name, category, room, owner, purchaseDate: iso(purchaseDate), value, replacementValue, serialNumber, proofIds, policyId, coverageLimit, status, updatedAt: iso(updatedAt), notes };
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

  ingest(input: InventoryEventInput) {
    let item = this.items.find((candidate) => candidate.id === input.itemId);
    const eventKey = inventoryEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!item && input.type !== "ITEM_ADDED") throw new Error("item not found");
    if (!item) {
      item = this.item(input.itemId, input.name || "New item", input.category || "OTHER", input.room || "Unassigned", input.owner || "Household", input.purchaseDate || occurredAt, input.value || 0, input.replacementValue || input.value || 0, input.serialNumber || "", [], input.policyId || null, input.coverageLimit || 0, "ACTIVE", occurredAt, input.notes || "");
      this.items.push(item);
    }

    const event: InventoryEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      itemId: input.itemId,
      type: input.type,
      occurredAt,
      name: input.name || item.name,
      category: input.category || item.category,
      room: input.room || item.room,
      owner: input.owner || item.owner,
      purchaseDate: input.purchaseDate ? iso(input.purchaseDate) : item.purchaseDate,
      value: input.value ?? item.value,
      replacementValue: input.replacementValue ?? item.replacementValue,
      serialNumber: input.serialNumber ?? item.serialNumber,
      proofKind: input.proofKind || "PHOTO",
      proofLabel: input.proofLabel || "",
      policyId: input.policyId === undefined ? item.policyId : input.policyId,
      coverageLimit: input.coverageLimit ?? item.coverageLimit,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(item.updatedAt).getTime() && event.type !== "INVENTORY_SCAN";
    if (!staleUpdate) {
      if (event.type === "ITEM_ADDED" || event.type === "ITEM_UPDATED") this.applyEventToItem(item, event);
      if (event.type === "LOCATION_MOVED") { item.room = event.room; item.updatedAt = occurredAt; item.notes = event.notes || item.notes; }
      if (event.type === "VALUATION_UPDATED") { item.value = event.value; item.replacementValue = event.replacementValue; item.updatedAt = occurredAt; }
      if (event.type === "COVERAGE_UPDATED") { item.policyId = event.policyId; item.coverageLimit = event.coverageLimit; item.updatedAt = occurredAt; }
      if (event.type === "PROOF_ATTACHED") this.attachProof(item, event);
      if (event.type === "ITEM_ARCHIVED") { item.status = "ARCHIVED"; item.updatedAt = occurredAt; }
      if (event.type === "EXPORT_REQUESTED") this.generateExport(occurredAt);
    }

    this.scanInventory(occurredAt);
    this.createAudit(staleUpdate ? "STALE_INVENTORY_EVENT_IGNORED" : "INVENTORY_EVENT_INGESTED", { eventId: event.id, itemId: item.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyEventToItem(item: InventoryItem, event: InventoryEvent) {
    item.name = event.name;
    item.category = event.category;
    item.room = event.room;
    item.owner = event.owner;
    item.purchaseDate = event.purchaseDate;
    item.value = event.value;
    item.replacementValue = event.replacementValue;
    item.serialNumber = event.serialNumber;
    item.policyId = event.policyId;
    item.coverageLimit = event.coverageLimit;
    item.updatedAt = event.occurredAt;
    item.notes = event.notes || item.notes;
  }

  attachProof(item: InventoryItem, event: InventoryEvent) {
    const proof: Proof = { id: id("proof"), itemId: item.id, kind: event.proofKind, label: event.proofLabel || `${event.proofKind} proof`, capturedAt: event.occurredAt, checksum: checksum(`${item.id}:${event.proofKind}:${event.proofLabel}:${event.occurredAt}`) };
    this.proofs.unshift(proof);
    item.proofIds = [...new Set([proof.id, ...item.proofIds])];
    item.updatedAt = event.occurredAt;
    return proof;
  }

  scanInventory(asOf: string | Date = new Date()) {
    const fingerprints = new Map<string, InventoryItem>();
    for (const item of this.items) {
      if (item.status === "ARCHIVED") continue;
      const hasProof = item.proofIds.some((proofId) => this.proofs.some((proof) => proof.id === proofId));
      const policy = item.policyId ? this.policies.find((candidate) => candidate.id === item.policyId) : null;
      const coveredByCategory = !!policy?.coveredCategories.includes(item.category);
      const staleValuation = new Date(asOf).getTime() - new Date(item.updatedAt).getTime() > 180 * 24 * 60 * 60_000;
      const fingerprint = itemFingerprint(item);
      const duplicate = fingerprints.get(fingerprint);

      if (duplicate) {
        item.status = "DUPLICATE";
        this.ensureAlert(item, "DUPLICATE_ITEM", `duplicate:${fingerprint}`);
      } else {
        fingerprints.set(fingerprint, item);
        if (item.replacementValue > item.coverageLimit) item.status = "UNDERINSURED";
        else if (item.value >= 500 && !hasProof) item.status = "MISSING_PROOF";
        else item.status = "ACTIVE";
      }

      if (item.value >= 500 && !hasProof) this.ensureAlert(item, "MISSING_PROOF", `proof:${item.id}`);
      if (!policy || !coveredByCategory) this.ensureAlert(item, "POLICY_GAP", `policy:${item.id}:${item.category}`);
      if (item.replacementValue > item.coverageLimit) this.ensureAlert(item, "UNDERINSURED", `underinsured:${item.id}`);
      if (staleValuation) this.ensureAlert(item, "VALUATION_STALE", `valuation:${item.id}`);
    }
    return { alerts: this.alerts.length };
  }

  ensureAlert(item: InventoryItem, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), itemId: item.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  generateExport(at: string | Date = new Date()) {
    const activeItems = this.items.filter((item) => item.status !== "ARCHIVED");
    const bundle: ExportBundle = { id: id("export"), status: "READY", itemCount: activeItems.length, totalValue: activeItems.reduce((sum, item) => sum + item.replacementValue, 0), generatedAt: iso(at), checksum: checksum(activeItems.map((item) => ({ id: item.id, value: item.replacementValue, proofIds: item.proofIds }))) };
    this.exports.unshift(bundle);
    this.ensureAlert(activeItems[0] || this.items[0], "EXPORT_READY", `export:${bundle.id}`);
    return bundle;
  }

  inventoryScore() {
    const activeItems = this.items.filter((item) => item.status !== "ARCHIVED");
    if (activeItems.length === 0) return 100;
    const ready = activeItems.filter((item) => item.status === "ACTIVE").length;
    return Math.round((ready / activeItems.length) * 100);
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated insurance export provider timeout"; return { processed: true, job }; }
    if (job.kind === "INVENTORY_SCAN") this.scanInventory();
    if (job.kind === "VALUATION_REFRESH") this.refreshValuations();
    if (job.kind === "EXPORT_GENERATION") this.generateExport();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  refreshValuations() { for (const item of this.items.filter((candidate) => candidate.status !== "ARCHIVED")) { item.replacementValue = Math.round(item.replacementValue * 1.03); item.updatedAt = iso(); } this.scanInventory(); return this.items.length; }
  snapshot() { const activeItems = this.items.filter((item) => item.status !== "ARCHIVED"); return { items: [...this.items].sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name)), proofs: this.proofs, policies: this.policies, exports: this.exports, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, metrics: { score: this.inventoryScore(), items: activeItems.length, proofs: this.proofs.length, totalValue: activeItems.reduce((sum, item) => sum + item.replacementValue, 0), missingProof: activeItems.filter((item) => item.status === "MISSING_PROOF").length, underinsured: activeItems.filter((item) => item.status === "UNDERINSURED").length, duplicates: activeItems.filter((item) => item.status === "DUPLICATE").length, exports: this.exports.length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { items: this.items, proofs: this.proofs, policies: this.policies, exports: this.exports, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.items = state.items as InventoryItem[]; this.proofs = state.proofs as Proof[] || []; this.policies = state.policies as Policy[] || []; this.exports = state.exports as ExportBundle[] || []; this.events = state.events as InventoryEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededHomeInventory(now: Date = new Date()) { const inventory = new HomeInventoryInsurance(); inventory.seed(now); return inventory; }
