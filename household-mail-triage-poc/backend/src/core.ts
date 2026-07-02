import crypto from "node:crypto";

export type MailCategory = "BILL" | "NOTICE" | "INSURANCE" | "TAX" | "PERSONAL" | "JUNK";
export type MailAction = "PAY" | "RENEW" | "RESPOND" | "FILE" | "DISCARD" | "REVIEW";
export type MailStatus = "UNREVIEWED" | "ACTION_REQUIRED" | "DONE" | "ARCHIVED" | "STALE";
export type MailEventType = "MAIL_SCANNED" | "CLASSIFIED" | "ACTION_COMPLETED" | "REMINDER_SNOOZED" | "MAIL_DISCARDED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type MailItem = {
  id: string;
  sender: string;
  subject: string;
  category: MailCategory;
  requiredAction: MailAction;
  receivedAt: string;
  dueAt: string | null;
  status: MailStatus;
  fingerprint: string;
  assignedTo: string;
};

export type MailEventInput = {
  eventId: string;
  mailId: string;
  type: MailEventType;
  occurredAt?: string;
  sender?: string;
  subject?: string;
  category?: MailCategory;
  requiredAction?: MailAction;
  dueAt?: string | null;
  notes?: string;
  source?: string;
};

export type MailEvent = Required<Omit<MailEventInput, "occurredAt" | "sender" | "subject" | "category" | "requiredAction" | "dueAt" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  sender: string;
  subject: string;
  category: MailCategory;
  requiredAction: MailAction;
  dueAt: string | null;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  mailId: string;
  kind: "DUE_SOON" | "OVERDUE" | "DUPLICATE_NOTICE" | "STALE_UNREVIEWED";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  mailId: string;
  channel: "PUSH" | "EMAIL";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "INBOX_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function mailEventKey(input: Pick<MailEventInput, "mailId" | "eventId">) {
  if (!input.mailId || !input.eventId) throw new Error("mailId and eventId are required");
  return `${input.mailId}:${input.eventId}`;
}

export function fingerprint(sender: string, subject: string, dueAt: string | null) {
  return `${sender.trim().toLowerCase()}:${subject.trim().toLowerCase().replace(/\s+/g, " ")}:${dueAt?.slice(0, 10) || "none"}`;
}

export class MailTriage {
  mail: MailItem[] = [];
  events: MailEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.mail = [
      this.item("mail-electric", "City Electric", "June electric bill", "BILL", "PAY", addMinutes(-6000, now), addMinutes(36 * 60, now), "ACTION_REQUIRED", "Ava"),
      this.item("mail-insurance", "Home Insurance Co", "Policy renewal notice", "INSURANCE", "RENEW", addMinutes(-3000, now), addMinutes(12 * 60, now), "ACTION_REQUIRED", "Ava"),
      this.item("mail-tax", "County Assessor", "Property tax statement", "TAX", "FILE", addMinutes(-500, now), addMinutes(20 * 24 * 60, now), "UNREVIEWED", "Noah"),
      this.item("mail-junk", "Coupon Mailer", "Weekly coupons", "JUNK", "DISCARD", addMinutes(-9 * 24 * 60, now), null, "UNREVIEWED", "Ava"),
      this.item("mail-electric-copy", "City Electric", "June electric bill", "BILL", "PAY", addMinutes(-120, now), addMinutes(36 * 60, now), "UNREVIEWED", "Ava")
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanInbox(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { mail: this.mail.length, alerts: this.alerts.length });
  }

