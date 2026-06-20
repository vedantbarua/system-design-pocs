import crypto from "node:crypto";

export type TaskStatus = "OPEN" | "CLAIMED" | "OVERDUE" | "COMPLETED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";
export type EventSource = "seed" | "api" | "kafka" | "offline";
export type ReminderStatus = "QUEUED" | "SENT";

export type Member = {
  id: string;
  name: string;
  initials: string;
  color: string;
  active: boolean;
};

export type ChoreDefinition = {
  id: string;
  name: string;
  area: string;
  recurrenceDays: number;
  effortPoints: number;
  anchorAt: string;
  active: boolean;
  eligibleMemberIds: string[];
};

export type ClaimLease = {
  id: string;
  holderId: string;
  fencingToken: number;
  acquiredAt: string;
  expiresAt: string;
};

export type TaskInstance = {
  id: string;
  choreId: string;
  occurrenceKey: string;
  dueAt: string;
  assignedTo: string;
  status: TaskStatus;
  claim: ClaimLease | null;
  completedAt: string | null;
  completedBy: string | null;
  completionEventId: string | null;
  escalationLevel: number;
  createdAt: string;
};

export type CompletionEvent = {
  id: string;
  eventId: string;
  eventKey: string;
  taskId: string;
  memberId: string;
  fencingToken: number | null;
  source: EventSource;
  completedAt: string;
};

export type Reminder = {
  id: string;
  taskId: string;
  memberId: string;
  kind: "DUE_SOON" | "OVERDUE" | "ESCALATED";
  status: ReminderStatus;
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type ChoreJob = {
  id: string;
  kind: "MATERIALIZE_OCCURRENCES" | "OVERDUE_SCAN" | "REMINDER_DISPATCH" | "WORKLOAD_REBUILD";
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  dedupeKey: string;
  payload: Record<string, string | number>;
  queuedAt: string;
  completedAt: string | null;
  lastError: string | null;
};

export type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  at: string;
};

export type CompletionInput = {
  eventId: string;
  taskId: string;
  memberId: string;
  fencingToken?: number | null;
  source?: EventSource;
  completedAt?: string;
};

export function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function iso(value: string | number | Date = new Date()): string {
  const parsed = new Date(value);
  assertCondition(!Number.isNaN(parsed.getTime()), "invalid timestamp");
  return parsed.toISOString();
}

export function addHours(hours: number, from: string | number | Date = new Date()): string {
  return new Date(new Date(from).getTime() + hours * 3_600_000).toISOString();
}

export function addDays(days: number, from: string | number | Date = new Date()): string {
  return addHours(days * 24, from);
}

export function completionEventKey(input: Pick<CompletionInput, "taskId" | "eventId">): string {
  assertCondition(input.taskId, "taskId is required");
  assertCondition(input.eventId, "eventId is required");
  return `${input.taskId}:${input.eventId}`;
}

export class HouseholdChoreCoordinator {
  members: Member[] = [];
  definitions: ChoreDefinition[] = [];
  tasks: TaskInstance[] = [];
  completions: CompletionEvent[] = [];
  reminders: Reminder[] = [];
  jobs: ChoreJob[] = [];
  audit: AuditEvent[] = [];
  processedEvents = new Set<string>();
  nextFencingToken = 1;
  failNextJob = false;

