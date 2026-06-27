import crypto from "node:crypto";

export type CareTaskKind = "FEEDING" | "WALK" | "MEDICATION" | "GROOMING" | "VET";
export type CareEventType = "COMPLETED" | "SKIPPED" | "SNOOZED" | "APPOINTMENT_BOOKED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Pet = {
  id: string;
  name: string;
  species: "DOG" | "CAT";
  breed: string;
};

export type Caregiver = {
  id: string;
  name: string;
  role: "OWNER" | "FAMILY" | "SITTER";
};

export type CareTask = {
  id: string;
  petId: string;
  kind: CareTaskKind;
  title: string;
  dueAt: string;
  windowMinutes: number;
  assignedTo: string;
  recurrence: "ONCE" | "DAILY" | "WEEKLY";
  status: "PENDING" | "DONE" | "MISSED" | "SKIPPED";
};

export type CareEventInput = {
  eventId: string;
  taskId: string;
  petId: string;
  caregiverId: string;
  type: CareEventType;
  occurredAt?: string;
  notes?: string;
  source?: string;
};

export type CareEvent = Required<Omit<CareEventInput, "occurredAt" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  receivedAt: string;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  taskId: string;
  kind: "MISSED_CARE" | "DUPLICATE_LOG" | "UPCOMING_VET" | "MEDICATION_DUE";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  taskId: string;
  caregiverId: string;
  channel: "PUSH" | "SMS";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Handoff = {
  petId: string;
  activeCaregiverId: string;
  nextCaregiverId: string;
  startsAt: string;
  notes: string;
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

export function careEventKey(input: Pick<CareEventInput, "caregiverId" | "eventId">) {
  if (!input.caregiverId || !input.eventId) throw new Error("caregiverId and eventId are required");
  return `${input.caregiverId}:${input.eventId}`;
}

export class PetCareCoordinator {
  pets: Pet[] = [];
  caregivers: Caregiver[] = [];
  tasks: CareTask[] = [];
  events: CareEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  handoffs: Handoff[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.pets = [
      { id: "pet-miso", name: "Miso", species: "CAT", breed: "Tabby" },
      { id: "pet-ruby", name: "Ruby", species: "DOG", breed: "Corgi" }
    ];
    this.caregivers = [
      { id: "care-ava", name: "Ava", role: "OWNER" },
      { id: "care-noah", name: "Noah", role: "FAMILY" },
      { id: "care-sam", name: "Sam", role: "SITTER" }
    ];
    this.tasks = [
      this.task("task-miso-breakfast", "pet-miso", "FEEDING", "Miso breakfast", addMinutes(-90, now), 45, "care-ava", "DAILY"),
      this.task("task-miso-meds", "pet-miso", "MEDICATION", "Miso thyroid pill", addMinutes(-35, now), 30, "care-noah", "DAILY"),
      this.task("task-ruby-walk", "pet-ruby", "WALK", "Ruby morning walk", addMinutes(-20, now), 35, "care-noah", "DAILY"),
      this.task("task-ruby-dinner", "pet-ruby", "FEEDING", "Ruby dinner", addMinutes(80, now), 45, "care-ava", "DAILY"),
      this.task("task-ruby-vet", "pet-ruby", "VET", "Ruby annual checkup", addMinutes(190, now), 120, "care-ava", "ONCE")
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.handoffs = [
      { petId: "pet-ruby", activeCaregiverId: "care-noah", nextCaregiverId: "care-sam", startsAt: addMinutes(240, now), notes: "Sitter takes over after work." }
    ];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;

    this.ingest({ eventId: "seed-1", taskId: "task-miso-breakfast", petId: "pet-miso", caregiverId: "care-ava", type: "COMPLETED", occurredAt: addMinutes(-82, now), notes: "Ate full bowl.", source: "seed" });
    this.ingest({ eventId: "seed-2", taskId: "task-ruby-walk", petId: "pet-ruby", caregiverId: "care-noah", type: "COMPLETED", occurredAt: addMinutes(-10, now), notes: "Short loop around the block.", source: "seed" });
    this.scanSchedules(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { pets: this.pets.length, tasks: this.tasks.length, alerts: this.alerts.length });
  }

  task(idValue: string, petId: string, kind: CareTaskKind, title: string, dueAt: string, windowMinutes: number, assignedTo: string, recurrence: CareTask["recurrence"]): CareTask {
    return { id: idValue, petId, kind, title, dueAt: iso(dueAt), windowMinutes, assignedTo, recurrence, status: "PENDING" };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  findPet(petId: string) {
    const pet = this.pets.find((candidate) => candidate.id === petId);
    if (!pet) throw new Error("pet not found");
    return pet;
  }

  findCaregiver(caregiverId: string) {
    const caregiver = this.caregivers.find((candidate) => candidate.id === caregiverId);
    if (!caregiver) throw new Error("caregiver not found");
    return caregiver;
  }

  findTask(taskId: string, petId?: string) {
    const task = this.tasks.find((candidate) => candidate.id === taskId && (!petId || candidate.petId === petId));
    if (!task) throw new Error("task not found");
    return task;
  }

  ingest(input: CareEventInput) {
    this.findPet(input.petId);
    this.findCaregiver(input.caregiverId);
    const task = this.findTask(input.taskId, input.petId);
    const eventKey = careEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };

    const occurredAt = iso(input.occurredAt || new Date());
    const priorForTask = this.events.find((event) => event.taskId === input.taskId && event.type === "COMPLETED");
    const event: CareEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      taskId: input.taskId,
      petId: input.petId,
      caregiverId: input.caregiverId,
      type: input.type,
      occurredAt,
      receivedAt: iso(),
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);
    if (input.type === "COMPLETED") task.status = "DONE";
    if (input.type === "SKIPPED") task.status = "SKIPPED";
    if (priorForTask && input.type === "COMPLETED") this.ensureAlert(task, "DUPLICATE_LOG", `duplicate:${task.id}:${occurredAt.slice(0, 10)}`);
    this.scanSchedules(occurredAt);
    this.createAudit("CARE_EVENT_INGESTED", { eventId: event.id, taskId: task.id, type: event.type });
    return { duplicate: false, event };
  }

  scanSchedules(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const task of this.tasks) {
      const deadline = new Date(task.dueAt).getTime() + task.windowMinutes * 60_000;
      if (task.kind === "MEDICATION" && task.status === "PENDING") this.ensureAlert(task, "MEDICATION_DUE", `med:${task.id}`);
      if (task.status === "PENDING" && deadline < now) {
        task.status = "MISSED";
        this.ensureAlert(task, "MISSED_CARE", `missed:${task.id}`);
      }
      const minutesUntilDue = (new Date(task.dueAt).getTime() - now) / 60_000;
      if (task.status === "PENDING" && minutesUntilDue <= 60 && minutesUntilDue >= -task.windowMinutes) {
        this.ensureReminder(task, task.assignedTo, addMinutes(-20, task.dueAt));
      }
      if (task.kind === "VET" && minutesUntilDue <= 240 && minutesUntilDue >= 0) this.ensureAlert(task, "UPCOMING_VET", `vet:${task.id}`);
    }
    return { missed: this.tasks.filter((task) => task.status === "MISSED").length, reminders: this.reminders.length };
  }

  ensureAlert(task: CareTask, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), taskId: task.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(task: CareTask, caregiverId: string, scheduledFor: string) {
    const dedupeKey = `reminder:${task.id}:${caregiverId}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), taskId: task.id, caregiverId, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
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
      job.lastError = "simulated reminder provider timeout";
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
    const today = this.tasks.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return {
      pets: this.pets,
      caregivers: this.caregivers,
      tasks: today,
      events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      alerts: this.alerts,
      reminders: this.reminders,
      handoffs: this.handoffs,
      jobs: this.jobs,
      audit: this.audit,
      metrics: {
        pets: this.pets.length,
        pendingTasks: this.tasks.filter((task) => task.status === "PENDING").length,
        completedTasks: this.tasks.filter((task) => task.status === "DONE").length,
        missedTasks: this.tasks.filter((task) => task.status === "MISSED").length,
        medicationDue: this.tasks.filter((task) => task.kind === "MEDICATION" && task.status === "PENDING").length,
        queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length,
        queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length,
        queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length
      }
    };
  }

  exportState() {
    return {
      pets: this.pets,
      caregivers: this.caregivers,
      tasks: this.tasks,
      events: this.events,
      alerts: this.alerts,
      reminders: this.reminders,
      handoffs: this.handoffs,
      jobs: this.jobs,
      audit: this.audit,
      processed: [...this.processed]
    };
  }

  importState(state: Record<string, unknown>) {
    this.pets = state.pets as Pet[];
    this.caregivers = state.caregivers as Caregiver[];
    this.tasks = state.tasks as CareTask[];
    this.events = state.events as CareEvent[];
    this.alerts = state.alerts as Alert[];
    this.reminders = state.reminders as Reminder[];
    this.handoffs = state.handoffs as Handoff[];
    this.jobs = state.jobs as Job[];
    this.audit = state.audit as Audit[];
    this.processed = new Set(state.processed as string[]);
  }
}

export function createSeededCoordinator(now: Date = new Date()) {
  const coordinator = new PetCareCoordinator();
  coordinator.seed(now);
  return coordinator;
}
