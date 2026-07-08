import crypto from "node:crypto";

export type HabitCategory = "MORNING" | "HEALTH" | "FITNESS" | "LEARNING" | "HOME" | "EVENING" | "ERRAND";
export type HabitStatus = "SCHEDULED" | "DUE_SOON" | "DONE" | "MISSED" | "SKIPPED" | "OVERLOADED";
export type HabitEventType = "HABIT_CREATED" | "HABIT_UPDATED" | "CHECKED_IN" | "SKIPPED" | "WINDOW_MOVED" | "HABIT_ARCHIVED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Habit = {
  id: string;
  title: string;
  category: HabitCategory;
  cadence: "DAILY" | "WEEKDAYS" | "WEEKLY";
  windowStartAt: string;
  windowEndAt: string;
  reminderAt: string;
  owner: string;
  streak: number;
  longestStreak: number;
  status: HabitStatus;
  lastCheckInAt: string | null;
  updatedAt: string;
  archived: boolean;
};

export type HabitLog = {
  id: string;
  habitId: string;
  type: "CHECKED_IN" | "SKIPPED";
  occurredAt: string;
  windowKey: string;
  duplicateOf: string | null;
};

export type HabitEventInput = {
  eventId: string;
  habitId: string;
  type: HabitEventType;
  occurredAt?: string;
  title?: string;
  category?: HabitCategory;
  cadence?: Habit["cadence"];
  windowStartAt?: string;
  windowEndAt?: string;
  reminderAt?: string;
  owner?: string;
  notes?: string;
  source?: string;
};

export type HabitEvent = Required<Omit<HabitEventInput, "occurredAt" | "title" | "category" | "cadence" | "windowStartAt" | "windowEndAt" | "reminderAt" | "owner" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  title: string;
  category: HabitCategory;
  cadence: Habit["cadence"];
  windowStartAt: string;
  windowEndAt: string;
  reminderAt: string;
  owner: string;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  habitId: string;
  kind: "DUE_SOON" | "MISSED_WINDOW" | "DUPLICATE_CHECKIN" | "STREAK_BROKEN" | "OVERLOADED_WINDOW";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  habitId: string;
  channel: "PUSH" | "EMAIL";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "ROUTINE_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function habitEventKey(input: Pick<HabitEventInput, "habitId" | "eventId">) {
  if (!input.habitId || !input.eventId) throw new Error("habitId and eventId are required");
  return `${input.habitId}:${input.eventId}`;
}

export function windowKey(value: string | number | Date) {
  return iso(value).slice(0, 10);
}

export class RoutineHabitCoordinator {
  habits: Habit[] = [];
  logs: HabitLog[] = [];
  events: HabitEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.habits = [
      this.habit("habit-water", "Drink water", "HEALTH", "DAILY", addMinutes(-60, now), addMinutes(23 * 60, now), addMinutes(60, now), "Ava", 8, 14, "SCHEDULED", null, addMinutes(-2 * 24 * 60, now)),
      this.habit("habit-walk", "Morning walk", "FITNESS", "DAILY", addMinutes(-3 * 60, now), addMinutes(-60, now), addMinutes(-150, now), "Ava", 12, 20, "SCHEDULED", addMinutes(-25 * 60, now), addMinutes(-26 * 60, now)),
      this.habit("habit-read", "Read 20 minutes", "LEARNING", "DAILY", addMinutes(4 * 60, now), addMinutes(7 * 60, now), addMinutes(4 * 60, now), "Ava", 5, 9, "SCHEDULED", null, addMinutes(-3 * 24 * 60, now)),
      this.habit("habit-dishes", "Reset kitchen", "HOME", "DAILY", addMinutes(5 * 60, now), addMinutes(6 * 60, now), addMinutes(5 * 60, now), "Noah", 3, 6, "SCHEDULED", null, addMinutes(-2 * 24 * 60, now)),
      this.habit("habit-journal", "Evening journal", "EVENING", "DAILY", addMinutes(5 * 60 + 15, now), addMinutes(6 * 60 + 15, now), addMinutes(5 * 60 + 15, now), "Noah", 10, 18, "SCHEDULED", null, addMinutes(-8 * 24 * 60, now)),
      this.habit("habit-vitamins", "Take vitamins", "HEALTH", "DAILY", addMinutes(-2 * 60, now), addMinutes(4 * 60, now), addMinutes(-90, now), "Ava", 21, 28, "SCHEDULED", null, addMinutes(-90, now))
    ];
    this.logs = [
      this.log("log-walk-yesterday", "habit-walk", "CHECKED_IN", addMinutes(-25 * 60, now), null)
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanRoutines(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { habits: this.habits.length, alerts: this.alerts.length });
  }

