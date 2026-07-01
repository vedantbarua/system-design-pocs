import crypto from "node:crypto";

export type ErrandKind = "GROCERY" | "PHARMACY" | "POST_OFFICE" | "RETURN" | "PICKUP" | "OTHER";
export type ErrandStatus = "PENDING" | "PLANNED" | "COMPLETED" | "SKIPPED" | "MISSED";
export type ErrandEventType = "ERRAND_ADDED" | "ERRAND_COMPLETED" | "ERRAND_SKIPPED" | "LOCATION_UPDATED" | "ROUTE_REBUILT";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Errand = {
  id: string;
  title: string;
  kind: ErrandKind;
  location: string;
  lat: number;
  lng: number;
  priority: 1 | 2 | 3;
  deadlineAt: string;
  opensAt: string;
  closesAt: string;
  status: ErrandStatus;
};

export type RouteStop = {
  errandId: string;
  sequence: number;
  eta: string;
  distanceMiles: number;
  reason: string;
};

export type RoutePlan = {
  id: string;
  status: "FRESH" | "STALE";
  originLat: number;
  originLng: number;
  generatedAt: string;
  totalMiles: number;
  stops: RouteStop[];
};

export type ErrandEventInput = {
  eventId: string;
  errandId: string;
  type: ErrandEventType;
  occurredAt?: string;
  lat?: number;
  lng?: number;
  title?: string;
  notes?: string;
  source?: string;
};

export type ErrandEvent = Required<Omit<ErrandEventInput, "occurredAt" | "lat" | "lng" | "title" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  lat: number;
  lng: number;
  title: string;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  errandId: string;
  kind: "MISSED_WINDOW" | "ROUTE_STALE" | "DUPLICATE_UPDATE" | "HIGH_PRIORITY_DUE";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  errandId: string;
  channel: "PUSH" | "SMS";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "ROUTE_REBUILD" | "WINDOW_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function errandEventKey(input: Pick<ErrandEventInput, "errandId" | "eventId">) {
  if (!input.errandId || !input.eventId) throw new Error("errandId and eventId are required");
  return `${input.errandId}:${input.eventId}`;
}

export class ErrandRoutePlanner {
  errands: Errand[] = [];
  routePlan: RoutePlan | null = null;
  events: ErrandEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;
  currentLocation = { lat: 37.7749, lng: -122.4194 };

  seed(now: Date = new Date()) {
    this.errands = [
      this.errand("errand-groceries", "Weekly groceries", "GROCERY", "Market Hall", 37.781, -122.411, 2, addMinutes(210, now), "08:00", "21:00", "PENDING"),
      this.errand("errand-pharmacy", "Pick up prescription", "PHARMACY", "Neighborhood Pharmacy", 37.769, -122.426, 1, addMinutes(90, now), "09:00", "18:00", "PENDING"),
      this.errand("errand-return", "Return headphones", "RETURN", "Parcel counter", 37.759, -122.414, 3, addMinutes(-30, now), "10:00", "17:00", "PENDING"),
      this.errand("errand-mail", "Mail documents", "POST_OFFICE", "Post office", 37.788, -122.401, 2, addMinutes(300, now), "09:00", "17:00", "PENDING")
    ];
    this.routePlan = null;
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.currentLocation = { lat: 37.7749, lng: -122.4194 };
    const seededRoute = this.rebuildRoute(now);
    this.ingest({ eventId: "seed-1", errandId: "errand-groceries", type: "LOCATION_UPDATED", lat: 37.775, lng: -122.418, occurredAt: addMinutes(-45, now), source: "seed" });
    this.scanWindows(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { errands: this.errands.length, stops: seededRoute.stops.length });
  }

