import crypto from "node:crypto";

export type ProductCategory = "APPLIANCE" | "ELECTRONICS" | "FURNITURE" | "TOOLS" | "HOME_SYSTEM" | "HOUSEHOLD" | "UNKNOWN";
export type ItemStatus = "ACTIVE" | "RETURN_WINDOW" | "WARRANTY_SOON" | "EXPIRED" | "CLAIM_OPEN" | "ARCHIVED";
export type ClaimStatus = "NONE" | "OPEN" | "RESOLVED";
export type VaultEventType = "RECEIPT_SCANNED" | "METADATA_UPDATED" | "WARRANTY_REGISTERED" | "CLAIM_OPENED" | "CLAIM_RESOLVED" | "ITEM_ARCHIVED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type VaultItem = {
  id: string;
  name: string;
  merchant: string;
  category: ProductCategory;
  purchasedAt: string;
  priceCents: number;
  returnBy: string | null;
  warrantyExpiresAt: string | null;
  status: ItemStatus;
  owner: string;
  receiptId: string;
  fingerprint: string;
  claimStatus: ClaimStatus;
  claimOpenedAt: string | null;
};

export type VaultEventInput = {
  eventId: string;
  itemId: string;
  type: VaultEventType;
  occurredAt?: string;
  name?: string;
  merchant?: string;
  category?: ProductCategory;
  purchasedAt?: string;
  priceCents?: number;
  returnBy?: string | null;
  warrantyExpiresAt?: string | null;
  claimStatus?: ClaimStatus;
  notes?: string;
  source?: string;
};

export type VaultEvent = Required<Omit<VaultEventInput, "occurredAt" | "name" | "merchant" | "category" | "purchasedAt" | "priceCents" | "returnBy" | "warrantyExpiresAt" | "claimStatus" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  name: string;
  merchant: string;
  category: ProductCategory;
  purchasedAt: string;
  priceCents: number;
  returnBy: string | null;
  warrantyExpiresAt: string | null;
  claimStatus: ClaimStatus;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  itemId: string;
  kind: "RETURN_DEADLINE" | "WARRANTY_EXPIRING" | "WARRANTY_EXPIRED" | "DUPLICATE_RECEIPT" | "MISSING_METADATA" | "CLAIM_STALE";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  itemId: string;
  channel: "PUSH" | "EMAIL";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "VAULT_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function vaultEventKey(input: Pick<VaultEventInput, "itemId" | "eventId">) {
  if (!input.itemId || !input.eventId) throw new Error("itemId and eventId are required");
  return `${input.itemId}:${input.eventId}`;
}

export function fingerprint(merchant: string, name: string, purchasedAt: string, priceCents: number) {
  return `${merchant.trim().toLowerCase()}:${name.trim().toLowerCase().replace(/\s+/g, " ")}:${iso(purchasedAt).slice(0, 10)}:${priceCents}`;
}

export class WarrantyVault {
  items: VaultItem[] = [];
  events: VaultEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.items = [
      this.item("item-washer", "Front-load washer", "Appliance Depot", "APPLIANCE", addMinutes(-330 * 24 * 60, now), 84900, addMinutes(-300 * 24 * 60, now), addMinutes(20 * 24 * 60, now), "ACTIVE", "Ava", "receipt-washer"),
      this.item("item-laptop", "Work laptop", "TechMart", "ELECTRONICS", addMinutes(-24 * 24 * 60, now), 139900, addMinutes(6 * 24 * 60, now), addMinutes(340 * 24 * 60, now), "RETURN_WINDOW", "Noah", "receipt-laptop"),
      this.item("item-drill", "Cordless drill kit", "Tool House", "TOOLS", addMinutes(-400 * 24 * 60, now), 21900, addMinutes(-370 * 24 * 60, now), addMinutes(-5 * 24 * 60, now), "ACTIVE", "Ava", "receipt-drill"),
      this.item("item-air-purifier", "Bedroom air purifier", "Home Store", "HOUSEHOLD", addMinutes(-10 * 24 * 60, now), 17900, addMinutes(20 * 24 * 60, now), addMinutes(355 * 24 * 60, now), "ACTIVE", "Mia", "receipt-air-1"),
      this.item("item-air-purifier-copy", "Bedroom air purifier", "Home Store", "HOUSEHOLD", addMinutes(-10 * 24 * 60, now), 17900, addMinutes(20 * 24 * 60, now), addMinutes(355 * 24 * 60, now), "ACTIVE", "Mia", "receipt-air-2"),
      this.item("item-unknown", "Receipt scan pending", "Unknown merchant", "UNKNOWN", addMinutes(-2 * 24 * 60, now), 0, null, null, "ACTIVE", "Ava", "receipt-raw")
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.openClaim("item-drill", addMinutes(-20 * 24 * 60, now));
    this.scanVault(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { items: this.items.length, alerts: this.alerts.length });
  }