  seed(now: Date = new Date()): void {
    this.members = [
      { id: "member-vedant", name: "Vedant", initials: "VB", color: "#3f755f", active: true },
      { id: "member-maya", name: "Maya", initials: "MS", color: "#3f6f8d", active: true },
      { id: "member-alex", name: "Alex", initials: "AK", color: "#a15b62", active: true }
    ];
    this.definitions = [
      { id: "chore-dishes", name: "Empty dishwasher", area: "Kitchen", recurrenceDays: 1, effortPoints: 2, anchorAt: addHours(-3, now), active: true, eligibleMemberIds: [] },
      { id: "chore-counters", name: "Wipe kitchen surfaces", area: "Kitchen", recurrenceDays: 1, effortPoints: 1, anchorAt: addHours(5, now), active: true, eligibleMemberIds: [] },
      { id: "chore-trash", name: "Take bins to curb", area: "Outside", recurrenceDays: 7, effortPoints: 2, anchorAt: addHours(-25, now), active: true, eligibleMemberIds: [] },
      { id: "chore-bathroom", name: "Clean bathroom", area: "Bathroom", recurrenceDays: 7, effortPoints: 4, anchorAt: addHours(26, now), active: true, eligibleMemberIds: [] },
      { id: "chore-laundry", name: "Wash shared linens", area: "Laundry", recurrenceDays: 14, effortPoints: 3, anchorAt: addHours(74, now), active: true, eligibleMemberIds: [] }
    ];
    this.tasks = [];
    this.completions = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processedEvents = new Set();
    this.nextFencingToken = 1;
    this.failNextJob = false;
    this.materializeOccurrences(8, now);
    const dishes = this.tasks.find((task) => task.choreId === "chore-dishes" && new Date(task.dueAt).getTime() <= now.getTime());
    if (dishes) {
      const lease = this.claimTask(dishes.id, dishes.assignedTo, 15, now);
      this.completeTask({ eventId: "seed-completion", taskId: dishes.id, memberId: dishes.assignedTo, fencingToken: lease.fencingToken, source: "seed", completedAt: iso(now) });
    }
    this.scanOverdue(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", "system", { members: this.members.length, routines: this.definitions.length, tasks: this.tasks.length });
  }

  createAudit(action: string, actor: string, details: Record<string, unknown>): AuditEvent {
    const event = { id: id("audit"), action, actor, details, at: iso() };
    this.audit.unshift(event);
    return event;
  }

  findMember(memberId: string): Member {
    const member = this.members.find((item) => item.id === memberId && item.active);
    assertCondition(member, "member not found");
    return member;
  }

  findTask(taskId: string): TaskInstance {
    const task = this.tasks.find((item) => item.id === taskId);
    assertCondition(task, "task not found");
    return task;
  }

  findDefinition(choreId: string): ChoreDefinition {
    const definition = this.definitions.find((item) => item.id === choreId);
    assertCondition(definition, "chore definition not found");
    return definition;
  }

  addDefinition(input: { name: string; area: string; recurrenceDays: number; effortPoints: number; anchorAt?: string; eligibleMemberIds?: string[] }): ChoreDefinition {
    assertCondition(input.name?.trim(), "name is required");
    assertCondition(Number.isInteger(input.recurrenceDays) && input.recurrenceDays > 0, "recurrenceDays must be a positive integer");
    assertCondition(Number.isInteger(input.effortPoints) && input.effortPoints > 0, "effortPoints must be a positive integer");
    for (const memberId of input.eligibleMemberIds || []) this.findMember(memberId);
    const definition: ChoreDefinition = {
      id: id("chore"), name: input.name.trim(), area: input.area?.trim() || "General",
      recurrenceDays: input.recurrenceDays, effortPoints: input.effortPoints,
      anchorAt: iso(input.anchorAt || addHours(24)), active: true,
      eligibleMemberIds: input.eligibleMemberIds || []
    };
    this.definitions.push(definition);
    this.createAudit("ROUTINE_CREATED", "schedule-api", { choreId: definition.id, recurrenceDays: definition.recurrenceDays });
    return definition;
  }

  workloadPoints(memberId: string): number {
    return this.tasks.reduce((total, task) => {
      if (task.assignedTo !== memberId || task.status === "COMPLETED") return total;
      return total + this.findDefinition(task.choreId).effortPoints;
    }, 0);
  }

  chooseAssignee(definition: ChoreDefinition): string {
    const eligible = (definition.eligibleMemberIds.length ? definition.eligibleMemberIds.map((memberId) => this.findMember(memberId)) : this.members.filter((member) => member.active));
    assertCondition(eligible.length > 0, "no eligible members");
    return [...eligible].sort((left, right) => this.workloadPoints(left.id) - this.workloadPoints(right.id) || left.id.localeCompare(right.id))[0].id;
  }

  materializeOccurrences(horizonDays = 7, asOf: string | Date = new Date()): { created: number; existing: number } {
    assertCondition(horizonDays >= 0 && horizonDays <= 60, "horizonDays must be between 0 and 60");
    const now = new Date(asOf);
    const windowStart = now.getTime() - 48 * 3_600_000;
    const windowEnd = now.getTime() + horizonDays * 86_400_000;
    let created = 0;
    let existing = 0;
    for (const definition of this.definitions.filter((item) => item.active)) {
      let due = new Date(definition.anchorAt).getTime();
      const interval = definition.recurrenceDays * 86_400_000;
      while (due < windowStart) due += interval;
      while (due <= windowEnd) {
        const dueAt = iso(due);
        const occurrenceKey = `${definition.id}:${dueAt}`;
        if (this.tasks.some((task) => task.occurrenceKey === occurrenceKey)) existing += 1;
        else {
          this.tasks.push({
            id: id("task"), choreId: definition.id, occurrenceKey, dueAt,
            assignedTo: this.chooseAssignee(definition), status: "OPEN", claim: null,
            completedAt: null, completedBy: null, completionEventId: null,
            escalationLevel: 0, createdAt: iso(now)
          });
          created += 1;
        }
        due += interval;
      }
    }
    this.tasks.sort((left, right) => left.dueAt.localeCompare(right.dueAt));
    this.createAudit("OCCURRENCES_MATERIALIZED", "worker:scheduler", { horizonDays, created, existing });
    return { created, existing };
  }

  claimTask(taskId: string, memberId: string, ttlMinutes = 15, now: string | Date = new Date()): ClaimLease {
    this.findMember(memberId);
    const task = this.findTask(taskId);
    assertCondition(task.status !== "COMPLETED", "task is already completed");
    assertCondition(ttlMinutes > 0 && ttlMinutes <= 120, "ttlMinutes must be between 1 and 120");
    const nowIso = iso(now);
    if (task.claim && task.claim.expiresAt > nowIso) {
      if (task.claim.holderId === memberId) return task.claim;
      throw new Error("task is claimed by another member");
    }
    const lease: ClaimLease = {
      id: id("claim"), holderId: memberId, fencingToken: this.nextFencingToken++,
      acquiredAt: nowIso, expiresAt: addHours(ttlMinutes / 60, nowIso)
    };
    task.claim = lease;
    if (task.status !== "OVERDUE") task.status = "CLAIMED";
    this.createAudit("TASK_CLAIMED", memberId, { taskId, fencingToken: lease.fencingToken, expiresAt: lease.expiresAt });
    return lease;
  }

  releaseClaim(taskId: string, memberId: string, fencingToken: number): TaskInstance {
    const task = this.findTask(taskId);
    assertCondition(task.claim, "task has no claim");
    assertCondition(task.claim.holderId === memberId && task.claim.fencingToken === fencingToken, "claim token does not match");
    task.claim = null;
    task.status = new Date(task.dueAt).getTime() <= Date.now() ? "OVERDUE" : "OPEN";
    this.createAudit("TASK_RELEASED", memberId, { taskId, fencingToken });
    return task;
  }

  completeTask(input: CompletionInput): { duplicate: boolean; event?: CompletionEvent; task?: TaskInstance } {
    const member = this.findMember(input.memberId);
    const task = this.findTask(input.taskId);
    const key = completionEventKey(input);
    if (this.processedEvents.has(key)) return { duplicate: true, task };
    assertCondition(task.status !== "COMPLETED", "task is already completed");
    if (task.claim) {
      assertCondition(task.claim.holderId === member.id, "task is claimed by another member");
      assertCondition(input.fencingToken === task.claim.fencingToken, "stale fencing token");
    } else {
      assertCondition(task.assignedTo === member.id, "task must be claimed before completion");
    }
    const event: CompletionEvent = {
      id: id("completion"), eventId: input.eventId, eventKey: key, taskId: task.id,
      memberId: member.id, fencingToken: input.fencingToken ?? null,
      source: input.source || "api", completedAt: iso(input.completedAt || new Date())
    };
    task.status = "COMPLETED";
    task.completedAt = event.completedAt;
    task.completedBy = member.id;
    task.completionEventId = event.id;
    task.claim = null;
    this.completions.unshift(event);
    this.processedEvents.add(key);
    this.createAudit("TASK_COMPLETED", member.id, { taskId: task.id, eventId: event.eventId, source: event.source });
    return { duplicate: false, event, task };
  }

  ensureReminder(task: TaskInstance, kind: Reminder["kind"], level: number): Reminder {
    const dedupeKey = `${task.id}:${kind}:${level}`;
    const existing = this.reminders.find((item) => item.dedupeKey === dedupeKey);
    if (existing) return existing;
    const reminder: Reminder = { id: id("reminder"), taskId: task.id, memberId: task.assignedTo, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
    this.reminders.unshift(reminder);
    return reminder;
  }

  scanOverdue(asOf: string | Date = new Date()): { overdue: number; escalated: number; reminders: number } {
    const now = new Date(asOf).getTime();
    let overdue = 0;
    let escalated = 0;
    const before = this.reminders.length;
    for (const task of this.tasks.filter((item) => item.status !== "COMPLETED" && new Date(item.dueAt).getTime() <= now)) {
      const hoursLate = (now - new Date(task.dueAt).getTime()) / 3_600_000;
      const level = hoursLate >= 24 ? 2 : 1;
      task.status = "OVERDUE";
      overdue += 1;
      if (level > task.escalationLevel) {
        task.escalationLevel = level;
        this.ensureReminder(task, level === 1 ? "OVERDUE" : "ESCALATED", level);
        if (level > 1) escalated += 1;
      }
    }
    const reminders = this.reminders.length - before;
    this.createAudit("OVERDUE_SCAN_COMPLETED", "worker:overdue", { overdue, escalated, reminders });
    return { overdue, escalated, reminders };
  }

  dispatchReminders(): number {
    let sent = 0;
    for (const reminder of this.reminders.filter((item) => item.status === "QUEUED")) {
      reminder.status = "SENT";
      reminder.sentAt = iso();
      sent += 1;
    }
    this.createAudit("REMINDERS_DISPATCHED", "worker:notifications", { sent });
    return sent;
  }

  ensureJob(kind: ChoreJob["kind"], dedupeKey: string, payload: ChoreJob["payload"]): ChoreJob {
    const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey);
    if (existing) return existing;
    const job: ChoreJob = { id: id("job"), kind, status: "QUEUED", attempts: 0, maxAttempts: 3, dedupeKey, payload, queuedAt: iso(), completedAt: null, lastError: null };
    this.jobs.unshift(job);
    return job;
  }

  queueJob(kind: ChoreJob["kind"], payload: ChoreJob["payload"] = {}): ChoreJob {
    const bucket = iso().slice(0, 13);
    return this.ensureJob(kind, `${kind}:${bucket}:${JSON.stringify(payload)}`, payload);
  }

  dispatchNextJob(): { processed: boolean; job?: ChoreJob } {
    const job = this.jobs.find((item) => item.status === "QUEUED" || item.status === "RETRY");
    if (!job) return { processed: false };
    job.status = "RUNNING";
    job.attempts += 1;
    if (this.failNextJob) {
      this.failNextJob = false;
      job.status = job.attempts >= job.maxAttempts ? "DEAD" : "RETRY";
      job.lastError = "simulated worker timeout";
      this.createAudit("JOB_RETRY", "worker", { jobId: job.id, attempts: job.attempts });
      return { processed: true, job };
    }
    if (job.kind === "MATERIALIZE_OCCURRENCES") this.materializeOccurrences(Number(job.payload.horizonDays || 14));
    if (job.kind === "OVERDUE_SCAN") this.scanOverdue();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "WORKLOAD_REBUILD") this.createAudit("WORKLOAD_REBUILT", "worker:projection", { members: this.members.length });
    job.status = "COMPLETED";
    job.completedAt = iso();
    job.lastError = null;
    this.createAudit("JOB_COMPLETED", "worker", { jobId: job.id, kind: job.kind });
    return { processed: true, job };
  }

