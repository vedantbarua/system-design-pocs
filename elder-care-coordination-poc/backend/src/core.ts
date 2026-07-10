import crypto from "node:crypto";

export type CareCategory = "MEAL" | "HYDRATION" | "MEDICATION_PICKUP" | "APPOINTMENT" | "TRANSPORT" | "WELLNESS_CALL" | "ERRAND" | "VISIT";
export type CareStatus = "SCHEDULED" | "DUE_SOON" | "DONE" | "MISSED" | "HANDOFF_PENDING" | "ESCALATED" | "CANCELLED";
export type CarePriority = "LOW" | "MEDIUM" | "HIGH";
export type CareEventType = "TASK_CREATED" | "TASK_UPDATED" | "CARE_LOGGED" | "TASK_SKIPPED" | "HANDOFF_REQUESTED" | "HANDOFF_ACCEPTED" | "ESCALATED" | "TASK_CANCELLED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type CareTask = {
  id: string;
  recipient: string;
  title: string;
  category: CareCategory;
  scheduledStartAt: string;
  scheduledEndAt: string;
  caregiver: string;
  backupCaregiver: string;
  location: string;
  status: CareStatus;
  priority: CarePriority;
  lastLoggedAt: string | null;
  updatedAt: string;
  notes: string;
};

export type CareEventInput = {
  eventId: string;
  taskId: string;
  type: CareEventType;
  occurredAt?: string;
  recipient?: string;
  title?: string;
  category?: CareCategory;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  caregiver?: string;
  backupCaregiver?: string;
  location?: string;
  priority?: CarePriority;
  notes?: string;
  source?: string;
};

export type CareEvent = Required<Omit<CareEventInput, "occurredAt" | "recipient" | "title" | "category" | "scheduledStartAt" | "scheduledEndAt" | "caregiver" | "backupCaregiver" | "location" | "priority" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  recipient: string;
  title: string;
  category: CareCategory;
  scheduledStartAt: string;
  scheduledEndAt: string;
  caregiver: string;
  backupCaregiver: string;
  location: string;
  priority: CarePriority;
  notes: string;
  source: string;
};

export type CareLog = {
  id: string;
  taskId: string;
  caregiver: string;
  type: "COMPLETED" | "SKIPPED" | "HANDOFF" | "ESCALATED";
  occurredAt: string;
  windowKey: string;
  duplicateOf: string | null;
};

export type Alert = {
  id: string;
  taskId: string;
  kind: "DUE_SOON" | "MISSED_CARE" | "DUPLICATE_LOG" | "HANDOFF_PENDING" | "ESCALATED_TASK";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  taskId: string;
  channel: "PUSH" | "SMS";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "CARE_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function careEventKey(input: Pick<CareEventInput, "taskId" | "eventId">) {
  if (!input.taskId || !input.eventId) throw new Error("taskId and eventId are required");
  return `${input.taskId}:${input.eventId}`;
}

export function careWindowKey(taskId: string, occurredAt: string | Date) {
  return `${taskId}:${iso(occurredAt).slice(0, 13)}`;
}

export function careTaskFingerprint(recipient: string, title: string, scheduledStartAt: string | Date) {
  return `${recipient.trim().toLowerCase()}:${title.trim().toLowerCase().replace(/\s+/g, " ")}:${iso(scheduledStartAt).slice(0, 10)}`;
}

