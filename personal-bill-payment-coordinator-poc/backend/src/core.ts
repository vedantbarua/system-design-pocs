import crypto from "node:crypto";

export type BillCategory = "HOUSING" | "UTILITY" | "PHONE" | "INTERNET" | "CREDIT_CARD" | "INSURANCE" | "LOAN" | "SUBSCRIPTION";
export type BillStatus = "UPCOMING" | "DUE_SOON" | "SCHEDULED" | "PAID" | "OVERDUE" | "AUTOPAY_FAILED" | "NEEDS_CONFIRMATION";
export type BillEventType = "STATEMENT_RECEIVED" | "BILL_UPDATED" | "PAYMENT_SCHEDULED" | "PAYMENT_CONFIRMED" | "AUTOPAY_FAILED" | "BILL_CANCELLED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Bill = {
  id: string;
  payee: string;
  category: BillCategory;
  amountCents: number;
  dueAt: string;
  autopay: boolean;
  paymentMethod: string;
  confirmationCode: string | null;
  status: BillStatus;
  accountLast4: string;
  updatedAt: string;
  fingerprint: string;
};

export type Payment = {
  id: string;
  billId: string;
  amountCents: number;
  scheduledFor: string;
  paidAt: string | null;
  method: string;
  confirmationCode: string | null;
  status: "SCHEDULED" | "CONFIRMED" | "FAILED";
};

export type BillEventInput = {
  eventId: string;
  billId: string;
  type: BillEventType;
  occurredAt?: string;
  payee?: string;
  category?: BillCategory;
  amountCents?: number;
  dueAt?: string;
  autopay?: boolean;
  paymentMethod?: string;
  confirmationCode?: string | null;
  accountLast4?: string;
  notes?: string;
  source?: string;
};

export type BillEvent = Required<Omit<BillEventInput, "occurredAt" | "payee" | "category" | "amountCents" | "dueAt" | "autopay" | "paymentMethod" | "confirmationCode" | "accountLast4" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  payee: string;
  category: BillCategory;
  amountCents: number;
  dueAt: string;
  autopay: boolean;
  paymentMethod: string;
  confirmationCode: string | null;
  accountLast4: string;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  billId: string;
  kind: "DUE_SOON" | "OVERDUE" | "AUTOPAY_FAILED" | "MISSING_CONFIRMATION" | "DUPLICATE_BILL" | "AMOUNT_CHANGED";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  billId: string;
  channel: "PUSH" | "EMAIL";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "BILL_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function billEventKey(input: Pick<BillEventInput, "billId" | "eventId">) {
  if (!input.billId || !input.eventId) throw new Error("billId and eventId are required");
  return `${input.billId}:${input.eventId}`;
}

export function billFingerprint(payee: string, accountLast4: string, dueAt: string) {
  return `${payee.trim().toLowerCase().replace(/\s+/g, " ")}:${accountLast4.trim()}:${iso(dueAt).slice(0, 10)}`;
}

export class BillPaymentCoordinator {
  bills: Bill[] = [];
  payments: Payment[] = [];
  events: BillEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.bills = [
      this.bill("bill-rent", "Oak Street Rent", "HOUSING", 185000, addMinutes(18 * 60, now), false, "Checking", "7712", "UPCOMING", addMinutes(-2 * 24 * 60, now), null),
      this.bill("bill-electric", "City Electric", "UTILITY", 14230, addMinutes(36 * 60, now), true, "Visa Autopay", "8841", "SCHEDULED", addMinutes(-4 * 24 * 60, now), null),
      this.bill("bill-card", "Everyday Rewards Card", "CREDIT_CARD", 62480, addMinutes(-12 * 60, now), false, "Checking", "2230", "UPCOMING", addMinutes(-3 * 24 * 60, now), null),
      this.bill("bill-internet", "FiberNet Internet", "INTERNET", 7999, addMinutes(5 * 24 * 60, now), true, "Card Autopay", "1198", "AUTOPAY_FAILED", addMinutes(-3 * 60, now), null),
      this.bill("bill-phone", "Family Wireless", "PHONE", 12100, addMinutes(7 * 24 * 60, now), true, "Card Autopay", "4438", "UPCOMING", addMinutes(-8 * 24 * 60, now), null),
      this.bill("bill-electric-copy", "City Electric", "UTILITY", 14230, addMinutes(36 * 60, now), true, "Visa Autopay", "8841", "UPCOMING", addMinutes(-2 * 24 * 60, now), null)
    ];
    this.payments = [
      this.payment("pay-electric", "bill-electric", 14230, addMinutes(24 * 60, now), null, "Visa Autopay", null, "SCHEDULED"),
      this.payment("pay-internet", "bill-internet", 7999, addMinutes(-2 * 60, now), null, "Card Autopay", null, "FAILED")
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanBills(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { bills: this.bills.length, payments: this.payments.length, alerts: this.alerts.length });
  }

