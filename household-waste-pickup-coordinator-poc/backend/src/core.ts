import crypto from "node:crypto";

export type PickupStream = "TRASH" | "RECYCLING" | "COMPOST" | "BULK";
export type RouteEventType = "ROUTE_DELAYED" | "PICKUP_COMPLETED" | "PICKUP_SKIPPED" | "HOLIDAY_SHIFT";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Household = {
  id: string;
  address: string;
  zone: string;
};

export type PickupSchedule = {
  id: string;
  householdId: string;
  stream: PickupStream;
  binColor: string;
  routeId: string;
  scheduledFor: string;
  recurrence: "WEEKLY" | "BIWEEKLY" | "ONCE";
  status: "SCHEDULED" | "COMPLETED" | "DELAYED" | "MISSED" | "SKIPPED";
};

export type RouteEventInput = {
  eventId: string;
  routeId: string;
  scheduleId: string;
  type: RouteEventType;
  occurredAt?: string;
  effectiveFor?: string;
  delayMinutes?: number;
  notes?: string;
  source?: string;
};

export type RouteEvent = Required<Omit<RouteEventInput, "occurredAt" | "effectiveFor" | "delayMinutes" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  effectiveFor: string;
  delayMinutes: number;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  scheduleId: string;
  kind: "MISSED_PICKUP" | "ROUTE_DELAY" | "HOLIDAY_SHIFT" | "SKIPPED_PICKUP" | "BULK_PICKUP_DUE";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  scheduleId: string;
  channel: "PUSH" | "SMS";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type RouteStatus = {
  routeId: string;
  status: "ON_TIME" | "DELAYED" | "PARTIAL" | "COMPLETE";
  updatedAt: string;
  note: string;
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

export type Audit = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  at: string;
};

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export function iso(value: string | number | Date = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

export function addMinutes(minutes: number, value: string | number | Date = new Date()) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

export function routeEventKey(input: Pick<RouteEventInput, "routeId" | "eventId">) {
  if (!input.routeId || !input.eventId) throw new Error("routeId and eventId are required");
  return `${input.routeId}:${input.eventId}`;
}

export class WastePickupCoordinator {
  household: Household = { id: "home-maple", address: "42 Maple Street", zone: "Northwest" };
  schedules: PickupSchedule[] = [];
  events: RouteEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  routeStatuses: RouteStatus[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.household = { id: "home-maple", address: "42 Maple Street", zone: "Northwest" };
    this.schedules = [
      this.schedule("sched-trash-last", "TRASH", "Green", "route-trash-nw", addMinutes(-1560, now), "WEEKLY", "SCHEDULED"),
      this.schedule("sched-recycle-today", "RECYCLING", "Blue", "route-recycle-nw", addMinutes(-120, now), "BIWEEKLY", "SCHEDULED"),
      this.schedule("sched-compost-today", "COMPOST", "Brown", "route-compost-nw", addMinutes(75, now), "WEEKLY", "SCHEDULED"),
      this.schedule("sched-trash-next", "TRASH", "Green", "route-trash-nw", addMinutes(1500, now), "WEEKLY", "SCHEDULED"),
      this.schedule("sched-bulk", "BULK", "Tagged item", "route-bulk-nw", addMinutes(210, now), "ONCE", "SCHEDULED")
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.routeStatuses = [
      { routeId: "route-trash-nw", status: "ON_TIME", updatedAt: iso(now), note: "Normal service" },
      { routeId: "route-recycle-nw", status: "ON_TIME", updatedAt: iso(now), note: "Normal service" },
      { routeId: "route-compost-nw", status: "ON_TIME", updatedAt: iso(now), note: "Normal service" },
      { routeId: "route-bulk-nw", status: "ON_TIME", updatedAt: iso(now), note: "Normal service" }
    ];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;

    this.ingest({ eventId: "seed-1", routeId: "route-trash-nw", scheduleId: "sched-trash-last", type: "PICKUP_COMPLETED", occurredAt: addMinutes(-1500, now), notes: "Collected before 8 AM.", source: "seed" });
    this.ingest({ eventId: "seed-2", routeId: "route-recycle-nw", scheduleId: "sched-recycle-today", type: "ROUTE_DELAYED", occurredAt: addMinutes(-90, now), delayMinutes: 180, notes: "Truck maintenance delay.", source: "seed" });
    this.ingest({ eventId: "seed-3", routeId: "route-trash-nw", scheduleId: "sched-trash-next", type: "HOLIDAY_SHIFT", occurredAt: addMinutes(-70, now), effectiveFor: addMinutes(2940, now), delayMinutes: 1440, notes: "Holiday service moves one day later.", source: "seed" });
    this.scanSchedules(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { schedules: this.schedules.length, events: this.events.length, alerts: this.alerts.length });
  }

  schedule(idValue: string, stream: PickupStream, binColor: string, routeId: string, scheduledFor: string, recurrence: PickupSchedule["recurrence"], status: PickupSchedule["status"]): PickupSchedule {
    return { id: idValue, householdId: this.household.id, stream, binColor, routeId, scheduledFor: iso(scheduledFor), recurrence, status };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  findSchedule(scheduleId: string) {
    const schedule = this.schedules.find((candidate) => candidate.id === scheduleId);
    if (!schedule) throw new Error("schedule not found");
    return schedule;
  }

  findRoute(routeId: string) {
    const status = this.routeStatuses.find((candidate) => candidate.routeId === routeId);
    if (!status) throw new Error("route not found");
    return status;
  }

  ingest(input: RouteEventInput) {
    const schedule = this.findSchedule(input.scheduleId);
    if (schedule.routeId !== input.routeId) throw new Error("route does not match schedule");
    const route = this.findRoute(input.routeId);
    const eventKey = routeEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };

    const event: RouteEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      routeId: input.routeId,
      scheduleId: input.scheduleId,
      type: input.type,
      occurredAt: iso(input.occurredAt || new Date()),
      effectiveFor: iso(input.effectiveFor || schedule.scheduledFor),
      delayMinutes: input.delayMinutes || 0,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    if (event.type === "PICKUP_COMPLETED") {
      schedule.status = "COMPLETED";
      route.status = "COMPLETE";
      route.note = event.notes || "Pickup completed";
    }
    if (event.type === "PICKUP_SKIPPED") {
      schedule.status = "SKIPPED";
      route.status = "PARTIAL";
      route.note = event.notes || "Pickup skipped";
      this.ensureAlert(schedule, "SKIPPED_PICKUP", `skipped:${schedule.id}`);
    }
    if (event.type === "ROUTE_DELAYED") {
      schedule.status = "DELAYED";
      route.status = "DELAYED";
      route.note = event.notes || `Delayed ${event.delayMinutes} minutes`;
      this.ensureAlert(schedule, "ROUTE_DELAY", `delay:${schedule.id}:${event.occurredAt.slice(0, 10)}`);
    }
    if (event.type === "HOLIDAY_SHIFT") {
      schedule.scheduledFor = event.effectiveFor;
      schedule.status = "SCHEDULED";
      route.note = event.notes || "Holiday shift applied";
      this.ensureAlert(schedule, "HOLIDAY_SHIFT", `holiday:${schedule.id}:${event.effectiveFor.slice(0, 10)}`);
    }

    route.updatedAt = event.occurredAt;
    this.scanSchedules(event.occurredAt);
    this.createAudit("ROUTE_EVENT_INGESTED", { eventId: event.id, scheduleId: schedule.id, type: event.type });
    return { duplicate: false, event };
  }

  scanSchedules(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const schedule of this.schedules) {
      const pickupTime = new Date(schedule.scheduledFor).getTime();
      const dueSoonMinutes = (pickupTime - now) / 60_000;
      if (schedule.status === "SCHEDULED" && dueSoonMinutes <= 12 * 60 && dueSoonMinutes >= -60) {
        this.ensureReminder(schedule, addMinutes(-720, schedule.scheduledFor));
      }
      if (schedule.stream === "BULK" && schedule.status === "SCHEDULED" && dueSoonMinutes <= 6 * 60 && dueSoonMinutes >= 0) {
        this.ensureAlert(schedule, "BULK_PICKUP_DUE", `bulk:${schedule.id}`);
      }
      if ((schedule.status === "SCHEDULED" || schedule.status === "DELAYED") && pickupTime + 6 * 60 * 60_000 < now) {
        schedule.status = "MISSED";
        this.ensureAlert(schedule, "MISSED_PICKUP", `missed:${schedule.id}`);
      }
    }
    return {
      reminders: this.reminders.length,
      missed: this.schedules.filter((schedule) => schedule.status === "MISSED").length
    };
  }

  ensureAlert(schedule: PickupSchedule, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), scheduleId: schedule.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(schedule: PickupSchedule, scheduledFor: string) {
    const dedupeKey = `reminder:${schedule.id}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), scheduleId: schedule.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
      this.reminders.unshift(reminder);
    }
    return reminder;
  }

  dispatchAlerts() {
    let sent = 0;
    for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) {
      alert.status = "SENT";
      alert.sentAt = iso();
      sent += 1;
    }
    return sent;
  }

  dispatchReminders() {
    let sent = 0;
    for (const reminder of this.reminders.filter((candidate) => candidate.status === "QUEUED")) {
      reminder.status = "SENT";
      reminder.sentAt = iso();
      sent += 1;
    }
    return sent;
  }

  retain(days = 30, asOf: string | Date = new Date()) {
    const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000;
    const before = this.events.length;
    this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff);
    this.processed = new Set(this.events.map((event) => event.eventKey));
    return { deleted: before - this.events.length };
  }

  ensureJob(kind: Job["kind"]) {
    const dedupeKey = `${kind}:${iso().slice(0, 13)}`;
    const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey);
    if (existing) return existing;
    const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null };
    this.jobs.unshift(job);
    return job;
  }

  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) {
      this.failNextJob = false;
      job.status = job.attempts >= 3 ? "DEAD" : "RETRY";
      job.lastError = "simulated municipal alert provider timeout";
      return { processed: true, job };
    }
    if (job.kind === "SCHEDULE_SCAN") this.scanSchedules();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(30);
    job.status = "COMPLETED";
    job.completedAt = iso();
    job.lastError = null;
    return { processed: true, job };
  }

  drainJobs() {
    let processed = 0;
    let completed = 0;
    while (true) {
      const result = this.dispatchNextJob();
      if (!result.processed || !result.job) break;
      processed += 1;
      if (result.job.status === "COMPLETED") completed += 1;
    }
    return { processed, completed };
  }

  snapshot() {
    const ordered = [...this.schedules].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return {
      household: this.household,
      schedules: ordered,
      events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      alerts: this.alerts,
      reminders: this.reminders,
      routeStatuses: this.routeStatuses,
      jobs: this.jobs,
      audit: this.audit,
      metrics: {
        scheduled: this.schedules.filter((schedule) => schedule.status === "SCHEDULED").length,
        completed: this.schedules.filter((schedule) => schedule.status === "COMPLETED").length,
        delayed: this.schedules.filter((schedule) => schedule.status === "DELAYED").length,
        missed: this.schedules.filter((schedule) => schedule.status === "MISSED").length,
        skipped: this.schedules.filter((schedule) => schedule.status === "SKIPPED").length,
        queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length,
        queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length,
        queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length
      }
    };
  }

  exportState() {
    return {
      household: this.household,
      schedules: this.schedules,
      events: this.events,
      alerts: this.alerts,
      reminders: this.reminders,
      routeStatuses: this.routeStatuses,
      jobs: this.jobs,
      audit: this.audit,
      processed: [...this.processed]
    };
  }

  importState(state: Record<string, unknown>) {
    this.household = state.household as Household;
    this.schedules = state.schedules as PickupSchedule[];
    this.events = state.events as RouteEvent[];
    this.alerts = state.alerts as Alert[];
    this.reminders = state.reminders as Reminder[];
    this.routeStatuses = state.routeStatuses as RouteStatus[];
    this.jobs = state.jobs as Job[];
    this.audit = state.audit as Audit[];
    this.processed = new Set(state.processed as string[]);
  }
}

export function createSeededCoordinator(now: Date = new Date()) {
  const coordinator = new WastePickupCoordinator();
  coordinator.seed(now);
  return coordinator;
}