  item(idValue: string, name: string, merchant: string, category: ProductCategory, purchasedAt: string, priceCents: number, returnBy: string | null, warrantyExpiresAt: string | null, status: ItemStatus, owner: string, receiptId: string): VaultItem {
    const purchaseDate = iso(purchasedAt);
    return {
      id: idValue,
      name,
      merchant,
      category,
      purchasedAt: purchaseDate,
      priceCents,
      returnBy: returnBy ? iso(returnBy) : null,
      warrantyExpiresAt: warrantyExpiresAt ? iso(warrantyExpiresAt) : null,
      status,
      owner,
      receiptId,
      fingerprint: fingerprint(merchant, name, purchaseDate, priceCents),
      claimStatus: "NONE",
      claimOpenedAt: null
    };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  itemById(itemId: string) {
    const item = this.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("vault item not found");
    return item;
  }

  openClaim(itemId: string, openedAt: string = iso()) {
    const item = this.itemById(itemId);
    item.claimStatus = "OPEN";
    item.claimOpenedAt = iso(openedAt);
    item.status = "CLAIM_OPEN";
    return item;
  }

  ingest(input: VaultEventInput) {
    const item = this.itemById(input.itemId);
    const eventKey = vaultEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    const event: VaultEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      itemId: input.itemId,
      type: input.type,
      occurredAt,
      name: input.name || item.name,
      merchant: input.merchant || item.merchant,
      category: input.category || item.category,
      purchasedAt: input.purchasedAt ? iso(input.purchasedAt) : item.purchasedAt,
      priceCents: input.priceCents ?? item.priceCents,
      returnBy: input.returnBy === undefined ? item.returnBy : input.returnBy ? iso(input.returnBy) : null,
      warrantyExpiresAt: input.warrantyExpiresAt === undefined ? item.warrantyExpiresAt : input.warrantyExpiresAt ? iso(input.warrantyExpiresAt) : null,
      claimStatus: input.claimStatus || item.claimStatus,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    if (event.type === "RECEIPT_SCANNED" || event.type === "METADATA_UPDATED" || event.type === "WARRANTY_REGISTERED") {
      item.name = event.name;
      item.merchant = event.merchant;
      item.category = event.category;
      item.purchasedAt = event.purchasedAt;
      item.priceCents = event.priceCents;
      item.returnBy = event.returnBy;
      item.warrantyExpiresAt = event.warrantyExpiresAt;
      item.fingerprint = fingerprint(item.merchant, item.name, item.purchasedAt, item.priceCents);
      if (item.claimStatus !== "OPEN") item.status = this.deriveStatus(item, occurredAt);
    }
    if (event.type === "CLAIM_OPENED") {
      item.claimStatus = "OPEN";
      item.claimOpenedAt = occurredAt;
      item.status = "CLAIM_OPEN";
    }
    if (event.type === "CLAIM_RESOLVED") {
      item.claimStatus = "RESOLVED";
      item.claimOpenedAt = null;
      item.status = this.deriveStatus(item, occurredAt);
    }
    if (event.type === "ITEM_ARCHIVED") item.status = "ARCHIVED";

    this.scanVault(occurredAt);
    this.createAudit("VAULT_EVENT_INGESTED", { eventId: event.id, itemId: item.id, type: event.type });
    return { duplicate: false, event };
  }

  deriveStatus(item: VaultItem, asOf: string | Date = new Date()): ItemStatus {
    if (item.status === "ARCHIVED") return "ARCHIVED";
    if (item.claimStatus === "OPEN") return "CLAIM_OPEN";
    const now = new Date(asOf).getTime();
    if (item.returnBy && new Date(item.returnBy).getTime() >= now) return "RETURN_WINDOW";
    if (item.warrantyExpiresAt) {
      const minutesUntilExpiry = (new Date(item.warrantyExpiresAt).getTime() - now) / 60_000;
      if (minutesUntilExpiry < 0) return "EXPIRED";
      if (minutesUntilExpiry <= 45 * 24 * 60) return "WARRANTY_SOON";
    }
    return "ACTIVE";
  }

  scanVault(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    const seen = new Map<string, VaultItem>();
    for (const item of this.items) {
      const prior = seen.get(item.fingerprint);
      if (prior && item.status !== "ARCHIVED") this.ensureAlert(item, "DUPLICATE_RECEIPT", `duplicate:${item.fingerprint}`);
      seen.set(item.fingerprint, item);

      if (item.category === "UNKNOWN" || item.priceCents <= 0 || !item.warrantyExpiresAt) {
        this.ensureAlert(item, "MISSING_METADATA", `metadata:${item.id}`);
      }
      if (item.claimStatus === "OPEN" && item.claimOpenedAt && now - new Date(item.claimOpenedAt).getTime() > 14 * 24 * 60 * 60_000) {
        this.ensureAlert(item, "CLAIM_STALE", `claim:${item.id}`);
      }
      if (item.returnBy && item.status !== "ARCHIVED") {
        const minutesUntilReturn = (new Date(item.returnBy).getTime() - now) / 60_000;
        if (minutesUntilReturn >= 0 && minutesUntilReturn <= 7 * 24 * 60) {
          this.ensureAlert(item, "RETURN_DEADLINE", `return:${item.id}`);
          this.ensureReminder(item, "RETURN_DEADLINE", addMinutes(-24 * 60, item.returnBy));
        }
      }
      if (item.warrantyExpiresAt && item.status !== "ARCHIVED") {
        const minutesUntilWarranty = (new Date(item.warrantyExpiresAt).getTime() - now) / 60_000;
        if (minutesUntilWarranty < 0) this.ensureAlert(item, "WARRANTY_EXPIRED", `expired:${item.id}`);
        if (minutesUntilWarranty >= 0 && minutesUntilWarranty <= 45 * 24 * 60) {
          this.ensureAlert(item, "WARRANTY_EXPIRING", `warranty:${item.id}`);
          this.ensureReminder(item, "WARRANTY_EXPIRING", addMinutes(-7 * 24 * 60, item.warrantyExpiresAt));
        }
      }
      item.status = this.deriveStatus(item, asOf);
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  ensureAlert(item: VaultItem, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), itemId: item.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(item: VaultItem, kind: Alert["kind"], scheduledFor: string) {
    const dedupeKey = `reminder:${item.id}:${kind}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), itemId: item.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
      this.reminders.unshift(reminder);
    }
    return reminder;
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  dispatchReminders() { let sent = 0; for (const reminder of this.reminders.filter((candidate) => candidate.status === "QUEUED")) { reminder.status = "SENT"; reminder.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 180, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated warranty provider timeout"; return { processed: true, job }; }
    if (job.kind === "VAULT_SCAN") this.scanVault();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(180);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { items: [...this.items].sort((a, b) => (a.warrantyExpiresAt || "9999").localeCompare(b.warrantyExpiresAt || "9999")), events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { covered: this.items.filter((item) => item.warrantyExpiresAt && item.status !== "EXPIRED" && item.status !== "ARCHIVED").length, returns: this.items.filter((item) => item.status === "RETURN_WINDOW").length, claims: this.items.filter((item) => item.claimStatus === "OPEN").length, expiring: this.items.filter((item) => item.status === "WARRANTY_SOON").length, archived: this.items.filter((item) => item.status === "ARCHIVED").length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { items: this.items, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.items = state.items as VaultItem[]; this.events = state.events as VaultEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededVault(now: Date = new Date()) { const vault = new WarrantyVault(); vault.seed(now); return vault; }