  habit(idValue: string, title: string, category: HabitCategory, cadence: Habit["cadence"], windowStartAt: string, windowEndAt: string, reminderAt: string, owner: string, streak: number, longestStreak: number, status: HabitStatus, lastCheckInAt: string | null, updatedAt: string): Habit {
    return { id: idValue, title, category, cadence, windowStartAt: iso(windowStartAt), windowEndAt: iso(windowEndAt), reminderAt: iso(reminderAt), owner, streak, longestStreak, status, lastCheckInAt: lastCheckInAt ? iso(lastCheckInAt) : null, updatedAt: iso(updatedAt), archived: false };
  }

  log(idValue: string, habitId: string, type: HabitLog["type"], occurredAt: string, duplicateOf: string | null): HabitLog {
    return { id: idValue, habitId, type, occurredAt: iso(occurredAt), windowKey: windowKey(occurredAt), duplicateOf };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  habitById(habitId: string) {
    const habit = this.habits.find((candidate) => candidate.id === habitId);
    if (!habit) throw new Error("habit not found");
    return habit;
  }

  ingest(input: HabitEventInput) {
    const habit = this.habitById(input.habitId);
    const eventKey = habitEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    const event: HabitEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      habitId: input.habitId,
      type: input.type,
      occurredAt,
      title: input.title || habit.title,
      category: input.category || habit.category,
      cadence: input.cadence || habit.cadence,
      windowStartAt: input.windowStartAt ? iso(input.windowStartAt) : habit.windowStartAt,
      windowEndAt: input.windowEndAt ? iso(input.windowEndAt) : habit.windowEndAt,
      reminderAt: input.reminderAt ? iso(input.reminderAt) : habit.reminderAt,
      owner: input.owner || habit.owner,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(habit.updatedAt).getTime() && ["HABIT_UPDATED", "WINDOW_MOVED", "HABIT_ARCHIVED"].includes(event.type);
    if (!staleUpdate && ["HABIT_CREATED", "HABIT_UPDATED", "WINDOW_MOVED"].includes(event.type)) {
      habit.title = event.title;
      habit.category = event.category;
      habit.cadence = event.cadence;
      habit.windowStartAt = event.windowStartAt;
      habit.windowEndAt = event.windowEndAt;
      habit.reminderAt = event.reminderAt;
      habit.owner = event.owner;
      habit.updatedAt = occurredAt;
      habit.status = "SCHEDULED";
    }
    if (!staleUpdate && event.type === "HABIT_ARCHIVED") {
      habit.archived = true;
      habit.updatedAt = occurredAt;
    }
    if (event.type === "CHECKED_IN") this.checkIn(habit, occurredAt);
    if (event.type === "SKIPPED") this.skip(habit, occurredAt);

    this.scanRoutines(occurredAt);
    this.createAudit(staleUpdate ? "STALE_HABIT_EVENT_IGNORED" : "HABIT_EVENT_INGESTED", { eventId: event.id, habitId: habit.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  checkIn(habit: Habit, occurredAt: string) {
    const key = windowKey(occurredAt);
    const existing = this.logs.find((log) => log.habitId === habit.id && log.windowKey === key && log.type === "CHECKED_IN");
    const log = this.log(id("log"), habit.id, "CHECKED_IN", occurredAt, existing?.id || null);
    this.logs.unshift(log);
    if (existing) this.ensureAlert(habit, "DUPLICATE_CHECKIN", `duplicate:${habit.id}:${key}`);
    else {
      habit.streak += 1;
      habit.longestStreak = Math.max(habit.longestStreak, habit.streak);
      habit.lastCheckInAt = occurredAt;
      habit.status = "DONE";
      habit.updatedAt = occurredAt;
    }
    return log;
  }

  skip(habit: Habit, occurredAt: string) {
    const previous = habit.streak;
    this.logs.unshift(this.log(id("log"), habit.id, "SKIPPED", occurredAt, null));
    habit.streak = 0;
    habit.status = "SKIPPED";
    habit.updatedAt = occurredAt;
    if (previous > 0) this.ensureAlert(habit, "STREAK_BROKEN", `streak:${habit.id}:${windowKey(occurredAt)}`);
  }

  scanRoutines(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    const windowBuckets = new Map<string, Habit[]>();
    for (const habit of this.habits) {
      if (habit.archived || habit.status === "DONE" || habit.status === "SKIPPED") continue;
      const bucketKey = `${habit.owner}:${iso(habit.windowStartAt).slice(0, 13)}`;
      windowBuckets.set(bucketKey, [...(windowBuckets.get(bucketKey) || []), habit]);

      const minutesUntilReminder = (new Date(habit.reminderAt).getTime() - now) / 60_000;
      if (minutesUntilReminder <= 60 && minutesUntilReminder >= -30) {
        habit.status = habit.status === "OVERLOADED" ? "OVERLOADED" : "DUE_SOON";
        this.ensureAlert(habit, "DUE_SOON", `due:${habit.id}:${windowKey(asOf)}`);
        this.ensureReminder(habit, "DUE_SOON", habit.reminderAt);
      }
      if (new Date(habit.windowEndAt).getTime() < now) {
        const previous = habit.streak;
        habit.status = "MISSED";
        habit.streak = 0;
        this.ensureAlert(habit, "MISSED_WINDOW", `missed:${habit.id}:${windowKey(asOf)}`);
        if (previous > 0) this.ensureAlert(habit, "STREAK_BROKEN", `streak:${habit.id}:${windowKey(asOf)}`);
      }
    }
    for (const habits of windowBuckets.values()) {
      if (habits.length < 2) continue;
      for (const habit of habits) {
        if (habit.status !== "MISSED") habit.status = "OVERLOADED";
        this.ensureAlert(habit, "OVERLOADED_WINDOW", `overload:${habit.owner}:${iso(habit.windowStartAt).slice(0, 13)}`);
      }
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  ensureAlert(habit: Habit, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), habitId: habit.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(habit: Habit, kind: Alert["kind"], scheduledFor: string) {
    const dedupeKey = `reminder:${habit.id}:${kind}:${windowKey(scheduledFor)}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), habitId: habit.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
      this.reminders.unshift(reminder);
    }
    return reminder;
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  dispatchReminders() { let sent = 0; for (const reminder of this.reminders.filter((candidate) => candidate.status === "QUEUED")) { reminder.status = "SENT"; reminder.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated habit reminder provider timeout"; return { processed: true, job }; }
    if (job.kind === "ROUTINE_SCAN") this.scanRoutines();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { habits: [...this.habits].sort((a, b) => a.windowStartAt.localeCompare(b.windowStartAt)), logs: this.logs, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { active: this.habits.filter((habit) => !habit.archived).length, dueSoon: this.habits.filter((habit) => habit.status === "DUE_SOON").length, missed: this.habits.filter((habit) => habit.status === "MISSED").length, done: this.habits.filter((habit) => habit.status === "DONE").length, bestStreak: Math.max(...this.habits.map((habit) => habit.longestStreak), 0), queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { habits: this.habits, logs: this.logs, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.habits = state.habits as Habit[]; this.logs = state.logs as HabitLog[]; this.events = state.events as HabitEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededCoordinator(now: Date = new Date()) { const coordinator = new RoutineHabitCoordinator(); coordinator.seed(now); return coordinator; }