export class ElderCareCoordinator {
  tasks: CareTask[] = [];
  logs: CareLog[] = [];
  events: CareEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.tasks = [
      this.task("task-breakfast", "Mira", "Breakfast and morning check", "MEAL", addMinutes(30, now), addMinutes(90, now), "Ava", "Noah", "Kitchen", "SCHEDULED", "HIGH", null, addMinutes(-4 * 60, now), "Confirm appetite and morning energy."),
      this.task("task-water", "Mira", "Hydration bottle refill", "HYDRATION", addMinutes(-150, now), addMinutes(-60, now), "Noah", "Ava", "Living room", "SCHEDULED", "MEDIUM", null, addMinutes(-8 * 60, now), "Use the marked bottle on the side table."),
      this.task("task-appointment", "Mira", "Cardiology appointment", "APPOINTMENT", addMinutes(24 * 60, now), addMinutes(25 * 60, now), "Isha", "Ava", "North Clinic", "SCHEDULED", "HIGH", null, addMinutes(-24 * 60, now), "Bring insurance card and recent readings."),
      this.task("task-ride", "Mira", "Clinic ride pickup", "TRANSPORT", addMinutes(23 * 60 + 15, now), addMinutes(23 * 60 + 45, now), "Noah", "Isha", "Driveway", "SCHEDULED", "HIGH", null, addMinutes(-24 * 60, now), "Car seat cushion is in the hallway closet."),
      this.task("task-call", "Mira", "Evening wellness call", "WELLNESS_CALL", addMinutes(10 * 60, now), addMinutes(10 * 60 + 30, now), "Ava", "Noah", "Phone", "HANDOFF_PENDING", "MEDIUM", null, addMinutes(-30, now), "Ava requested coverage for tonight."),
      this.task("task-pharmacy", "Mira", "Pick up refill bag", "MEDICATION_PICKUP", addMinutes(5 * 60, now), addMinutes(6 * 60, now), "Isha", "Noah", "Corner Pharmacy", "SCHEDULED", "HIGH", null, addMinutes(-6 * 60, now), "Ask pharmacist about delivery enrollment.")
    ];
    this.logs = [];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanCare(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { tasks: this.tasks.length, alerts: this.alerts.length, reminders: this.reminders.length });
  }

  task(idValue: string, recipient: string, title: string, category: CareCategory, scheduledStartAt: string, scheduledEndAt: string, caregiver: string, backupCaregiver: string, location: string, status: CareStatus, priority: CarePriority, lastLoggedAt: string | null, updatedAt: string, notes: string): CareTask {
    return { id: idValue, recipient, title, category, scheduledStartAt: iso(scheduledStartAt), scheduledEndAt: iso(scheduledEndAt), caregiver, backupCaregiver, location, status, priority, lastLoggedAt: lastLoggedAt ? iso(lastLoggedAt) : null, updatedAt: iso(updatedAt), notes };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  taskById(taskId: string) {
    const task = this.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error("care task not found");
    return task;
  }

  ingest(input: CareEventInput) {
    let task = this.tasks.find((candidate) => candidate.id === input.taskId);
    const eventKey = careEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!task && input.type !== "TASK_CREATED") throw new Error("care task not found");
    if (!task) {
      task = this.task(
        input.taskId,
        input.recipient || "Mira",
        input.title || "New care task",
        input.category || "VISIT",
        iso(input.scheduledStartAt || occurredAt),
        iso(input.scheduledEndAt || addMinutes(60, occurredAt)),
        input.caregiver || "Unassigned",
        input.backupCaregiver || "Family",
        input.location || "Home",
        "SCHEDULED",
        input.priority || "MEDIUM",
        null,
        occurredAt,
        input.notes || ""
      );
      this.tasks.push(task);
    }

    const event: CareEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      taskId: input.taskId,
      type: input.type,
      occurredAt,
      recipient: input.recipient || task.recipient,
      title: input.title || task.title,
      category: input.category || task.category,
      scheduledStartAt: input.scheduledStartAt ? iso(input.scheduledStartAt) : task.scheduledStartAt,
      scheduledEndAt: input.scheduledEndAt ? iso(input.scheduledEndAt) : task.scheduledEndAt,
      caregiver: input.caregiver || task.caregiver,
      backupCaregiver: input.backupCaregiver || task.backupCaregiver,
      location: input.location || task.location,
      priority: input.priority || task.priority,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(task.updatedAt).getTime() && ["TASK_UPDATED", "HANDOFF_REQUESTED", "HANDOFF_ACCEPTED", "ESCALATED", "TASK_CANCELLED"].includes(event.type);
    if (!staleUpdate) {
      if (event.type === "TASK_CREATED" || event.type === "TASK_UPDATED") this.applyEventToTask(task, event, "SCHEDULED");
      if (event.type === "TASK_CANCELLED") this.applyEventToTask(task, event, "CANCELLED");
      if (event.type === "HANDOFF_REQUESTED") this.applyEventToTask(task, event, "HANDOFF_PENDING");
      if (event.type === "HANDOFF_ACCEPTED") this.applyEventToTask(task, { ...event, caregiver: event.backupCaregiver, backupCaregiver: event.caregiver }, "SCHEDULED");
      if (event.type === "ESCALATED") this.applyEventToTask(task, event, "ESCALATED");
      if (event.type === "CARE_LOGGED") this.logCare(task.id, event.caregiver, "COMPLETED", occurredAt);
      if (event.type === "TASK_SKIPPED") this.logCare(task.id, event.caregiver, "SKIPPED", occurredAt);
    }

    this.scanCare(occurredAt);
    this.createAudit(staleUpdate ? "STALE_CARE_EVENT_IGNORED" : "CARE_EVENT_INGESTED", { eventId: event.id, taskId: task.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyEventToTask(task: CareTask, event: CareEvent, status: CareStatus) {
    task.recipient = event.recipient;
    task.title = event.title;
    task.category = event.category;
    task.scheduledStartAt = event.scheduledStartAt;
    task.scheduledEndAt = event.scheduledEndAt;
    task.caregiver = event.caregiver;
    task.backupCaregiver = event.backupCaregiver;
    task.location = event.location;
    task.priority = event.priority;
    task.notes = event.notes || task.notes;
    task.status = status;
    task.updatedAt = event.occurredAt;
  }

  logCare(taskId: string, caregiver: string, type: CareLog["type"], occurredAt: string | Date = new Date()) {
    const task = this.taskById(taskId);
    const loggedAt = iso(occurredAt);
    const windowKey = careWindowKey(taskId, loggedAt);
    const duplicate = type === "COMPLETED" ? this.logs.find((candidate) => candidate.taskId === taskId && candidate.type === "COMPLETED" && candidate.windowKey === windowKey) : undefined;
    const log: CareLog = { id: id("log"), taskId, caregiver, type, occurredAt: loggedAt, windowKey, duplicateOf: duplicate?.id || null };
    this.logs.unshift(log);
    task.lastLoggedAt = loggedAt;
    task.updatedAt = loggedAt;
    if (duplicate) this.ensureAlert(task, "DUPLICATE_LOG", `duplicate-log:${windowKey}`);
    else if (type === "COMPLETED") task.status = "DONE";
    else if (type === "SKIPPED") task.status = task.priority === "HIGH" ? "ESCALATED" : "MISSED";
    else if (type === "HANDOFF") task.status = "HANDOFF_PENDING";
    else if (type === "ESCALATED") task.status = "ESCALATED";
    this.createAudit("CARE_LOGGED", { taskId, caregiver, type, duplicateOf: log.duplicateOf });
    return log;
  }

  scanCare(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const task of this.tasks) {
      if (task.status === "DONE" || task.status === "CANCELLED") continue;
      const startsInMinutes = (new Date(task.scheduledStartAt).getTime() - now) / 60_000;
      const endedMinutesAgo = (now - new Date(task.scheduledEndAt).getTime()) / 60_000;
      if (startsInMinutes >= 0 && startsInMinutes <= 12 * 60) {
        if (task.status === "SCHEDULED") task.status = "DUE_SOON";
        this.ensureAlert(task, "DUE_SOON", `due-soon:${task.id}:${task.scheduledStartAt.slice(0, 13)}`);
        this.ensureReminder(task, "DUE_SOON", addMinutes(-60, task.scheduledStartAt));
      }
      if (endedMinutesAgo > 0 && task.status !== "HANDOFF_PENDING") {
        task.status = task.priority === "HIGH" ? "ESCALATED" : "MISSED";
        this.ensureAlert(task, "MISSED_CARE", `missed:${task.id}:${task.scheduledEndAt.slice(0, 13)}`);
      }
      if (task.status === "HANDOFF_PENDING") {
        this.ensureAlert(task, "HANDOFF_PENDING", `handoff:${task.id}`);
        this.ensureReminder(task, "HANDOFF_PENDING", addMinutes(30, asOf));
      }
      if (task.status === "ESCALATED") this.ensureAlert(task, "ESCALATED_TASK", `escalated:${task.id}`);
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  ensureAlert(task: CareTask, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), taskId: task.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(task: CareTask, kind: Alert["kind"], scheduledFor: string) {
    const dedupeKey = `reminder:${task.id}:${kind}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), taskId: task.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
      this.reminders.unshift(reminder);
    }
    return reminder;
  }

  careScore() {
    if (this.tasks.length === 0) return 100;
    const stable = this.tasks.filter((task) => ["SCHEDULED", "DUE_SOON", "DONE"].includes(task.status)).length;
    return Math.round((stable / this.tasks.length) * 100);
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  dispatchReminders() { let sent = 0; for (const reminder of this.reminders.filter((candidate) => candidate.status === "QUEUED")) { reminder.status = "SENT"; reminder.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated caregiver reminder provider timeout"; return { processed: true, job }; }
    if (job.kind === "CARE_SCAN") this.scanCare();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { tasks: [...this.tasks].sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt)), logs: this.logs, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { score: this.careScore(), scheduled: this.tasks.filter((task) => ["SCHEDULED", "DUE_SOON"].includes(task.status)).length, done: this.tasks.filter((task) => task.status === "DONE").length, missed: this.tasks.filter((task) => task.status === "MISSED").length, handoffs: this.tasks.filter((task) => task.status === "HANDOFF_PENDING").length, escalated: this.tasks.filter((task) => task.status === "ESCALATED").length, logs: this.logs.length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { tasks: this.tasks, logs: this.logs, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.tasks = state.tasks as CareTask[]; this.logs = state.logs as CareLog[] || []; this.events = state.events as CareEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededCare(now: Date = new Date()) { const care = new ElderCareCoordinator(); care.seed(now); return care; }
