import crypto from "node:crypto";

export type MachineKind = "WASHER" | "DRYER";
export type MachineStatus = "AVAILABLE" | "RUNNING" | "DONE" | "OFFLINE";
export type LoadStatus = "QUEUED" | "WASHING" | "WET_DONE" | "DRYING" | "DRY_DONE" | "FOLDING" | "COMPLETED" | "STALE";
export type LaundryEventType = "LOAD_STARTED" | "CYCLE_DONE" | "LOAD_MOVED" | "LOAD_FOLDED" | "MACHINE_OFFLINE" | "MACHINE_ONLINE";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Machine = {
  id: string;
  name: string;
  kind: MachineKind;
  status: MachineStatus;
  lastSeenAt: string;
  activeLoadId: string | null;
};

export type LaundryLoad = {
  id: string;
  householdMember: string;
  label: string;
  status: LoadStatus;
  machineId: string | null;
  startedAt: string;
  updatedAt: string;
  dueAt: string;
  handoffTo: string | null;
};

export type LaundryEventInput = {
  eventId: string;
  loadId: string;
  machineId: string;
  type: LaundryEventType;
  actor: string;
  occurredAt?: string;
  notes?: string;
  source?: string;
};

export type LaundryEvent = Required<Omit<LaundryEventInput, "occurredAt" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  receivedAt: string;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  loadId: string;
  kind: "WET_LOAD_STALE" | "DRYER_ABANDONED" | "MACHINE_OFFLINE" | "DUPLICATE_UPDATE";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  loadId: string;
  channel: "PUSH" | "SMS";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "LOAD_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function laundryEventKey(input: Pick<LaundryEventInput, "machineId" | "eventId">) {
  if (!input.machineId || !input.eventId) throw new Error("machineId and eventId are required");
  return `${input.machineId}:${input.eventId}`;
}

export class LaundryCoordinator {
  machines: Machine[] = [];
  loads: LaundryLoad[] = [];
  events: LaundryEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.machines = [
      { id: "washer-1", name: "Washer", kind: "WASHER", status: "AVAILABLE", lastSeenAt: iso(now), activeLoadId: null },
      { id: "dryer-1", name: "Dryer", kind: "DRYER", status: "AVAILABLE", lastSeenAt: iso(now), activeLoadId: null }
    ];
    this.loads = [
      this.load("load-towels", "Ava", "Towels", "WET_DONE", "washer-1", addMinutes(-105, now), addMinutes(-45, now), addMinutes(-15, now), "Noah"),
      this.load("load-workout", "Noah", "Workout clothes", "DRY_DONE", "dryer-1", addMinutes(-160, now), addMinutes(-50, now), addMinutes(-20, now), "Ava"),
      this.load("load-sheets", "Ava", "Sheets", "QUEUED", null, addMinutes(15, now), addMinutes(15, now), addMinutes(75, now), null)
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;

    this.machine("washer-1").status = "DONE";
    this.machine("washer-1").activeLoadId = "load-towels";
    this.machine("dryer-1").status = "DONE";
    this.machine("dryer-1").activeLoadId = "load-workout";

    this.ingest({ eventId: "seed-1", loadId: "load-towels", machineId: "washer-1", type: "CYCLE_DONE", actor: "Washer", occurredAt: addMinutes(-45, now), notes: "Wash cycle finished.", source: "seed" });
    this.ingest({ eventId: "seed-2", loadId: "load-workout", machineId: "dryer-1", type: "CYCLE_DONE", actor: "Dryer", occurredAt: addMinutes(-50, now), notes: "Dry cycle finished.", source: "seed" });
    this.scanLoads(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { machines: this.machines.length, loads: this.loads.length, alerts: this.alerts.length });
  }

  load(idValue: string, householdMember: string, label: string, status: LoadStatus, machineId: string | null, startedAt: string, updatedAt: string, dueAt: string, handoffTo: string | null): LaundryLoad {
    return { id: idValue, householdMember, label, status, machineId, startedAt: iso(startedAt), updatedAt: iso(updatedAt), dueAt: iso(dueAt), handoffTo };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  machine(machineId: string) {
    const machine = this.machines.find((candidate) => candidate.id === machineId);
    if (!machine) throw new Error("machine not found");
    return machine;
  }

  loadById(loadId: string) {
    const load = this.loads.find((candidate) => candidate.id === loadId);
    if (!load) throw new Error("load not found");
    return load;
  }

  ingest(input: LaundryEventInput) {
    const load = this.loadById(input.loadId);
    const machine = this.machine(input.machineId);
    const eventKey = laundryEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };

    const occurredAt = iso(input.occurredAt || new Date());
    const lastSimilar = this.events.find((event) => event.loadId === input.loadId && event.type === input.type && Math.abs(new Date(event.occurredAt).getTime() - new Date(occurredAt).getTime()) < 5 * 60_000);
    const event: LaundryEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      loadId: input.loadId,
      machineId: input.machineId,
      type: input.type,
      actor: input.actor,
      occurredAt,
      receivedAt: iso(),
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);
    machine.lastSeenAt = occurredAt;

