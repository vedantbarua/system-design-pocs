import crypto from "node:crypto";

export type ScheduleKind = "SCHOOL_EVENT" | "HOMEWORK" | "FORM" | "SPORT" | "MUSIC" | "PICKUP" | "SUPPLY";
export type ScheduleStatus = "SCHEDULED" | "DUE_SOON" | "CONFLICT" | "NEEDS_PERMISSION" | "PICKUP_CHANGED" | "CANCELLED" | "COMPLETED";
export type SchoolEventType = "ITEM_IMPORTED" | "ITEM_UPDATED" | "PICKUP_CHANGED" | "FORM_SUBMITTED" | "ITEM_CANCELLED" | "ITEM_COMPLETED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type ScheduleItem = {
  id: string;
  childId: string;
  childName: string;
  title: string;
  organizer: string;
  kind: ScheduleKind;
  startAt: string;
  endAt: string;
  location: string;
  caregiver: string;
  pickupBy: string;
  dueAt: string | null;
  permissionDueAt: string | null;
  status: ScheduleStatus;
  updatedAt: string;
  fingerprint: string;
};

export type SchoolEventInput = {
  eventId: string;
  itemId: string;
  type: SchoolEventType;
  occurredAt?: string;
  childId?: string;
  childName?: string;
  title?: string;
  organizer?: string;
  kind?: ScheduleKind;
  startAt?: string;
  endAt?: string;
  location?: string;
  caregiver?: string;
  pickupBy?: string;
  dueAt?: string | null;
  permissionDueAt?: string | null;
  notes?: string;
  source?: string;
};

export type SchoolEvent = Required<Omit<SchoolEventInput, "occurredAt" | "childId" | "childName" | "title" | "organizer" | "kind" | "startAt" | "endAt" | "location" | "caregiver" | "pickupBy" | "dueAt" | "permissionDueAt" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  childId: string;
  childName: string;
  title: string;
  organizer: string;
  kind: ScheduleKind;
  startAt: string;
  endAt: string;
  location: string;
  caregiver: string;
  pickupBy: string;
  dueAt: string | null;
  permissionDueAt: string | null;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  itemId: string;
  kind: "ASSIGNMENT_DUE" | "FORM_DUE" | "SCHEDULE_CONFLICT" | "PICKUP_CONFIRM" | "START_SOON" | "STALE_SCHOOL_UPDATE";
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
  kind: "SCHEDULE_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function schoolEventKey(input: Pick<SchoolEventInput, "itemId" | "eventId">) {
  if (!input.itemId || !input.eventId) throw new Error("itemId and eventId are required");
  return `${input.itemId}:${input.eventId}`;
}

export function fingerprint(childName: string, organizer: string, title: string, startAt: string) {
  return `${childName.trim().toLowerCase()}:${organizer.trim().toLowerCase()}:${title.trim().toLowerCase().replace(/\s+/g, " ")}:${iso(startAt)}`;
}

export class SchoolActivityCoordinator {
  items: ScheduleItem[] = [];
  events: SchoolEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.items = [
      this.item("item-math", "child-ava", "Ava", "Fractions worksheet", "Lincoln Elementary", "HOMEWORK", addMinutes(30 * 60, now), addMinutes(30 * 60 + 30, now), "Home", "Noah", "Noah", addMinutes(30 * 60, now), null, "SCHEDULED", addMinutes(-2 * 24 * 60, now)),
      this.item("item-field-trip-form", "child-ava", "Ava", "Museum permission slip", "Lincoln Elementary", "FORM", addMinutes(4 * 24 * 60, now), addMinutes(4 * 24 * 60 + 60, now), "School", "Ava", "Noah", null, addMinutes(18 * 60, now), "NEEDS_PERMISSION", addMinutes(-3 * 24 * 60, now)),
      this.item("item-soccer", "child-ava", "Ava", "Soccer practice", "Park District", "SPORT", addMinutes(28 * 60, now), addMinutes(30 * 60, now), "North Field", "Noah", "Noah", null, null, "SCHEDULED", addMinutes(-8 * 24 * 60, now)),
      this.item("item-choir", "child-ava", "Ava", "Choir rehearsal", "Lincoln Elementary", "MUSIC", addMinutes(29 * 60, now), addMinutes(31 * 60, now), "Music Room", "Ava", "Ava", null, null, "SCHEDULED", addMinutes(-2 * 24 * 60, now)),
      this.item("item-pickup", "child-mia", "Mia", "Aftercare pickup", "Bright Aftercare", "PICKUP", addMinutes(5 * 60, now), addMinutes(5 * 60 + 30, now), "Aftercare door", "Ava", "Grandma Lee", null, null, "PICKUP_CHANGED", addMinutes(-60, now)),
      this.item("item-cleats", "child-mia", "Mia", "Bring soccer cleats", "Park District", "SUPPLY", addMinutes(22 * 60, now), addMinutes(22 * 60 + 30, now), "Home", "Noah", "Noah", addMinutes(20 * 60, now), null, "SCHEDULED", addMinutes(-9 * 24 * 60, now))
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanSchedule(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { items: this.items.length, alerts: this.alerts.length });
  }

