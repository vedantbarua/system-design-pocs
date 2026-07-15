import crypto from "node:crypto";

export type MoveArea = "TIMELINE" | "PACKING" | "ADDRESS_CHANGE" | "UTILITY" | "MOVER" | "INSPECTION" | "KEYS" | "CLAIM";
export type MoveStatus = "PLANNED" | "DUE_SOON" | "DONE" | "OVERDUE" | "BLOCKED" | "BOOKED" | "PACKED" | "CONFIRMED" | "DUPLICATE" | "CANCELLED";
export type MoveEventType = "TASK_CREATED" | "TASK_UPDATED" | "TASK_COMPLETED" | "BOX_PACKED" | "ADDRESS_UPDATED" | "UTILITY_SCHEDULED" | "MOVER_BOOKED" | "VENDOR_UPDATED" | "ISSUE_REPORTED" | "ISSUE_RESOLVED" | "DEADLINE_SCAN" | "TASK_CANCELLED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type MoveTask = {
  id: string;
  title: string;
  area: MoveArea;
  owner: string;
  dueAt: string;
  status: MoveStatus;
  priority: "LOW" | "MEDIUM" | "HIGH";
  fingerprint: string;
  relatedRef: string | null;
  updatedAt: string;
  notes: string;
};

export type Box = {
  id: string;
  room: string;
  label: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  fragile: boolean;
  packed: boolean;
  essentials: boolean;
  updatedAt: string;
};

export type Vendor = {
  id: string;
  name: string;
  kind: "MOVER" | "TRUCK" | "CLEANER" | "STORAGE" | "UTILITY";
  arrivalWindow: string;
  deposit: number;
  status: "QUOTE" | "BOOKED" | "CONFIRMED" | "CANCELLED";
  updatedAt: string;
};

export type MoveEventInput = {
  eventId: string;
  taskId: string;
  type: MoveEventType;
  occurredAt?: string;
  title?: string;
  area?: MoveArea;
  owner?: string;
  dueAt?: string;
  status?: MoveStatus;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  relatedRef?: string | null;
  notes?: string;
  room?: string;
  boxLabel?: string;
  fragile?: boolean;
  essentials?: boolean;
  vendorName?: string;
  vendorKind?: Vendor["kind"];
  arrivalWindow?: string;
  deposit?: number;
  source?: string;
};

export type MoveEvent = Required<Omit<MoveEventInput, "occurredAt" | "title" | "area" | "owner" | "dueAt" | "status" | "priority" | "relatedRef" | "notes" | "room" | "boxLabel" | "fragile" | "essentials" | "vendorName" | "vendorKind" | "arrivalWindow" | "deposit" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  title: string;
  area: MoveArea;
  owner: string;
  dueAt: string;
  status: MoveStatus;
  priority: "LOW" | "MEDIUM" | "HIGH";
  fingerprint: string;
  relatedRef: string | null;
  notes: string;
  room: string;
  boxLabel: string;
  fragile: boolean;
  essentials: boolean;
  vendorName: string;
  vendorKind: Vendor["kind"];
  arrivalWindow: string;
  deposit: number;
  source: string;
};

