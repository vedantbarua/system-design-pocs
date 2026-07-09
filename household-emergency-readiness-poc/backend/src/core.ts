import crypto from "node:crypto";

export type ReadinessArea = "SUPPLIES" | "DOCUMENTS" | "CONTACTS" | "EVACUATION" | "PETS" | "VEHICLE" | "MEDICAL";
export type ItemStatus = "READY" | "EXPIRING" | "EXPIRED" | "MISSING" | "STALE" | "DONE";
export type ReadinessEventType = "SUPPLY_CHECKED" | "SUPPLY_USED" | "DOCUMENT_REFRESHED" | "CONTACT_VERIFIED" | "TASK_COMPLETED" | "INCIDENT_MODE_STARTED" | "INCIDENT_MODE_ENDED" | "ITEM_UPDATED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type ReadinessItem = {
  id: string;
  name: string;
  area: ReadinessArea;
  location: string;
  owner: string;
  quantity: number;
  requiredQuantity: number;
  expiresAt: string | null;
  lastVerifiedAt: string;
  status: ItemStatus;
  incidentCritical: boolean;
  updatedAt: string;
};

export type ReadinessEventInput = {
  eventId: string;
  itemId: string;
  type: ReadinessEventType;
  occurredAt?: string;
  name?: string;
  area?: ReadinessArea;
  location?: string;
  owner?: string;
  quantity?: number;
  requiredQuantity?: number;
  expiresAt?: string | null;
  incidentCritical?: boolean;
  notes?: string;
  source?: string;
};

export type ReadinessEvent = Required<Omit<ReadinessEventInput, "occurredAt" | "name" | "area" | "location" | "owner" | "quantity" | "requiredQuantity" | "expiresAt" | "incidentCritical" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  name: string;
  area: ReadinessArea;
  location: string;
  owner: string;
  quantity: number;
  requiredQuantity: number;
  expiresAt: string | null;
  incidentCritical: boolean;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  itemId: string;
  kind: "SUPPLY_EXPIRING" | "SUPPLY_EXPIRED" | "LOW_QUANTITY" | "STALE_CONTACT" | "MISSING_DOCUMENT" | "INCIDENT_TASK";
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
  kind: "READINESS_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function readinessEventKey(input: Pick<ReadinessEventInput, "itemId" | "eventId">) {
  if (!input.itemId || !input.eventId) throw new Error("itemId and eventId are required");
  return `${input.itemId}:${input.eventId}`;
}