    if (event.type === "LOAD_STARTED") {
      load.status = machine.kind === "WASHER" ? "WASHING" : "DRYING";
      load.machineId = machine.id;
      load.startedAt = occurredAt;
      load.dueAt = addMinutes(machine.kind === "WASHER" ? 45 : 55, occurredAt);
      machine.status = "RUNNING";
      machine.activeLoadId = load.id;
    }
    if (event.type === "CYCLE_DONE") {
      load.status = machine.kind === "WASHER" ? "WET_DONE" : "DRY_DONE";
      load.machineId = machine.id;
      load.dueAt = addMinutes(machine.kind === "WASHER" ? 30 : 45, occurredAt);
      machine.status = "DONE";
      machine.activeLoadId = load.id;
      this.ensureReminder(load, addMinutes(-5, load.dueAt));
    }
    if (event.type === "LOAD_MOVED") {
      load.status = machine.kind === "DRYER" ? "DRYING" : "WASHING";
      load.machineId = machine.id;
      load.dueAt = addMinutes(machine.kind === "DRYER" ? 55 : 45, occurredAt);
      machine.status = "RUNNING";
      machine.activeLoadId = load.id;
    }
    if (event.type === "LOAD_FOLDED") {
      load.status = "COMPLETED";
      load.machineId = null;
      machine.status = "AVAILABLE";
      machine.activeLoadId = null;
    }
    if (event.type === "MACHINE_OFFLINE") {
      machine.status = "OFFLINE";
      this.ensureAlert(load, "MACHINE_OFFLINE", `offline:${machine.id}`);
    }
    if (event.type === "MACHINE_ONLINE") {
      machine.status = machine.activeLoadId ? "RUNNING" : "AVAILABLE";
    }
    if (lastSimilar) this.ensureAlert(load, "DUPLICATE_UPDATE", `duplicate:${load.id}:${event.type}:${occurredAt.slice(0, 13)}`);

    load.updatedAt = occurredAt;
    this.scanLoads(occurredAt);
    this.createAudit("LAUNDRY_EVENT_INGESTED", { eventId: event.id, loadId: load.id, type: event.type });
    return { duplicate: false, event };
  }

  scanLoads(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const load of this.loads) {
      const due = new Date(load.dueAt).getTime();
      if (["WET_DONE", "DRY_DONE", "QUEUED"].includes(load.status) && due - now <= 20 * 60_000 && due - now >= -10 * 60_000) {
        this.ensureReminder(load, addMinutes(-10, load.dueAt));
      }
      if (load.status === "WET_DONE" && due < now) {
        load.status = "STALE";
        this.ensureAlert(load, "WET_LOAD_STALE", `wet:${load.id}`);
      }
      if (load.status === "DRY_DONE" && due < now) {
        load.status = "STALE";
        this.ensureAlert(load, "DRYER_ABANDONED", `dry:${load.id}`);
      }
    }
    return {
      stale: this.loads.filter((load) => load.status === "STALE").length,
      reminders: this.reminders.length
    };
  }

  ensureAlert(load: LaundryLoad, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), loadId: load.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(load: LaundryLoad, scheduledFor: string) {
    const dedupeKey = `reminder:${load.id}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), loadId: load.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
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

  retain(days = 14, asOf: string | Date = new Date()) {
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
      job.lastError = "simulated reminder provider timeout";
      return { processed: true, job };
    }
    if (job.kind === "LOAD_SCAN") this.scanLoads();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(14);
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
    const ordered = [...this.loads].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return {
      machines: this.machines,
      loads: ordered,
      events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      alerts: this.alerts,
      reminders: this.reminders,
      jobs: this.jobs,
      audit: this.audit,
      metrics: {
        availableMachines: this.machines.filter((machine) => machine.status === "AVAILABLE").length,
        runningMachines: this.machines.filter((machine) => machine.status === "RUNNING").length,
        activeLoads: this.loads.filter((load) => !["COMPLETED"].includes(load.status)).length,
        staleLoads: this.loads.filter((load) => load.status === "STALE").length,
        completedLoads: this.loads.filter((load) => load.status === "COMPLETED").length,
        queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length,
        queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length,
        queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length
      }
    };
  }

  exportState() {
    return {
      machines: this.machines,
      loads: this.loads,
      events: this.events,
      alerts: this.alerts,
      reminders: this.reminders,
      jobs: this.jobs,
      audit: this.audit,
      processed: [...this.processed]
    };
  }

  importState(state: Record<string, unknown>) {
    this.machines = state.machines as Machine[];
    this.loads = state.loads as LaundryLoad[];
    this.events = state.events as LaundryEvent[];
    this.alerts = state.alerts as Alert[];
    this.reminders = state.reminders as Reminder[];
    this.jobs = state.jobs as Job[];
    this.audit = state.audit as Audit[];
    this.processed = new Set(state.processed as string[]);
  }
}

export function createSeededCoordinator(now: Date = new Date()) {
  const coordinator = new LaundryCoordinator();
  coordinator.seed(now);
  return coordinator;
}