  item(idValue: string, sender: string, subject: string, category: MailCategory, requiredAction: MailAction, receivedAt: string, dueAt: string | null, status: MailStatus, assignedTo: string): MailItem {
    return { id: idValue, sender, subject, category, requiredAction, receivedAt: iso(receivedAt), dueAt: dueAt ? iso(dueAt) : null, status, fingerprint: fingerprint(sender, subject, dueAt ? iso(dueAt) : null), assignedTo };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  mailById(mailId: string) {
    const item = this.mail.find((candidate) => candidate.id === mailId);
    if (!item) throw new Error("mail item not found");
    return item;
  }

  ingest(input: MailEventInput) {
    const item = this.mailById(input.mailId);
    const eventKey = mailEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    const event: MailEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      mailId: input.mailId,
      type: input.type,
      occurredAt,
      sender: input.sender || item.sender,
      subject: input.subject || item.subject,
      category: input.category || item.category,
      requiredAction: input.requiredAction || item.requiredAction,
      dueAt: input.dueAt === undefined ? item.dueAt : input.dueAt ? iso(input.dueAt) : null,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    if (event.type === "MAIL_SCANNED" || event.type === "CLASSIFIED") {
      item.sender = event.sender;
      item.subject = event.subject;
      item.category = event.category;
      item.requiredAction = event.requiredAction;
      item.dueAt = event.dueAt;
      item.fingerprint = fingerprint(item.sender, item.subject, item.dueAt);
      item.status = item.requiredAction === "DISCARD" ? "UNREVIEWED" : "ACTION_REQUIRED";
    }
    if (event.type === "ACTION_COMPLETED") item.status = "DONE";
    if (event.type === "MAIL_DISCARDED") item.status = "ARCHIVED";
    if (event.type === "REMINDER_SNOOZED") this.ensureReminder(item, addMinutes(24 * 60, occurredAt));

    this.scanInbox(occurredAt);
    this.createAudit("MAIL_EVENT_INGESTED", { eventId: event.id, mailId: item.id, type: event.type });
    return { duplicate: false, event };
  }

  scanInbox(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    const seen = new Map<string, MailItem>();
    for (const item of this.mail) {
      const prior = seen.get(item.fingerprint);
      if (prior && item.status !== "DONE" && item.status !== "ARCHIVED") this.ensureAlert(item, "DUPLICATE_NOTICE", `duplicate:${item.fingerprint}`);
      seen.set(item.fingerprint, item);

      if (item.status === "UNREVIEWED" && now - new Date(item.receivedAt).getTime() > 7 * 24 * 60 * 60_000) {
        item.status = "STALE";
        this.ensureAlert(item, "STALE_UNREVIEWED", `stale:${item.id}`);
      }
      if (item.dueAt && item.status === "ACTION_REQUIRED") {
        const minutesUntilDue = (new Date(item.dueAt).getTime() - now) / 60_000;
        if (minutesUntilDue < 0) this.ensureAlert(item, "OVERDUE", `overdue:${item.id}`);
        if (minutesUntilDue <= 48 * 60 && minutesUntilDue >= 0) {
          this.ensureAlert(item, "DUE_SOON", `due:${item.id}`);
          this.ensureReminder(item, addMinutes(-24 * 60, item.dueAt));
        }
      }
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  ensureAlert(item: MailItem, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), mailId: item.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(item: MailItem, scheduledFor: string) {
    const dedupeKey = `reminder:${item.id}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), mailId: item.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
      this.reminders.unshift(reminder);
    }
    return reminder;
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  dispatchReminders() { let sent = 0; for (const reminder of this.reminders.filter((candidate) => candidate.status === "QUEUED")) { reminder.status = "SENT"; reminder.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 90, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated reminder provider timeout"; return { processed: true, job }; }
    if (job.kind === "INBOX_SCAN") this.scanInbox();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(90);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { mail: [...this.mail].sort((a, b) => (a.dueAt || "9999").localeCompare(b.dueAt || "9999")), events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { inbox: this.mail.filter((item) => item.status === "UNREVIEWED" || item.status === "STALE").length, actions: this.mail.filter((item) => item.status === "ACTION_REQUIRED").length, done: this.mail.filter((item) => item.status === "DONE" || item.status === "ARCHIVED").length, stale: this.mail.filter((item) => item.status === "STALE").length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { mail: this.mail, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.mail = state.mail as MailItem[]; this.events = state.events as MailEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededTriage(now: Date = new Date()) { const triage = new MailTriage(); triage.seed(now); return triage; }
