import crypto from "node:crypto";

export type LeaseArea = "RENT" | "DEPOSIT" | "MAINTENANCE" | "NOTICE" | "DOCUMENT" | "RENEWAL" | "MOVE_OUT";
export type LeaseStatus = "SCHEDULED" | "DUE_SOON" | "PAID" | "OPEN" | "RESPONDED" | "OVERDUE" | "RESOLVED" | "DISPUTED" | "DUPLICATE" | "ARCHIVED";
export type LeaseEventType = "LEASE_CREATED" | "RENT_POSTED" | "RENT_PAID" | "NOTICE_RECEIVED" | "MAINTENANCE_REQUESTED" | "LANDLORD_RESPONDED" | "REPAIR_RESOLVED" | "DOCUMENT_UPLOADED" | "DEPOSIT_DEDUCTION_REPORTED" | "DEPOSIT_RETURNED" | "RENEWAL_OFFERED" | "MOVE_OUT_NOTICE_SENT" | "DEADLINE_SCAN" | "RECORD_ARCHIVED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type LeaseRecord = {
  id: string;
  leaseId: string;
  title: string;
  area: LeaseArea;
  party: string;
  amount: number;
  dueAt: string;
  openedAt: string;
  status: LeaseStatus;
  fingerprint: string;
  evidenceRef: string | null;
  updatedAt: string;
  notes: string;
};

export type LeaseEventInput = {
  eventId: string;
  recordId: string;
  type: LeaseEventType;
  occurredAt?: string;
  leaseId?: string;
  title?: string;
  area?: LeaseArea;
  party?: string;
  amount?: number;
  dueAt?: string;
  openedAt?: string;
  status?: LeaseStatus;
  evidenceRef?: string | null;
  notes?: string;
  source?: string;
};

export type LeaseEvent = Required<Omit<LeaseEventInput, "occurredAt" | "leaseId" | "title" | "area" | "party" | "amount" | "dueAt" | "openedAt" | "status" | "evidenceRef" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  leaseId: string;
  title: string;
  area: LeaseArea;
  party: string;
  amount: number;
  dueAt: string;
  openedAt: string;
  status: LeaseStatus;
  fingerprint: string;
  evidenceRef: string | null;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  recordId: string;
  kind: "RENT_DUE" | "RENEWAL_WINDOW" | "MOVE_OUT_NOTICE" | "DEPOSIT_RETURN_DUE" | "REPAIR_OVERDUE" | "LANDLORD_RESPONSE_DUE" | "DUPLICATE_DOCUMENT" | "NOTICE_REVIEW";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "LEASE_SCAN" | "ALERT_DISPATCH" | "EVIDENCE_REVIEW" | "RETENTION";
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

export function leaseEventKey(input: Pick<LeaseEventInput, "recordId" | "eventId">) {
  if (!input.recordId || !input.eventId) throw new Error("recordId and eventId are required");
  return `${input.recordId}:${input.eventId}`;
}