export type Alert = {
  id: string;
  taskId: string;
  kind: "DEADLINE_DUE" | "MOVE_DAY_SOON" | "MISSING_ESSENTIALS" | "UNPACKED_PRIORITY" | "DUPLICATE_TASK" | "VENDOR_UNCONFIRMED" | "ISSUE_OPEN";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "MOVE_SCAN" | "REMINDER_DISPATCH" | "VENDOR_RECHECK" | "RETENTION";
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

export function moveEventKey(input: Pick<MoveEventInput, "taskId" | "eventId">) {
  if (!input.taskId || !input.eventId) throw new Error("taskId and eventId are required");
  return `${input.taskId}:${input.eventId}`;
}

export function moveTaskFingerprint(area: MoveArea, title: string, owner: string) {
  return `${area}:${title.trim().toLowerCase().replace(/\s+/g, " ")}:${owner.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export class MovingCoordinator {
  tasks: MoveTask[] = [];
  boxes: Box[] = [];
  vendors: Vendor[] = [];
  events: MoveEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.tasks = [
      this.task("task-movers", "Confirm movers", "MOVER", "Ava", addMinutes(3 * 24 * 60, now), "BOOKED", "HIGH", "vendor-movers", addMinutes(-10 * 24 * 60, now), "Deposit paid; call to confirm arrival window."),
      this.task("task-mail", "Set mail forwarding", "ADDRESS_CHANGE", "Noah", addMinutes(2 * 24 * 60, now), "PLANNED", "HIGH", "usps", addMinutes(-7 * 24 * 60, now), "Forward mail to new apartment."),
      this.task("task-power", "Start electricity at new place", "UTILITY", "Ava", addMinutes(1 * 24 * 60, now), "PLANNED", "HIGH", "utility-electric", addMinutes(-6 * 24 * 60, now), "Needs account confirmation."),
      this.task("task-internet", "Schedule internet install", "UTILITY", "Noah", addMinutes(5 * 24 * 60, now), "CONFIRMED", "MEDIUM", "utility-internet", addMinutes(-2 * 24 * 60, now), "Install window booked."),
      this.task("task-keys", "Key handoff", "KEYS", "Ava", addMinutes(4 * 24 * 60, now), "PLANNED", "HIGH", "leasing-office", addMinutes(-4 * 24 * 60, now), "Bring ID and cashier receipt."),
      this.task("task-inspection", "Move-out inspection photos", "INSPECTION", "Noah", addMinutes(-1 * 24 * 60, now), "PLANNED", "HIGH", "old-unit", addMinutes(-8 * 24 * 60, now), "Take wall and appliance photos."),
      this.task("task-pack-kitchen", "Pack kitchen essentials", "PACKING", "Ava", addMinutes(12 * 60, now), "PLANNED", "HIGH", "box-kitchen-essentials", addMinutes(-2 * 24 * 60, now), "Keep first-night items accessible.")
    ];
    this.boxes = [
      this.box("box-kitchen-essentials", "Kitchen", "Kitchen essentials", "HIGH", true, false, true, addMinutes(-2 * 24 * 60, now)),
      this.box("box-bedding", "Bedroom", "Bedding first night", "HIGH", false, true, true, addMinutes(-1 * 24 * 60, now)),
      this.box("box-books", "Living room", "Books", "LOW", false, true, false, addMinutes(-5 * 24 * 60, now)),
      this.box("box-dishes", "Kitchen", "Dishes", "MEDIUM", true, false, false, addMinutes(-3 * 24 * 60, now))
    ];
    this.vendors = [
      { id: "vendor-movers", name: "CityLine Movers", kind: "MOVER", arrivalWindow: addMinutes(3 * 24 * 60, now), deposit: 300, status: "BOOKED", updatedAt: addMinutes(-10 * 24 * 60, now) },
      { id: "vendor-cleaner", name: "Spark Clean", kind: "CLEANER", arrivalWindow: addMinutes(6 * 24 * 60, now), deposit: 75, status: "QUOTE", updatedAt: addMinutes(-4 * 24 * 60, now) }
    ];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanMove(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { tasks: this.tasks.length, boxes: this.boxes.length, vendors: this.vendors.length, alerts: this.alerts.length });
  }

  task(idValue: string, title: string, area: MoveArea, owner: string, dueAt: string, status: MoveStatus, priority: "LOW" | "MEDIUM" | "HIGH", relatedRef: string | null, updatedAt: string, notes: string): MoveTask {
    return { id: idValue, title, area, owner, dueAt: iso(dueAt), status, priority, fingerprint: moveTaskFingerprint(area, title, owner), relatedRef, updatedAt: iso(updatedAt), notes };
  }

  box(idValue: string, room: string, label: string, priority: "LOW" | "MEDIUM" | "HIGH", fragile: boolean, packed: boolean, essentials: boolean, updatedAt: string): Box {
    return { id: idValue, room, label, priority, fragile, packed, essentials, updatedAt: iso(updatedAt) };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  taskById(taskId: string) {
    const task = this.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error("move task not found");
    return task;
  }

  ingest(input: MoveEventInput) {
    let task = this.tasks.find((candidate) => candidate.id === input.taskId);
    const eventKey = moveEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!task && input.type !== "TASK_CREATED" && input.type !== "BOX_PACKED" && input.type !== "ADDRESS_UPDATED" && input.type !== "MOVER_BOOKED") throw new Error("move task not found");
    if (!task) {
      const area = input.area || (input.type === "BOX_PACKED" ? "PACKING" : input.type === "ADDRESS_UPDATED" ? "ADDRESS_CHANGE" : input.type === "MOVER_BOOKED" ? "MOVER" : "TIMELINE");
      task = this.task(input.taskId, input.title || "New move task", area, input.owner || "Ava", input.dueAt || addMinutes(7 * 24 * 60, occurredAt), input.status || "PLANNED", input.priority || "MEDIUM", input.relatedRef === undefined ? null : input.relatedRef, occurredAt, input.notes || "");
      this.tasks.push(task);
    }

    const event: MoveEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      taskId: input.taskId,
      type: input.type,
      occurredAt,
      title: input.title || task.title,
      area: input.area || task.area,
      owner: input.owner || task.owner,
      dueAt: input.dueAt ? iso(input.dueAt) : task.dueAt,
      status: input.status || task.status,
      priority: input.priority || task.priority,
      fingerprint: moveTaskFingerprint(input.area || task.area, input.title || task.title, input.owner || task.owner),
      relatedRef: input.relatedRef === undefined ? task.relatedRef : input.relatedRef,
      notes: input.notes || "",
      room: input.room || "",
      boxLabel: input.boxLabel || "",
      fragile: input.fragile || false,
      essentials: input.essentials || false,
      vendorName: input.vendorName || "",
      vendorKind: input.vendorKind || "MOVER",
      arrivalWindow: input.arrivalWindow ? iso(input.arrivalWindow) : task.dueAt,
      deposit: input.deposit || 0,
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(task.updatedAt).getTime() && event.type !== "DEADLINE_SCAN";
    if (!staleUpdate) {
      if (event.type === "TASK_CREATED" || event.type === "TASK_UPDATED") this.applyEventToTask(task, event, event.status);
      if (event.type === "TASK_COMPLETED" || event.type === "ADDRESS_UPDATED" || event.type === "UTILITY_SCHEDULED") this.applyEventToTask(task, event, "DONE");
      if (event.type === "BOX_PACKED") { this.applyEventToTask(task, event, "PACKED"); this.packBox(event); }
      if (event.type === "MOVER_BOOKED") { this.applyEventToTask(task, event, "BOOKED"); this.bookVendor(event); }
      if (event.type === "VENDOR_UPDATED") { this.bookVendor(event); task.status = event.status; task.updatedAt = occurredAt; }
      if (event.type === "ISSUE_REPORTED") this.applyEventToTask(task, event, "BLOCKED");
      if (event.type === "ISSUE_RESOLVED") this.applyEventToTask(task, event, "DONE");
      if (event.type === "TASK_CANCELLED") this.applyEventToTask(task, event, "CANCELLED");
    }

    this.detectDuplicateTask(task);
    this.scanMove(occurredAt);
    this.createAudit(staleUpdate ? "STALE_MOVE_EVENT_IGNORED" : "MOVE_EVENT_INGESTED", { eventId: event.id, taskId: task.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyEventToTask(task: MoveTask, event: MoveEvent, status: MoveStatus) {
    task.title = event.title;
    task.area = event.area;
    task.owner = event.owner;
    task.dueAt = event.dueAt;
    task.status = status;
    task.priority = event.priority;
    task.fingerprint = event.fingerprint;
    task.relatedRef = event.relatedRef;
    task.updatedAt = event.occurredAt;
    task.notes = event.notes || task.notes;
  }

  packBox(event: MoveEvent) {
    const boxId = event.relatedRef || `box-${event.taskId}`;
    let box = this.boxes.find((candidate) => candidate.id === boxId);
    if (!box) {
      box = this.box(boxId, event.room || "Unsorted", event.boxLabel || event.title, event.priority, event.fragile, true, event.essentials, event.occurredAt);
      this.boxes.unshift(box);
    }
    box.room = event.room || box.room;
    box.label = event.boxLabel || box.label;
    box.priority = event.priority;
    box.fragile = event.fragile;
    box.essentials = event.essentials;
    box.packed = true;
    box.updatedAt = event.occurredAt;
    return box;
  }

  bookVendor(event: MoveEvent) {
    const vendorId = event.relatedRef || `vendor-${event.taskId}`;
    let vendor = this.vendors.find((candidate) => candidate.id === vendorId);
    if (!vendor) {
      vendor = { id: vendorId, name: event.vendorName || event.title, kind: event.vendorKind, arrivalWindow: event.arrivalWindow, deposit: event.deposit, status: "BOOKED", updatedAt: event.occurredAt };
      this.vendors.unshift(vendor);
    }
    vendor.name = event.vendorName || vendor.name;
    vendor.kind = event.vendorKind;
    vendor.arrivalWindow = event.arrivalWindow;
    vendor.deposit = event.deposit || vendor.deposit;
    vendor.status = event.status === "CONFIRMED" ? "CONFIRMED" : event.status === "CANCELLED" ? "CANCELLED" : "BOOKED";
    vendor.updatedAt = event.occurredAt;
    return vendor;
  }

  detectDuplicateTask(task: MoveTask) {
    const duplicateOf = this.tasks.find((candidate) => candidate.id !== task.id && candidate.fingerprint === task.fingerprint && candidate.status !== "CANCELLED");
    if (!duplicateOf) return null;
    task.status = "DUPLICATE";
    this.ensureAlert(task, "DUPLICATE_TASK", `duplicate:${task.fingerprint}`);
    this.createAudit("DUPLICATE_MOVE_TASK_DETECTED", { taskId: task.id, duplicateOf: duplicateOf.id });
    return duplicateOf;
  }

  scanMove(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const task of this.tasks) {
      if (["DONE", "PACKED", "CANCELLED", "DUPLICATE"].includes(task.status)) continue;
      const dueInMinutes = (new Date(task.dueAt).getTime() - now) / 60_000;
      if (dueInMinutes <= 0 && ["PLANNED", "DUE_SOON", "BOOKED", "CONFIRMED"].includes(task.status)) {
        task.status = "OVERDUE";
        this.ensureAlert(task, "DEADLINE_DUE", `deadline:${task.id}:${task.dueAt.slice(0, 10)}`);
      } else if (dueInMinutes <= 7 * 24 * 60) {
        if (task.status === "PLANNED") task.status = "DUE_SOON";
        this.ensureAlert(task, task.area === "TIMELINE" ? "MOVE_DAY_SOON" : "DEADLINE_DUE", `deadline:${task.id}:${task.dueAt.slice(0, 10)}`);
      }
      if (task.status === "BLOCKED") this.ensureAlert(task, "ISSUE_OPEN", `issue:${task.id}`);
    }
    for (const box of this.boxes) {
      if (box.essentials && !box.packed) this.ensureAlertForRef("MISSING_ESSENTIALS", box.id, `essentials:${box.id}`);
      if (box.priority === "HIGH" && !box.packed) this.ensureAlertForRef("UNPACKED_PRIORITY", box.id, `unpacked:${box.id}`);
    }
    for (const vendor of this.vendors) {
      const arrivalMinutes = (new Date(vendor.arrivalWindow).getTime() - now) / 60_000;
      if (vendor.status === "BOOKED" && arrivalMinutes <= 5 * 24 * 60) this.ensureAlertForRef("VENDOR_UNCONFIRMED", vendor.id, `vendor:${vendor.id}:${vendor.arrivalWindow.slice(0, 10)}`);
    }
    return { alerts: this.alerts.length };
  }

  ensureAlert(task: MoveTask, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), taskId: task.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureAlertForRef(kind: Alert["kind"], relatedRef: string, dedupeKey: string) {
    const task = this.tasks.find((candidate) => candidate.relatedRef === relatedRef) || this.tasks[0];
    return this.ensureAlert(task, kind, dedupeKey);
  }

  confirmVendors() {
    let confirmed = 0;
    for (const vendor of this.vendors.filter((candidate) => candidate.status === "BOOKED")) {
      vendor.status = "CONFIRMED";
      vendor.updatedAt = iso();
      const task = this.tasks.find((candidate) => candidate.relatedRef === vendor.id);
      if (task) task.status = "CONFIRMED";
      confirmed += 1;
    }
    return confirmed;
  }

  moveScore() {
    if (this.tasks.length === 0) return 100;
    const ready = this.tasks.filter((task) => ["DONE", "PACKED", "CONFIRMED"].includes(task.status)).length;
    return Math.round((ready / this.tasks.length) * 100);
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated mover reminder provider timeout"; return { processed: true, job }; }
    if (job.kind === "MOVE_SCAN") this.scanMove();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchAlerts();
    if (job.kind === "VENDOR_RECHECK") this.confirmVendors();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { tasks: [...this.tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt)), boxes: this.boxes, vendors: this.vendors, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, metrics: { score: this.moveScore(), total: this.tasks.length, dueSoon: this.tasks.filter((task) => task.status === "DUE_SOON").length, overdue: this.tasks.filter((task) => task.status === "OVERDUE").length, done: this.tasks.filter((task) => task.status === "DONE").length, packed: this.boxes.filter((box) => box.packed).length, unpacked: this.boxes.filter((box) => !box.packed).length, vendors: this.vendors.filter((vendor) => vendor.status === "BOOKED" || vendor.status === "CONFIRMED").length, blocked: this.tasks.filter((task) => task.status === "BLOCKED").length, duplicates: this.tasks.filter((task) => task.status === "DUPLICATE").length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { tasks: this.tasks, boxes: this.boxes, vendors: this.vendors, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.tasks = state.tasks as MoveTask[]; this.boxes = state.boxes as Box[] || []; this.vendors = state.vendors as Vendor[] || []; this.events = state.events as MoveEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededMove(now: Date = new Date()) { const move = new MovingCoordinator(); move.seed(now); return move; }
