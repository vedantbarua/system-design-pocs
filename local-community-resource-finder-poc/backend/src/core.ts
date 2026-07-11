import crypto from "node:crypto";

export type ResourceCategory = "FOOD" | "CLINIC" | "SHELTER" | "UTILITY_HELP" | "LEGAL_AID" | "CHILDCARE" | "TRANSPORT" | "BENEFITS";
export type ResourceStatus = "OPEN" | "LIMITED" | "FULL" | "CLOSED" | "STALE";
export type ResourceEventType = "RESOURCE_CREATED" | "RESOURCE_UPDATED" | "CAPACITY_CHANGED" | "HOURS_CHANGED" | "RESOURCE_CLOSED" | "RESOURCE_REOPENED" | "RESOURCE_VERIFIED" | "RESOURCE_SAVED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type CommunityResource = {
  id: string;
  name: string;
  category: ResourceCategory;
  address: string;
  zipCode: string;
  languages: string[];
  eligibility: string[];
  documents: string[];
  hours: string;
  capacity: number;
  available: number;
  status: ResourceStatus;
  phone: string;
  verifiedAt: string;
  updatedAt: string;
};

export type ResourceEventInput = {
  eventId: string;
  resourceId: string;
  type: ResourceEventType;
  occurredAt?: string;
  name?: string;
  category?: ResourceCategory;
  address?: string;
  zipCode?: string;
  languages?: string[];
  eligibility?: string[];
  documents?: string[];
  hours?: string;
  capacity?: number;
  available?: number;
  status?: ResourceStatus;
  phone?: string;
  source?: string;
  userId?: string;
};

export type ResourceEvent = Required<Omit<ResourceEventInput, "occurredAt" | "name" | "category" | "address" | "zipCode" | "languages" | "eligibility" | "documents" | "hours" | "capacity" | "available" | "status" | "phone" | "source" | "userId">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  name: string;
  category: ResourceCategory;
  address: string;
  zipCode: string;
  languages: string[];
  eligibility: string[];
  documents: string[];
  hours: string;
  capacity: number;
  available: number;
  status: ResourceStatus;
  phone: string;
  source: string;
  userId: string;
};

export type SavedResource = {
  id: string;
  userId: string;
  resourceId: string;
  reason: string;
  savedAt: string;
  lastNotifiedAt: string | null;
};

export type SearchQuery = {
  category?: ResourceCategory;
  zipCode?: string;
  language?: string;
  eligibility?: string;
  needsOpenNow?: boolean;
  maxDocuments?: number;
};