export function leaseRecordFingerprint(leaseId: string, area: LeaseArea, title: string, party: string) {
  return `${leaseId}:${area}:${title.trim().toLowerCase().replace(/\s+/g, " ")}:${party.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export class RentalLeaseTracker {
  records: LeaseRecord[] = [];
  events: LeaseEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.records = [
      this.record("rec-rent", "lease-apt-42", "August rent", "RENT", "Tenant", 2250, addMinutes(4 * 24 * 60, now), addMinutes(-26 * 24 * 60, now), "SCHEDULED", null, addMinutes(-26 * 24 * 60, now), "Autopay scheduled from checking."),
      this.record("rec-repair", "lease-apt-42", "Bathroom sink leak", "MAINTENANCE", "Landlord", 0, addMinutes(-5 * 24 * 60, now), addMinutes(-8 * 24 * 60, now), "OPEN", "photos://sink-leak", addMinutes(-8 * 24 * 60, now), "Submitted with photos; no response yet."),
      this.record("rec-renewal", "lease-apt-42", "Renewal decision window", "RENEWAL", "Tenant", 0, addMinutes(35 * 24 * 60, now), addMinutes(-200 * 24 * 60, now), "SCHEDULED", "lease://current.pdf", addMinutes(-200 * 24 * 60, now), "Decide whether to renew before notice window closes."),
      this.record("rec-moveout", "lease-apt-42", "Move-out notice deadline", "MOVE_OUT", "Tenant", 0, addMinutes(45 * 24 * 60, now), addMinutes(-200 * 24 * 60, now), "SCHEDULED", "lease://current.pdf", addMinutes(-200 * 24 * 60, now), "60-day notice required."),
      this.record("rec-deposit", "lease-apt-42", "Security deposit return", "DEPOSIT", "Landlord", 2250, addMinutes(12 * 24 * 60, now), addMinutes(-360 * 24 * 60, now), "SCHEDULED", "ledger://deposit", addMinutes(-360 * 24 * 60, now), "Track deductions and return deadline."),
      this.record("rec-notice", "lease-apt-42", "Rent increase notice", "NOTICE", "Landlord", 150, addMinutes(14 * 24 * 60, now), addMinutes(-2 * 24 * 60, now), "OPEN", "inbox://rent-increase.pdf", addMinutes(-2 * 24 * 60, now), "Needs review before renewal decision."),
      this.record("rec-lease", "lease-apt-42", "Signed lease", "DOCUMENT", "Tenant", 0, addMinutes(365 * 24 * 60, now), addMinutes(-200 * 24 * 60, now), "ARCHIVED", "lease://current.pdf", addMinutes(-200 * 24 * 60, now), "Primary lease document.")
    ];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanDeadlines(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { records: this.records.length, alerts: this.alerts.length });
  }

  record(idValue: string, leaseId: string, title: string, area: LeaseArea, party: string, amount: number, dueAt: string, openedAt: string, status: LeaseStatus, evidenceRef: string | null, updatedAt: string, notes: string): LeaseRecord {
    return { id: idValue, leaseId, title, area, party, amount, dueAt: iso(dueAt), openedAt: iso(openedAt), status, fingerprint: leaseRecordFingerprint(leaseId, area, title, party), evidenceRef, updatedAt: iso(updatedAt), notes };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  recordById(recordId: string) {
    const record = this.records.find((candidate) => candidate.id === recordId);
    if (!record) throw new Error("lease record not found");
    return record;
  }

  ingest(input: LeaseEventInput) {
    let record = this.records.find((candidate) => candidate.id === input.recordId);
    const eventKey = leaseEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!record && input.type !== "LEASE_CREATED" && input.type !== "DOCUMENT_UPLOADED" && input.type !== "MAINTENANCE_REQUESTED" && input.type !== "NOTICE_RECEIVED") throw new Error("lease record not found");
    if (!record) {
      const area = input.area || (input.type === "MAINTENANCE_REQUESTED" ? "MAINTENANCE" : input.type === "NOTICE_RECEIVED" ? "NOTICE" : "DOCUMENT");
      record = this.record(input.recordId, input.leaseId || "lease-apt-42", input.title || "New lease record", area, input.party || "Tenant", input.amount || 0, input.dueAt || addMinutes(7 * 24 * 60, occurredAt), input.openedAt || occurredAt, "OPEN", input.evidenceRef === undefined ? null : input.evidenceRef, occurredAt, input.notes || "");
      this.records.push(record);
    }

    const event: LeaseEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      recordId: input.recordId,
      type: input.type,
      occurredAt,
      leaseId: input.leaseId || record.leaseId,
      title: input.title || record.title,
      area: input.area || record.area,
      party: input.party || record.party,
      amount: input.amount ?? record.amount,
      dueAt: input.dueAt ? iso(input.dueAt) : record.dueAt,
      openedAt: input.openedAt ? iso(input.openedAt) : record.openedAt,
      status: input.status || record.status,
      fingerprint: leaseRecordFingerprint(input.leaseId || record.leaseId, input.area || record.area, input.title || record.title, input.party || record.party),
      evidenceRef: input.evidenceRef === undefined ? record.evidenceRef : input.evidenceRef,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(record.updatedAt).getTime() && event.type !== "DEADLINE_SCAN";
    if (!staleUpdate) {
      if (event.type === "LEASE_CREATED" || event.type === "RENT_POSTED" || event.type === "DOCUMENT_UPLOADED") this.applyEventToRecord(record, event, event.status === "ARCHIVED" ? "ARCHIVED" : "SCHEDULED");
      if (event.type === "RENT_PAID") this.applyEventToRecord(record, event, "PAID");
      if (event.type === "NOTICE_RECEIVED") this.applyEventToRecord(record, event, "OPEN");
      if (event.type === "MAINTENANCE_REQUESTED") this.applyEventToRecord(record, event, "OPEN");
      if (event.type === "LANDLORD_RESPONDED") this.applyEventToRecord(record, event, "RESPONDED");
      if (event.type === "REPAIR_RESOLVED" || event.type === "DEPOSIT_RETURNED" || event.type === "MOVE_OUT_NOTICE_SENT") this.applyEventToRecord(record, event, "RESOLVED");
      if (event.type === "DEPOSIT_DEDUCTION_REPORTED") this.applyEventToRecord(record, event, "DISPUTED");
      if (event.type === "RENEWAL_OFFERED") this.applyEventToRecord(record, event, "OPEN");
      if (event.type === "RECORD_ARCHIVED") this.applyEventToRecord(record, event, "ARCHIVED");
    }

    this.detectDuplicateEvidence(record);
    this.scanDeadlines(occurredAt);
    this.createAudit(staleUpdate ? "STALE_LEASE_EVENT_IGNORED" : "LEASE_EVENT_INGESTED", { eventId: event.id, recordId: record.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyEventToRecord(record: LeaseRecord, event: LeaseEvent, status: LeaseStatus) {
    record.leaseId = event.leaseId;
    record.title = event.title;
    record.area = event.area;
    record.party = event.party;
    record.amount = event.amount;
    record.dueAt = event.dueAt;
    record.openedAt = event.openedAt;
    record.status = status;
    record.fingerprint = event.fingerprint;
    record.evidenceRef = event.evidenceRef;
    record.updatedAt = event.occurredAt;
    record.notes = event.notes || record.notes;
  }

  detectDuplicateEvidence(record: LeaseRecord) {
    if (!record.evidenceRef || !["NOTICE", "DOCUMENT"].includes(record.area)) return null;
    const duplicateOf = this.records.find((candidate) => candidate.id !== record.id && candidate.fingerprint === record.fingerprint && candidate.evidenceRef);
    if (!duplicateOf) return null;
    record.status = "DUPLICATE";
    this.ensureAlert(record, "DUPLICATE_DOCUMENT", `duplicate:${record.fingerprint}`);
    this.createAudit("DUPLICATE_LEASE_DOCUMENT_DETECTED", { recordId: record.id, duplicateOf: duplicateOf.id });
    return duplicateOf;
  }

  scanDeadlines(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const record of this.records) {
      if (["PAID", "RESOLVED", "ARCHIVED", "DUPLICATE", "DISPUTED"].includes(record.status)) continue;
      const dueInMinutes = (new Date(record.dueAt).getTime() - now) / 60_000;
      const openedAgeMinutes = (now - new Date(record.openedAt).getTime()) / 60_000;

      if (record.area === "RENT" && dueInMinutes <= 7 * 24 * 60) {
        record.status = dueInMinutes < 0 ? "OVERDUE" : "DUE_SOON";
        this.ensureAlert(record, "RENT_DUE", `rent:${record.id}:${record.dueAt.slice(0, 10)}`);
      }
      if (record.area === "MAINTENANCE" && ["OPEN", "OVERDUE"].includes(record.status) && openedAgeMinutes > 3 * 24 * 60) {
        record.status = "OVERDUE";
        this.ensureAlert(record, "REPAIR_OVERDUE", `repair-overdue:${record.id}`);
        this.ensureAlert(record, "LANDLORD_RESPONSE_DUE", `landlord-response:${record.id}`);
      }
      if (record.area === "DEPOSIT" && dueInMinutes <= 14 * 24 * 60) {
        record.status = dueInMinutes < 0 ? "OVERDUE" : "DUE_SOON";
        this.ensureAlert(record, "DEPOSIT_RETURN_DUE", `deposit:${record.id}:${record.dueAt.slice(0, 10)}`);
      }
      if (record.area === "RENEWAL" && dueInMinutes <= 60 * 24 * 60) {
        record.status = "DUE_SOON";
        this.ensureAlert(record, "RENEWAL_WINDOW", `renewal:${record.id}:${record.dueAt.slice(0, 10)}`);
      }
      if (record.area === "MOVE_OUT" && dueInMinutes <= 60 * 24 * 60) {
        record.status = "DUE_SOON";
        this.ensureAlert(record, "MOVE_OUT_NOTICE", `moveout:${record.id}:${record.dueAt.slice(0, 10)}`);
      }
      if (record.area === "NOTICE" && record.status === "OPEN") this.ensureAlert(record, "NOTICE_REVIEW", `notice-review:${record.id}`);
    }
    return { alerts: this.alerts.length };
  }

  reviewEvidence() {
    let reviewed = 0;
    for (const record of this.records.filter((candidate) => candidate.status === "RESPONDED" || candidate.status === "DISPUTED")) {
      record.status = "RESOLVED";
      record.updatedAt = iso();
      reviewed += 1;
    }
    return reviewed;
  }

  tenantScore() {
    if (this.records.length === 0) return 100;
    const stable = this.records.filter((record) => ["PAID", "RESOLVED", "ARCHIVED", "SCHEDULED"].includes(record.status)).length;
    return Math.round((stable / this.records.length) * 100);
  }

  ensureAlert(record: LeaseRecord, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), recordId: record.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365 * 7, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated tenant alert provider timeout"; return { processed: true, job }; }
    if (job.kind === "LEASE_SCAN") this.scanDeadlines();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "EVIDENCE_REVIEW") this.reviewEvidence();
    if (job.kind === "RETENTION") this.retain(365 * 7);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { records: [...this.records].sort((a, b) => a.area.localeCompare(b.area) || a.dueAt.localeCompare(b.dueAt)), events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, metrics: { score: this.tenantScore(), total: this.records.length, dueSoon: this.records.filter((record) => record.status === "DUE_SOON").length, overdue: this.records.filter((record) => record.status === "OVERDUE").length, open: this.records.filter((record) => record.status === "OPEN").length, resolved: this.records.filter((record) => record.status === "RESOLVED").length, paid: this.records.filter((record) => record.status === "PAID").length, duplicates: this.records.filter((record) => record.status === "DUPLICATE").length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { records: this.records, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.records = state.records as LeaseRecord[]; this.events = state.events as LeaseEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededRentalTracker(now: Date = new Date()) { const tracker = new RentalLeaseTracker(); tracker.seed(now); return tracker; }