  drainJobs(max = 50): { processed: number; completed: number } {
    let processed = 0;
    let completed = 0;
    while (processed < max) {
      const result = this.dispatchNextJob();
      if (!result.processed || !result.job) break;
      processed += 1;
      if (result.job.status === "COMPLETED") completed += 1;
    }
    return { processed, completed };
  }

  snapshot(): Record<string, unknown> {
    const now = Date.now();
    const nextDay = now + 24 * 3_600_000;
    const workload = this.members.map((member) => {
      const assigned = this.tasks.filter((task) => task.assignedTo === member.id && task.status !== "COMPLETED");
      const completed = this.tasks.filter((task) => task.completedBy === member.id);
      return {
        ...member,
        assignedTasks: assigned.length,
        openPoints: assigned.reduce((sum, task) => sum + this.findDefinition(task.choreId).effortPoints, 0),
        completedTasks: completed.length,
        completedPoints: completed.reduce((sum, task) => sum + this.findDefinition(task.choreId).effortPoints, 0),
        overdueTasks: assigned.filter((task) => task.status === "OVERDUE").length
      };
    });
    return {
      members: this.members,
      definitions: this.definitions,
      tasks: this.tasks,
      completions: this.completions,
      reminders: this.reminders,
      jobs: this.jobs,
      audit: this.audit,
      workload,
      metrics: {
        routines: this.definitions.filter((item) => item.active).length,
        openTasks: this.tasks.filter((task) => task.status !== "COMPLETED").length,
        dueToday: this.tasks.filter((task) => task.status !== "COMPLETED" && new Date(task.dueAt).getTime() > now && new Date(task.dueAt).getTime() <= nextDay).length,
        overdue: this.tasks.filter((task) => task.status === "OVERDUE").length,
        claimed: this.tasks.filter((task) => task.claim && task.claim.expiresAt > iso()).length,
        completed: this.tasks.filter((task) => task.status === "COMPLETED").length,
        queuedReminders: this.reminders.filter((item) => item.status === "QUEUED").length,
        queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length
      }
    };
  }

  exportState(): Record<string, unknown> {
    return { members: this.members, definitions: this.definitions, tasks: this.tasks, completions: this.completions, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processedEvents: [...this.processedEvents], nextFencingToken: this.nextFencingToken };
  }

  importState(state: Record<string, unknown>): void {
    this.members = (state.members as Member[]) || [];
    this.definitions = (state.definitions as ChoreDefinition[]) || [];
    this.tasks = (state.tasks as TaskInstance[]) || [];
    this.completions = (state.completions as CompletionEvent[]) || [];
    this.reminders = (state.reminders as Reminder[]) || [];
    this.jobs = (state.jobs as ChoreJob[]) || [];
    this.audit = (state.audit as AuditEvent[]) || [];
    this.processedEvents = new Set((state.processedEvents as string[]) || []);
    this.nextFencingToken = Number(state.nextFencingToken || 1);
  }
}

export function createSeededCoordinator(now: Date = new Date()): HouseholdChoreCoordinator {
  const coordinator = new HouseholdChoreCoordinator();
  coordinator.seed(now);
  return coordinator;
}