  item(idValue: string, childId: string, childName: string, title: string, organizer: string, kind: ScheduleKind, startAt: string, endAt: string, location: string, caregiver: string, pickupBy: string, dueAt: string | null, permissionDueAt: string | null, status: ScheduleStatus, updatedAt: string): ScheduleItem {
    const start = iso(startAt);
    return {
      id: idValue,
      childId,
      childName,
      title,
      organizer,
      kind,
      startAt: start,
      endAt: iso(endAt),
      location,
      caregiver,
      pickupBy,
      dueAt: dueAt ? iso(dueAt) : null,
      permissionDueAt: permissionDueAt ? iso(permissionDueAt) : null,
      status,
      updatedAt: iso(updatedAt),
      fingerprint: fingerprint(childName, organizer, title, start)
    };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  itemById(itemId: string) {
    const item = this.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("schedule item not found");
    return item;
  }

  ingest(input: SchoolEventInput) {
    const item = this.itemById(input.itemId);
    const eventKey = schoolEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    const event: SchoolEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      itemId: input.itemId,
      type: input.type,
      occurredAt,
      childId: input.childId || item.childId,
      childName: input.childName || item.childName,
      title: input.title || item.title,
      organizer: input.organizer || item.organizer,
      kind: input.kind || item.kind,
      startAt: input.startAt ? iso(input.startAt) : item.startAt,
      endAt: input.endAt ? iso(input.endAt) : item.endAt,
      location: input.location || item.location,
      caregiver: input.caregiver || item.caregiver,
      pickupBy: input.pickupBy || item.pickupBy,
      dueAt: input.dueAt === undefined ? item.dueAt : input.dueAt ? iso(input.dueAt) : null,
      permissionDueAt: input.permissionDueAt === undefined ? item.permissionDueAt : input.permissionDueAt ? iso(input.permissionDueAt) : null,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(item.updatedAt).getTime();
    if (!staleUpdate && ["ITEM_IMPORTED", "ITEM_UPDATED", "PICKUP_CHANGED"].includes(event.type)) {
      item.childId = event.childId;
      item.childName = event.childName;
      item.title = event.title;
      item.organizer = event.organizer;
      item.kind = event.kind;
      item.startAt = event.startAt;
      item.endAt = event.endAt;
      item.location = event.location;
      item.caregiver = event.caregiver;
      item.pickupBy = event.pickupBy;
      item.dueAt = event.dueAt;
      item.permissionDueAt = event.permissionDueAt;
      item.updatedAt = occurredAt;
      item.fingerprint = fingerprint(item.childName, item.organizer, item.title, item.startAt);
      item.status = event.type === "PICKUP_CHANGED" ? "PICKUP_CHANGED" : "SCHEDULED";
    }
    if (!staleUpdate && event.type === "FORM_SUBMITTED") {
      item.permissionDueAt = null;
      item.status = "COMPLETED";
      item.updatedAt = occurredAt;
    }
    if (!staleUpdate && event.type === "ITEM_CANCELLED") {
      item.status = "CANCELLED";
      item.updatedAt = occurredAt;
    }
    if (!staleUpdate && event.type === "ITEM_COMPLETED") {
      item.status = "COMPLETED";
      item.updatedAt = occurredAt;
    }

    this.scanSchedule(occurredAt);
    this.createAudit(staleUpdate ? "STALE_SCHOOL_EVENT_IGNORED" : "SCHOOL_EVENT_INGESTED", { eventId: event.id, itemId: item.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  scanSchedule(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const item of this.items) {
      if (item.status === "CANCELLED" || item.status === "COMPLETED") continue;
      if (new Date(item.updatedAt).getTime() < now - 7 * 24 * 60 * 60_000 && new Date(item.startAt).getTime() > now) {
        this.ensureAlert(item, "STALE_SCHOOL_UPDATE", `stale:${item.id}`);
      }
      if (item.dueAt) {
        const minutesUntilDue = (new Date(item.dueAt).getTime() - now) / 60_000;
        if (minutesUntilDue <= 72 * 60 && minutesUntilDue >= 0) {
          if (item.status !== "PICKUP_CHANGED") item.status = "DUE_SOON";
          this.ensureAlert(item, "ASSIGNMENT_DUE", `due:${item.id}`);
          this.ensureReminder(item, "ASSIGNMENT_DUE", addMinutes(-4 * 60, item.dueAt));
        }
      }
      if (item.permissionDueAt) {
        const minutesUntilForm = (new Date(item.permissionDueAt).getTime() - now) / 60_000;
        if (minutesUntilForm <= 48 * 60 && minutesUntilForm >= 0) {
          item.status = "NEEDS_PERMISSION";
          this.ensureAlert(item, "FORM_DUE", `form:${item.id}`);
          this.ensureReminder(item, "FORM_DUE", addMinutes(-2 * 60, item.permissionDueAt));
        }
      }
      const minutesUntilStart = (new Date(item.startAt).getTime() - now) / 60_000;
      if (minutesUntilStart <= 24 * 60 && minutesUntilStart >= 0) {
        if (item.kind === "PICKUP") this.ensureAlert(item, "PICKUP_CONFIRM", `pickup:${item.id}`);
        else this.ensureAlert(item, "START_SOON", `start:${item.id}`);
        this.ensureReminder(item, item.kind === "PICKUP" ? "PICKUP_CONFIRM" : "START_SOON", addMinutes(-60, item.startAt));
      }
    }

    for (let i = 0; i < this.items.length; i += 1) {
      for (let j = i + 1; j < this.items.length; j += 1) {
        const left = this.items[i];
        const right = this.items[j];
        if (left.childId !== right.childId || this.isInactive(left) || this.isInactive(right)) continue;
        if (!this.isTimed(left) || !this.isTimed(right)) continue;
        if (this.overlaps(left, right)) {
          left.status = "CONFLICT";
          right.status = "CONFLICT";
          this.ensureAlert(right, "SCHEDULE_CONFLICT", `conflict:${left.id}:${right.id}`);
        }
      }
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  isInactive(item: ScheduleItem) {
    return item.status === "CANCELLED" || item.status === "COMPLETED";
  }

  isTimed(item: ScheduleItem) {
    return ["SCHOOL_EVENT", "SPORT", "MUSIC", "PICKUP"].includes(item.kind);
  }

  overlaps(left: ScheduleItem, right: ScheduleItem) {
    return new Date(left.startAt).getTime() < new Date(right.endAt).getTime() && new Date(right.startAt).getTime() < new Date(left.endAt).getTime();
  }

  ensureAlert(item: ScheduleItem, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), itemId: item.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(item: ScheduleItem, kind: Alert["kind"], scheduledFor: string) {
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
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated school notification timeout"; return { processed: true, job }; }
    if (job.kind === "SCHEDULE_SCAN") this.scanSchedule();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(180);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { items: [...this.items].sort((a, b) => a.startAt.localeCompare(b.startAt)), events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { children: new Set(this.items.map((item) => item.childId)).size, items: this.items.filter((item) => item.status !== "CANCELLED").length, conflicts: this.items.filter((item) => item.status === "CONFLICT").length, needsAction: this.items.filter((item) => ["DUE_SOON", "NEEDS_PERMISSION", "PICKUP_CHANGED"].includes(item.status)).length, reminders: this.reminders.length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { items: this.items, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.items = state.items as ScheduleItem[]; this.events = state.events as SchoolEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededCoordinator(now: Date = new Date()) { const coordinator = new SchoolActivityCoordinator(); coordinator.seed(now); return coordinator; }