  bill(idValue: string, payee: string, category: BillCategory, amountCents: number, dueAt: string, autopay: boolean, paymentMethod: string, accountLast4: string, status: BillStatus, updatedAt: string, confirmationCode: string | null): Bill {
    const due = iso(dueAt);
    return { id: idValue, payee, category, amountCents, dueAt: due, autopay, paymentMethod, confirmationCode, status, accountLast4, updatedAt: iso(updatedAt), fingerprint: billFingerprint(payee, accountLast4, due) };
  }

  payment(idValue: string, billId: string, amountCents: number, scheduledFor: string, paidAt: string | null, method: string, confirmationCode: string | null, status: Payment["status"]): Payment {
    return { id: idValue, billId, amountCents, scheduledFor: iso(scheduledFor), paidAt: paidAt ? iso(paidAt) : null, method, confirmationCode, status };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  billById(billId: string) {
    const bill = this.bills.find((candidate) => candidate.id === billId);
    if (!bill) throw new Error("bill not found");
    return bill;
  }

  ingest(input: BillEventInput) {
    const bill = this.billById(input.billId);
    const eventKey = billEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    const previousAmount = bill.amountCents;
    const event: BillEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      billId: input.billId,
      type: input.type,
      occurredAt,
      payee: input.payee || bill.payee,
      category: input.category || bill.category,
      amountCents: input.amountCents ?? bill.amountCents,
      dueAt: input.dueAt ? iso(input.dueAt) : bill.dueAt,
      autopay: input.autopay ?? bill.autopay,
      paymentMethod: input.paymentMethod || bill.paymentMethod,
      confirmationCode: input.confirmationCode === undefined ? bill.confirmationCode : input.confirmationCode,
      accountLast4: input.accountLast4 || bill.accountLast4,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(bill.updatedAt).getTime();
    if (!staleUpdate && ["STATEMENT_RECEIVED", "BILL_UPDATED"].includes(event.type)) {
      bill.payee = event.payee;
      bill.category = event.category;
      bill.amountCents = event.amountCents;
      bill.dueAt = event.dueAt;
      bill.autopay = event.autopay;
      bill.paymentMethod = event.paymentMethod;
      bill.accountLast4 = event.accountLast4;
      bill.updatedAt = occurredAt;
      bill.fingerprint = billFingerprint(bill.payee, bill.accountLast4, bill.dueAt);
      bill.status = bill.autopay ? "SCHEDULED" : "UPCOMING";
      if (previousAmount !== bill.amountCents) this.ensureAlert(bill, "AMOUNT_CHANGED", `amount:${bill.id}:${bill.amountCents}`);
    }
    if (!staleUpdate && event.type === "PAYMENT_SCHEDULED") {
      bill.status = "SCHEDULED";
      bill.updatedAt = occurredAt;
      this.payments.unshift(this.payment(id("pay"), bill.id, event.amountCents, event.dueAt, null, event.paymentMethod, null, "SCHEDULED"));
    }
    if (!staleUpdate && event.type === "PAYMENT_CONFIRMED") {
      bill.status = "PAID";
      bill.confirmationCode = event.confirmationCode || `CONF-${event.eventId}`;
      bill.updatedAt = occurredAt;
      this.payments.unshift(this.payment(id("pay"), bill.id, event.amountCents, event.dueAt, occurredAt, event.paymentMethod, bill.confirmationCode, "CONFIRMED"));
    }
    if (!staleUpdate && event.type === "AUTOPAY_FAILED") {
      bill.status = "AUTOPAY_FAILED";
      bill.updatedAt = occurredAt;
      this.payments.unshift(this.payment(id("pay"), bill.id, event.amountCents, event.dueAt, null, event.paymentMethod, null, "FAILED"));
      this.ensureAlert(bill, "AUTOPAY_FAILED", `autopay:${bill.id}`);
    }
    if (!staleUpdate && event.type === "BILL_CANCELLED") {
      bill.status = "PAID";
      bill.updatedAt = occurredAt;
    }

    this.scanBills(occurredAt);
    this.createAudit(staleUpdate ? "STALE_BILL_EVENT_IGNORED" : "BILL_EVENT_INGESTED", { eventId: event.id, billId: bill.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  scanBills(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    const seen = new Map<string, Bill>();
    for (const bill of this.bills) {
      const prior = seen.get(bill.fingerprint);
      if (prior && bill.status !== "PAID") this.ensureAlert(bill, "DUPLICATE_BILL", `duplicate:${bill.fingerprint}`);
      seen.set(bill.fingerprint, bill);

      if (bill.status === "PAID") continue;
      const minutesUntilDue = (new Date(bill.dueAt).getTime() - now) / 60_000;
      if (minutesUntilDue < 0) {
        bill.status = bill.status === "AUTOPAY_FAILED" ? "AUTOPAY_FAILED" : "OVERDUE";
        this.ensureAlert(bill, "OVERDUE", `overdue:${bill.id}`);
      }
      if (minutesUntilDue >= 0 && minutesUntilDue <= 72 * 60) {
        if (!bill.autopay && bill.status !== "SCHEDULED") bill.status = "DUE_SOON";
        this.ensureAlert(bill, "DUE_SOON", `due:${bill.id}`);
        this.ensureReminder(bill, "DUE_SOON", addMinutes(-6 * 60, bill.dueAt));
      }
      if (bill.autopay && bill.status === "AUTOPAY_FAILED") {
        this.ensureAlert(bill, "AUTOPAY_FAILED", `autopay:${bill.id}`);
        this.ensureReminder(bill, "AUTOPAY_FAILED", addMinutes(60, asOf));
      }
      if (bill.status === "SCHEDULED" && !bill.confirmationCode && minutesUntilDue < -6 * 60) {
        bill.status = "NEEDS_CONFIRMATION";
        this.ensureAlert(bill, "MISSING_CONFIRMATION", `confirmation:${bill.id}`);
      }
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  ensureAlert(bill: Bill, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), billId: bill.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(bill: Bill, kind: Alert["kind"], scheduledFor: string) {
    const dedupeKey = `reminder:${bill.id}:${kind}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), billId: bill.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
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
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated bill reminder provider timeout"; return { processed: true, job }; }
    if (job.kind === "BILL_SCAN") this.scanBills();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { bills: [...this.bills].sort((a, b) => a.dueAt.localeCompare(b.dueAt)), payments: this.payments, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { open: this.bills.filter((bill) => bill.status !== "PAID").length, dueSoon: this.bills.filter((bill) => bill.status === "DUE_SOON").length, overdue: this.bills.filter((bill) => bill.status === "OVERDUE" || bill.status === "AUTOPAY_FAILED").length, paid: this.bills.filter((bill) => bill.status === "PAID").length, monthlyTotal: this.bills.reduce((sum, bill) => sum + bill.amountCents, 0), queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { bills: this.bills, payments: this.payments, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.bills = state.bills as Bill[]; this.payments = state.payments as Payment[]; this.events = state.events as BillEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededCoordinator(now: Date = new Date()) { const coordinator = new BillPaymentCoordinator(); coordinator.seed(now); return coordinator; }