export function itemFingerprint(name: string, area: ReadinessArea, location: string) {
  return `${area}:${name.trim().toLowerCase().replace(/\s+/g, " ")}:${location.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export class EmergencyReadiness {
  items: ReadinessItem[] = [];
  events: ReadinessEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  incidentMode = false;
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.items = [
      this.item("item-water", "Drinking water", "SUPPLIES", "Garage kit", "Ava", 8, 12, addMinutes(20 * 24 * 60, now), addMinutes(-40 * 24 * 60, now), "READY", true, addMinutes(-40 * 24 * 60, now)),
      this.item("item-batteries", "AA batteries", "SUPPLIES", "Hall closet", "Noah", 4, 8, addMinutes(-3 * 24 * 60, now), addMinutes(-90 * 24 * 60, now), "READY", true, addMinutes(-90 * 24 * 60, now)),
      this.item("item-passports", "Passport copies", "DOCUMENTS", "Go folder", "Ava", 0, 1, null, addMinutes(-210 * 24 * 60, now), "MISSING", true, addMinutes(-210 * 24 * 60, now)),
      this.item("item-contact-neighbor", "Neighbor contact", "CONTACTS", "Emergency card", "Noah", 1, 1, null, addMinutes(-190 * 24 * 60, now), "READY", true, addMinutes(-190 * 24 * 60, now)),
      this.item("item-pet-carrier", "Pet carrier", "PETS", "Mudroom", "Ava", 1, 1, null, addMinutes(-20 * 24 * 60, now), "READY", true, addMinutes(-20 * 24 * 60, now)),
      this.item("item-car-fuel", "Car fuel above half tank", "VEHICLE", "Driveway", "Noah", 1, 1, null, addMinutes(-10 * 24 * 60, now), "READY", true, addMinutes(-10 * 24 * 60, now)),
      this.item("item-meetup", "Family meetup plan", "EVACUATION", "Go folder", "Ava", 0, 1, null, addMinutes(-60 * 24 * 60, now), "MISSING", true, addMinutes(-60 * 24 * 60, now))
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.incidentMode = false;
    this.failNextJob = false;
    this.scanReadiness(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { items: this.items.length, alerts: this.alerts.length });
  }

  item(idValue: string, name: string, area: ReadinessArea, location: string, owner: string, quantity: number, requiredQuantity: number, expiresAt: string | null, lastVerifiedAt: string, status: ItemStatus, incidentCritical: boolean, updatedAt: string): ReadinessItem {
    return { id: idValue, name, area, location, owner, quantity, requiredQuantity, expiresAt: expiresAt ? iso(expiresAt) : null, lastVerifiedAt: iso(lastVerifiedAt), status, incidentCritical, updatedAt: iso(updatedAt) };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  itemById(itemId: string) {
    const item = this.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("readiness item not found");
    return item;
  }

  ingest(input: ReadinessEventInput) {
    const item = this.itemById(input.itemId);
    const eventKey = readinessEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    const event: ReadinessEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      itemId: input.itemId,
      type: input.type,
      occurredAt,
      name: input.name || item.name,
      area: input.area || item.area,
      location: input.location || item.location,
      owner: input.owner || item.owner,
      quantity: input.quantity ?? item.quantity,
      requiredQuantity: input.requiredQuantity ?? item.requiredQuantity,
      expiresAt: input.expiresAt === undefined ? item.expiresAt : input.expiresAt ? iso(input.expiresAt) : null,
      incidentCritical: input.incidentCritical ?? item.incidentCritical,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(item.updatedAt).getTime() && event.type === "ITEM_UPDATED";
    if (!staleUpdate && ["SUPPLY_CHECKED", "DOCUMENT_REFRESHED", "CONTACT_VERIFIED", "TASK_COMPLETED", "ITEM_UPDATED"].includes(event.type)) {
      item.name = event.name;
      item.area = event.area;
      item.location = event.location;
      item.owner = event.owner;
      item.quantity = event.quantity;
      item.requiredQuantity = event.requiredQuantity;
      item.expiresAt = event.expiresAt;
      item.incidentCritical = event.incidentCritical;
      item.lastVerifiedAt = occurredAt;
      item.updatedAt = occurredAt;
      item.status = event.type === "TASK_COMPLETED" ? "DONE" : "READY";
    }
    if (!staleUpdate && event.type === "SUPPLY_USED") {
      item.quantity = Math.max(0, event.quantity);
      item.updatedAt = occurredAt;
    }
    if (event.type === "INCIDENT_MODE_STARTED") {
      this.incidentMode = true;
      for (const critical of this.items.filter((candidate) => candidate.incidentCritical && candidate.status !== "DONE")) {
        this.ensureAlert(critical, "INCIDENT_TASK", `incident:${critical.id}`);
      }
    }
    if (event.type === "INCIDENT_MODE_ENDED") this.incidentMode = false;

    this.scanReadiness(occurredAt);
    this.createAudit(staleUpdate ? "STALE_READINESS_EVENT_IGNORED" : "READINESS_EVENT_INGESTED", { eventId: event.id, itemId: item.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  scanReadiness(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const item of this.items) {
      if (item.status === "DONE") continue;
      if (item.quantity < item.requiredQuantity) {
        item.status = item.quantity === 0 ? "MISSING" : item.status;
        this.ensureAlert(item, item.area === "DOCUMENTS" || item.area === "EVACUATION" ? "MISSING_DOCUMENT" : "LOW_QUANTITY", `quantity:${item.id}`);
      }
      if (item.expiresAt) {
        const minutesUntilExpiry = (new Date(item.expiresAt).getTime() - now) / 60_000;
        if (minutesUntilExpiry < 0) {
          item.status = "EXPIRED";
          this.ensureAlert(item, "SUPPLY_EXPIRED", `expired:${item.id}`);
        } else if (minutesUntilExpiry <= 45 * 24 * 60) {
          item.status = "EXPIRING";
          this.ensureAlert(item, "SUPPLY_EXPIRING", `expiring:${item.id}`);
          this.ensureReminder(item, "SUPPLY_EXPIRING", addMinutes(-7 * 24 * 60, item.expiresAt));
        }
      }
      if (item.area === "CONTACTS" && now - new Date(item.lastVerifiedAt).getTime() > 180 * 24 * 60 * 60_000) {
        item.status = "STALE";
        this.ensureAlert(item, "STALE_CONTACT", `stale-contact:${item.id}`);
        this.ensureReminder(item, "STALE_CONTACT", addMinutes(24 * 60, asOf));
      }
      if (this.incidentMode && item.incidentCritical) {
        this.ensureAlert(item, "INCIDENT_TASK", `incident:${item.id}`);
      }
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  ensureAlert(item: ReadinessItem, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), itemId: item.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(item: ReadinessItem, kind: Alert["kind"], scheduledFor: string) {
    const dedupeKey = `reminder:${item.id}:${kind}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), itemId: item.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
      this.reminders.unshift(reminder);
    }
    return reminder;
  }

  readinessScore() {
    if (this.items.length === 0) return 100;
    const ready = this.items.filter((item) => item.status === "READY" || item.status === "DONE").length;
    return Math.round((ready / this.items.length) * 100);
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  dispatchReminders() { let sent = 0; for (const reminder of this.reminders.filter((candidate) => candidate.status === "QUEUED")) { reminder.status = "SENT"; reminder.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated emergency reminder provider timeout"; return { processed: true, job }; }
    if (job.kind === "READINESS_SCAN") this.scanReadiness();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { items: [...this.items].sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name)), events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, incidentMode: this.incidentMode, metrics: { score: this.readinessScore(), ready: this.items.filter((item) => item.status === "READY" || item.status === "DONE").length, problems: this.items.filter((item) => !["READY", "DONE"].includes(item.status)).length, critical: this.items.filter((item) => item.incidentCritical).length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { items: this.items, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed], incidentMode: this.incidentMode }; }
  importState(state: Record<string, unknown>) { this.items = state.items as ReadinessItem[]; this.events = state.events as ReadinessEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); this.incidentMode = Boolean(state.incidentMode); }
}

export function createSeededReadiness(now: Date = new Date()) { const readiness = new EmergencyReadiness(); readiness.seed(now); return readiness; }