export type Alert = {
  id: string;
  resourceId: string;
  userId: string;
  kind: "SAVED_CHANGED" | "CAPACITY_LOW" | "RESOURCE_FULL" | "RESOURCE_CLOSED" | "STALE_LISTING" | "RESOURCE_REOPENED";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "RESOURCE_SCAN" | "ALERT_DISPATCH" | "CACHE_REFRESH" | "RETENTION";
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

export function resourceEventKey(input: Pick<ResourceEventInput, "resourceId" | "eventId">) {
  if (!input.resourceId || !input.eventId) throw new Error("resourceId and eventId are required");
  return `${input.resourceId}:${input.eventId}`;
}

export function resourceFingerprint(name: string, zipCode: string, address: string) {
  return `${name.trim().toLowerCase().replace(/\s+/g, " ")}:${zipCode.trim()}:${address.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export class CommunityResourceFinder {
  resources: CommunityResource[] = [];
  saved: SavedResource[] = [];
  events: ResourceEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  searchCache = new Map<string, CommunityResource[]>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.resources = [
      this.resource("res-food-bank", "Northside Food Pantry", "FOOD", "120 Maple Ave", "60618", ["English", "Spanish"], ["ZIP_60618", "LOW_INCOME"], ["Photo ID"], "Mon Wed Fri 9-3", 120, 18, "LIMITED", "312-555-0101", addMinutes(-12 * 60, now), addMinutes(-2 * 60, now)),
      this.resource("res-clinic", "Community Care Clinic", "CLINIC", "44 Ash Street", "60618", ["English", "Spanish", "Polish"], ["UNINSURED", "MEDICAID"], ["Photo ID", "Proof of address"], "Daily 8-6", 60, 24, "OPEN", "312-555-0188", addMinutes(-2 * 24 * 60, now), addMinutes(-2 * 24 * 60, now)),
      this.resource("res-utility", "Utility Relief Desk", "UTILITY_HELP", "8 Civic Center", "60618", ["English"], ["LOW_INCOME", "PAST_DUE_BILL"], ["Utility bill", "Photo ID", "Income proof"], "Tue Thu 10-4", 35, 0, "FULL", "312-555-0144", addMinutes(-6 * 24 * 60, now), addMinutes(-1 * 60, now)),
      this.resource("res-shelter", "Lakeview Overnight Shelter", "SHELTER", "77 Harbor Road", "60613", ["English"], ["ADULT"], ["Intake form"], "Nightly 7-7", 80, 0, "CLOSED", "312-555-0199", addMinutes(-3 * 60, now), addMinutes(-3 * 60, now)),
      this.resource("res-legal", "Neighborhood Legal Aid", "LEGAL_AID", "19 Court Plaza", "60618", ["English", "Spanish"], ["TENANT", "LOW_INCOME"], ["Lease", "Notice"], "Mon Thu 11-5", 20, 7, "OPEN", "312-555-0162", addMinutes(-40 * 24 * 60, now), addMinutes(-20 * 24 * 60, now)),
      this.resource("res-transport", "Clinic Shuttle Route A", "TRANSPORT", "Main Library Stop", "60618", ["English"], ["SENIOR", "DISABILITY"], ["Appointment proof"], "Weekdays 8-5", 16, 5, "OPEN", "312-555-0133", addMinutes(-1 * 24 * 60, now), addMinutes(-1 * 24 * 60, now))
    ];
    this.saved = [
      { id: "save-food", userId: "user-demo", resourceId: "res-food-bank", reason: "weekly groceries", savedAt: addMinutes(-5 * 60, now), lastNotifiedAt: null },
      { id: "save-utility", userId: "user-demo", resourceId: "res-utility", reason: "bill help", savedAt: addMinutes(-2 * 60, now), lastNotifiedAt: null }
    ];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.searchCache = new Map();
    this.failNextJob = false;
    this.scanResources(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { resources: this.resources.length, saved: this.saved.length, alerts: this.alerts.length });
  }

  resource(idValue: string, name: string, category: ResourceCategory, address: string, zipCode: string, languages: string[], eligibility: string[], documents: string[], hours: string, capacity: number, available: number, status: ResourceStatus, phone: string, verifiedAt: string, updatedAt: string): CommunityResource {
    return { id: idValue, name, category, address, zipCode, languages, eligibility, documents, hours, capacity, available, status, phone, verifiedAt: iso(verifiedAt), updatedAt: iso(updatedAt) };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  resourceById(resourceId: string) {
    const resource = this.resources.find((candidate) => candidate.id === resourceId);
    if (!resource) throw new Error("community resource not found");
    return resource;
  }

  ingest(input: ResourceEventInput) {
    let resource = this.resources.find((candidate) => candidate.id === input.resourceId);
    const eventKey = resourceEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!resource && input.type !== "RESOURCE_CREATED") throw new Error("community resource not found");
    if (!resource) {
      resource = this.resource(
        input.resourceId,
        input.name || "New resource",
        input.category || "BENEFITS",
        input.address || "Address pending",
        input.zipCode || "00000",
        input.languages || ["English"],
        input.eligibility || ["OPEN_TO_PUBLIC"],
        input.documents || [],
        input.hours || "Hours pending",
        input.capacity ?? 0,
        input.available ?? 0,
        input.status || "OPEN",
        input.phone || "pending",
        occurredAt,
        occurredAt
      );
      this.resources.push(resource);
    }

    const event: ResourceEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      resourceId: input.resourceId,
      type: input.type,
      occurredAt,
      name: input.name || resource.name,
      category: input.category || resource.category,
      address: input.address || resource.address,
      zipCode: input.zipCode || resource.zipCode,
      languages: input.languages || resource.languages,
      eligibility: input.eligibility || resource.eligibility,
      documents: input.documents || resource.documents,
      hours: input.hours || resource.hours,
      capacity: input.capacity ?? resource.capacity,
      available: input.available ?? resource.available,
      status: input.status || resource.status,
      phone: input.phone || resource.phone,
      source: input.source || "api",
      userId: input.userId || "user-demo"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(resource.updatedAt).getTime() && event.type !== "RESOURCE_SAVED";
    if (!staleUpdate) {
      if (event.type === "RESOURCE_CREATED" || event.type === "RESOURCE_UPDATED" || event.type === "CAPACITY_CHANGED" || event.type === "HOURS_CHANGED") this.applyEventToResource(resource, event, event.status);
      if (event.type === "RESOURCE_CLOSED") this.applyEventToResource(resource, event, "CLOSED");
      if (event.type === "RESOURCE_REOPENED") this.applyEventToResource(resource, event, event.available === 0 ? "FULL" : "OPEN");
      if (event.type === "RESOURCE_VERIFIED") { this.applyEventToResource(resource, event, event.status); resource.verifiedAt = occurredAt; }
      if (event.type === "RESOURCE_SAVED") this.saveResource(event.userId, event.resourceId, event.source);
    }

    this.searchCache.clear();
    this.scanResources(occurredAt);
    this.createAudit(staleUpdate ? "STALE_RESOURCE_EVENT_IGNORED" : "RESOURCE_EVENT_INGESTED", { eventId: event.id, resourceId: resource.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyEventToResource(resource: CommunityResource, event: ResourceEvent, status: ResourceStatus) {
    resource.name = event.name;
    resource.category = event.category;
    resource.address = event.address;
    resource.zipCode = event.zipCode;
    resource.languages = event.languages;
    resource.eligibility = event.eligibility;
    resource.documents = event.documents;
    resource.hours = event.hours;
    resource.capacity = event.capacity;
    resource.available = Math.max(0, event.available);
    resource.status = status;
    resource.phone = event.phone;
    resource.updatedAt = event.occurredAt;
    this.notifySaved(resource, status === "CLOSED" ? "RESOURCE_CLOSED" : status === "FULL" ? "RESOURCE_FULL" : "SAVED_CHANGED");
  }

  saveResource(userId: string, resourceId: string, reason = "saved from search") {
    this.resourceById(resourceId);
    const existing = this.saved.find((candidate) => candidate.userId === userId && candidate.resourceId === resourceId);
    if (existing) return existing;
    const saved: SavedResource = { id: id("save"), userId, resourceId, reason, savedAt: iso(), lastNotifiedAt: null };
    this.saved.unshift(saved);
    this.createAudit("RESOURCE_SAVED", { userId, resourceId });
    return saved;
  }

  search(query: SearchQuery = {}) {
    const key = JSON.stringify(query);
    const cached = this.searchCache.get(key);
    if (cached) return { cached: true, results: cached };
    const results = this.resources.filter((resource) => {
      if (query.category && resource.category !== query.category) return false;
      if (query.zipCode && resource.zipCode !== query.zipCode) return false;
      if (query.language && !resource.languages.map((language) => language.toLowerCase()).includes(query.language.toLowerCase())) return false;
      if (query.eligibility && !resource.eligibility.includes(query.eligibility)) return false;
      if (query.needsOpenNow && !["OPEN", "LIMITED"].includes(resource.status)) return false;
      if (query.maxDocuments !== undefined && resource.documents.length > query.maxDocuments) return false;
      return true;
    }).sort((a, b) => b.available - a.available || a.name.localeCompare(b.name));
    this.searchCache.set(key, results);
    return { cached: false, results };
  }

  scanResources(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const resource of this.resources) {
      if (resource.available <= 0 && resource.status !== "CLOSED") {
        resource.status = "FULL";
        this.ensureAlert(resource, "RESOURCE_FULL", `full:${resource.id}`);
        this.notifySaved(resource, "RESOURCE_FULL");
      } else if (resource.available > 0 && resource.capacity > 0 && resource.available / resource.capacity <= 0.2 && ["OPEN", "LIMITED"].includes(resource.status)) {
        resource.status = "LIMITED";
        this.ensureAlert(resource, "CAPACITY_LOW", `capacity-low:${resource.id}:${resource.updatedAt.slice(0, 13)}`);
      }
      if (resource.status === "CLOSED") {
        this.ensureAlert(resource, "RESOURCE_CLOSED", `closed:${resource.id}:${resource.updatedAt.slice(0, 13)}`);
        this.notifySaved(resource, "RESOURCE_CLOSED");
      }
      if (now - new Date(resource.verifiedAt).getTime() > 30 * 24 * 60 * 60_000) {
        resource.status = "STALE";
        this.ensureAlert(resource, "STALE_LISTING", `stale:${resource.id}`);
      }
    }
    return { alerts: this.alerts.length };
  }

  notifySaved(resource: CommunityResource, kind: Alert["kind"]) {
    for (const saved of this.saved.filter((candidate) => candidate.resourceId === resource.id)) {
      const alert = this.ensureAlert(resource, kind, `saved:${kind}:${saved.userId}:${resource.id}:${resource.updatedAt.slice(0, 13)}`, saved.userId);
      saved.lastNotifiedAt = alert.createdAt;
    }
  }

  ensureAlert(resource: CommunityResource, kind: Alert["kind"], dedupeKey: string, userId = "user-demo") {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), resourceId: resource.id, userId, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  directoryScore() {
    if (this.resources.length === 0) return 100;
    const usable = this.resources.filter((resource) => ["OPEN", "LIMITED"].includes(resource.status)).length;
    return Math.round((usable / this.resources.length) * 100);
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated provider verification timeout"; return { processed: true, job }; }
    if (job.kind === "RESOURCE_SCAN") this.scanResources();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "CACHE_REFRESH") this.searchCache.clear();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { resources: [...this.resources].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)), saved: this.saved, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, search: { cachedQueries: this.searchCache.size, featured: this.search({ zipCode: "60618", needsOpenNow: true }).results.slice(0, 5) }, metrics: { score: this.directoryScore(), total: this.resources.length, open: this.resources.filter((resource) => resource.status === "OPEN").length, limited: this.resources.filter((resource) => resource.status === "LIMITED").length, full: this.resources.filter((resource) => resource.status === "FULL").length, closed: this.resources.filter((resource) => resource.status === "CLOSED").length, stale: this.resources.filter((resource) => resource.status === "STALE").length, saved: this.saved.length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { resources: this.resources, saved: this.saved, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.resources = state.resources as CommunityResource[]; this.saved = state.saved as SavedResource[] || []; this.events = state.events as ResourceEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); this.searchCache = new Map(); }
}

export function createSeededFinder(now: Date = new Date()) { const finder = new CommunityResourceFinder(); finder.seed(now); return finder; }