  errand(idValue: string, title: string, kind: ErrandKind, location: string, lat: number, lng: number, priority: 1 | 2 | 3, deadlineAt: string, opensAt: string, closesAt: string, status: ErrandStatus): Errand {
    return { id: idValue, title, kind, location, lat, lng, priority, deadlineAt: iso(deadlineAt), opensAt, closesAt, status };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  errandById(errandId: string) {
    const errand = this.errands.find((candidate) => candidate.id === errandId);
    if (!errand) throw new Error("errand not found");
    return errand;
  }

  ingest(input: ErrandEventInput) {
    const errand = this.errandById(input.errandId);
    const eventKey = errandEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };

    const occurredAt = iso(input.occurredAt || new Date());
    const priorSimilar = this.events.find((event) => event.errandId === input.errandId && event.type === input.type && Math.abs(new Date(event.occurredAt).getTime() - new Date(occurredAt).getTime()) < 5 * 60_000);
    const event: ErrandEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      errandId: input.errandId,
      type: input.type,
      occurredAt,
      lat: input.lat ?? this.currentLocation.lat,
      lng: input.lng ?? this.currentLocation.lng,
      title: input.title || errand.title,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);
    if (event.type === "LOCATION_UPDATED") {
      this.currentLocation = { lat: event.lat, lng: event.lng };
      this.markRouteStale(errand, occurredAt);
    }
    if (event.type === "ERRAND_COMPLETED") errand.status = "COMPLETED";
    if (event.type === "ERRAND_SKIPPED") errand.status = "SKIPPED";
    if (event.type === "ERRAND_ADDED") errand.status = "PENDING";
    if (event.type === "ROUTE_REBUILT") this.rebuildRoute(occurredAt);
    if (priorSimilar) this.ensureAlert(errand, "DUPLICATE_UPDATE", `duplicate:${errand.id}:${event.type}:${occurredAt.slice(0, 13)}`);
    this.rebuildRoute(occurredAt);
    this.scanWindows(occurredAt);
    this.createAudit("ERRAND_EVENT_INGESTED", { eventId: event.id, errandId: errand.id, type: event.type });
    return { duplicate: false, event };
  }

  rebuildRoute(asOf: string | Date = new Date()) {
    const pending = this.errands
      .filter((errand) => errand.status === "PENDING" || errand.status === "PLANNED")
      .sort((a, b) => a.priority - b.priority || a.deadlineAt.localeCompare(b.deadlineAt));
    let lat = this.currentLocation.lat;
    let lng = this.currentLocation.lng;
    let cursor = new Date(asOf).getTime();
    const stops: RouteStop[] = [];
    for (const [index, errand] of pending.entries()) {
      const miles = distanceMiles(lat, lng, errand.lat, errand.lng);
      cursor += Math.round((miles / 18) * 60 * 60_000) + 10 * 60_000;
      errand.status = "PLANNED";
      stops.push({ errandId: errand.id, sequence: index + 1, eta: iso(cursor), distanceMiles: Number(miles.toFixed(1)), reason: errand.priority === 1 ? "high priority" : "nearest deadline" });
      lat = errand.lat;
      lng = errand.lng;
    }
    this.routePlan = { id: this.routePlan?.id || id("route"), status: "FRESH", originLat: this.currentLocation.lat, originLng: this.currentLocation.lng, generatedAt: iso(asOf), totalMiles: Number(stops.reduce((sum, stop) => sum + stop.distanceMiles, 0).toFixed(1)), stops };
    this.queueRouteReminders(asOf);
    return this.routePlan;
  }

  markRouteStale(errand: Errand, at: string) {
    if (this.routePlan) this.routePlan.status = "STALE";
    this.ensureAlert(errand, "ROUTE_STALE", `route-stale:${at.slice(0, 13)}`);
  }

  scanWindows(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const errand of this.errands) {
      if ((errand.status === "PENDING" || errand.status === "PLANNED") && new Date(errand.deadlineAt).getTime() < now) {
        errand.status = "MISSED";
        this.ensureAlert(errand, "MISSED_WINDOW", `missed:${errand.id}`);
      }
      const minutesUntilDeadline = (new Date(errand.deadlineAt).getTime() - now) / 60_000;
      if (errand.priority === 1 && minutesUntilDeadline <= 120 && minutesUntilDeadline >= 0 && errand.status !== "COMPLETED") this.ensureAlert(errand, "HIGH_PRIORITY_DUE", `priority:${errand.id}`);
      if (minutesUntilDeadline <= 90 && minutesUntilDeadline >= 0 && errand.status !== "COMPLETED") this.ensureReminder(errand, addMinutes(-30, errand.deadlineAt));
    }
    return { missed: this.errands.filter((errand) => errand.status === "MISSED").length, reminders: this.reminders.length };
  }

  queueRouteReminders(asOf: string | Date) {
    for (const stop of this.routePlan?.stops || []) {
      const errand = this.errandById(stop.errandId);
      const minutesUntilEta = (new Date(stop.eta).getTime() - new Date(asOf).getTime()) / 60_000;
      if (minutesUntilEta <= 180) this.ensureReminder(errand, addMinutes(-15, stop.eta));
    }
  }

  ensureAlert(errand: Errand, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), errandId: errand.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(errand: Errand, scheduledFor: string) {
    const dedupeKey = `reminder:${errand.id}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), errandId: errand.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
      this.reminders.unshift(reminder);
    }
    return reminder;
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  dispatchReminders() { let sent = 0; for (const reminder of this.reminders.filter((candidate) => candidate.status === "QUEUED")) { reminder.status = "SENT"; reminder.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 30, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated route cache timeout"; return { processed: true, job }; }
    if (job.kind === "ROUTE_REBUILD") this.rebuildRoute();
    if (job.kind === "WINDOW_SCAN") this.scanWindows();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(30);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { errands: [...this.errands].sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt)), routePlan: this.routePlan, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { pending: this.errands.filter((errand) => errand.status === "PENDING" || errand.status === "PLANNED").length, completed: this.errands.filter((errand) => errand.status === "COMPLETED").length, missed: this.errands.filter((errand) => errand.status === "MISSED").length, routeMiles: this.routePlan?.totalMiles || 0, routeStale: this.routePlan?.status === "STALE", queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { errands: this.errands, routePlan: this.routePlan, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed], currentLocation: this.currentLocation }; }
  importState(state: Record<string, unknown>) { this.errands = state.errands as Errand[]; this.routePlan = state.routePlan as RoutePlan | null; this.events = state.events as ErrandEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); this.currentLocation = state.currentLocation as { lat: number; lng: number }; }
}

function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const x = (bLng - aLng) * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const y = bLat - aLat;
  return Math.sqrt(x * x + y * y) * 69;
}

export function createSeededPlanner(now: Date = new Date()) { const planner = new ErrandRoutePlanner(); planner.seed(now); return planner; }
