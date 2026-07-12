import crypto from "node:crypto";

export type TaxCategory = "W2" | "FORM_1099" | "RECEIPT" | "DEDUCTION" | "MORTGAGE" | "CHARITY" | "HEALTH" | "PRIOR_RETURN" | "CHILDCARE" | "STATE_FORM";
export type DocumentStatus = "EXPECTED" | "RECEIVED" | "CLASSIFIED" | "DUPLICATE" | "MISSING" | "REVIEWED" | "ARCHIVED";
export type TaxEventType = "DOCUMENT_EXPECTED" | "DOCUMENT_RECEIVED" | "DOCUMENT_CLASSIFIED" | "DOCUMENT_REVIEWED" | "DOCUMENT_DUPLICATE" | "MISSING_SCAN" | "DOCUMENT_ARCHIVED" | "PROFILE_UPDATED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type TaxDocument = {
  id: string;
  taxYear: number;
  taxpayer: string;
  name: string;
  category: TaxCategory;
  issuer: string;
  amount: number;
  dueBy: string;
  receivedAt: string | null;
  status: DocumentStatus;
  fingerprint: string;
  storageRef: string | null;
  updatedAt: string;
  notes: string;
};

export type TaxEventInput = {
  eventId: string;
  documentId: string;
  type: TaxEventType;
  occurredAt?: string;
  taxYear?: number;
  taxpayer?: string;
  name?: string;
  category?: TaxCategory;
  issuer?: string;
  amount?: number;
  dueBy?: string;
  receivedAt?: string | null;
  status?: DocumentStatus;
  storageRef?: string | null;
  notes?: string;
  source?: string;
};

export type TaxEvent = Required<Omit<TaxEventInput, "occurredAt" | "taxYear" | "taxpayer" | "name" | "category" | "issuer" | "amount" | "dueBy" | "receivedAt" | "status" | "storageRef" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  taxYear: number;
  taxpayer: string;
  name: string;
  category: TaxCategory;
  issuer: string;
  amount: number;
  dueBy: string;
  receivedAt: string | null;
  status: DocumentStatus;
  fingerprint: string;
  storageRef: string | null;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  documentId: string;
  kind: "MISSING_DOCUMENT" | "DUPLICATE_DOCUMENT" | "REVIEW_NEEDED" | "DEADLINE_SOON" | "STALE_CLASSIFICATION";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "TAX_SCAN" | "CLASSIFICATION" | "ALERT_DISPATCH" | "RETENTION";
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

export function taxEventKey(input: Pick<TaxEventInput, "documentId" | "eventId">) {
  if (!input.documentId || !input.eventId) throw new Error("documentId and eventId are required");
  return `${input.documentId}:${input.eventId}`;
}

export function taxDocumentFingerprint(taxYear: number, category: TaxCategory, issuer: string, taxpayer: string) {
  return `${taxYear}:${category}:${issuer.trim().toLowerCase().replace(/\s+/g, " ")}:${taxpayer.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export class TaxDocumentOrganizer {
  documents: TaxDocument[] = [];
  events: TaxEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.documents = [
      this.doc("doc-w2", 2026, "Ava", "W-2 from Northwind", "W2", "Northwind Labs", 84250, addMinutes(45 * 24 * 60, now), addMinutes(-5 * 24 * 60, now), "CLASSIFIED", "vault://2026/w2-northwind.pdf", addMinutes(-5 * 24 * 60, now), "Imported from payroll portal."),
      this.doc("doc-1099-bank", 2026, "Ava", "1099-INT from Community Bank", "FORM_1099", "Community Bank", 284, addMinutes(20 * 24 * 60, now), null, "EXPECTED", null, addMinutes(-25 * 24 * 60, now), "Expected from bank mailbox."),
      this.doc("doc-mortgage", 2026, "Ava", "Mortgage interest statement", "MORTGAGE", "Lakeview Credit Union", 12400, addMinutes(14 * 24 * 60, now), null, "EXPECTED", null, addMinutes(-40 * 24 * 60, now), "Needed for deduction review."),
      this.doc("doc-childcare", 2026, "Ava", "Childcare expense receipt", "CHILDCARE", "Bright Start", 3600, addMinutes(10 * 24 * 60, now), addMinutes(-1 * 24 * 60, now), "RECEIVED", "inbox://bright-start.jpg", addMinutes(-1 * 24 * 60, now), "Needs classification."),
      this.doc("doc-charity", 2026, "Ava", "Charity donation receipt", "CHARITY", "Neighborhood Food Fund", 500, addMinutes(-2 * 24 * 60, now), null, "EXPECTED", null, addMinutes(-80 * 24 * 60, now), "Deadline passed."),
      this.doc("doc-prior-return", 2025, "Ava", "Prior year return", "PRIOR_RETURN", "Tax archive", 0, addMinutes(30 * 24 * 60, now), addMinutes(-60 * 24 * 60, now), "REVIEWED", "vault://2025/final-return.pdf", addMinutes(-60 * 24 * 60, now), "Reference only.")
    ];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanDocuments(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { documents: this.documents.length, alerts: this.alerts.length });
  }

  doc(idValue: string, taxYear: number, taxpayer: string, name: string, category: TaxCategory, issuer: string, amount: number, dueBy: string, receivedAt: string | null, status: DocumentStatus, storageRef: string | null, updatedAt: string, notes: string): TaxDocument {
    return { id: idValue, taxYear, taxpayer, name, category, issuer, amount, dueBy: iso(dueBy), receivedAt: receivedAt ? iso(receivedAt) : null, status, fingerprint: taxDocumentFingerprint(taxYear, category, issuer, taxpayer), storageRef, updatedAt: iso(updatedAt), notes };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  documentById(documentId: string) {
    const document = this.documents.find((candidate) => candidate.id === documentId);
    if (!document) throw new Error("tax document not found");
    return document;
  }

  ingest(input: TaxEventInput) {
    let document = this.documents.find((candidate) => candidate.id === input.documentId);
    const eventKey = taxEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!document && input.type !== "DOCUMENT_EXPECTED" && input.type !== "DOCUMENT_RECEIVED") throw new Error("tax document not found");
    if (!document) {
      document = this.doc(
        input.documentId,
        input.taxYear || new Date(occurredAt).getUTCFullYear(),
        input.taxpayer || "Ava",
        input.name || "New tax document",
        input.category || "RECEIPT",
        input.issuer || "Unknown issuer",
        input.amount || 0,
        input.dueBy || addMinutes(30 * 24 * 60, occurredAt),
        input.receivedAt === undefined ? (input.type === "DOCUMENT_RECEIVED" ? occurredAt : null) : input.receivedAt,
        input.type === "DOCUMENT_RECEIVED" ? "RECEIVED" : "EXPECTED",
        input.storageRef === undefined ? null : input.storageRef,
        occurredAt,
        input.notes || ""
      );
      this.documents.push(document);
    }

    const event: TaxEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      documentId: input.documentId,
      type: input.type,
      occurredAt,
      taxYear: input.taxYear || document.taxYear,
      taxpayer: input.taxpayer || document.taxpayer,
      name: input.name || document.name,
      category: input.category || document.category,
      issuer: input.issuer || document.issuer,
      amount: input.amount ?? document.amount,
      dueBy: input.dueBy ? iso(input.dueBy) : document.dueBy,
      receivedAt: input.receivedAt === undefined ? document.receivedAt : input.receivedAt ? iso(input.receivedAt) : null,
      status: input.status || document.status,
      fingerprint: taxDocumentFingerprint(input.taxYear || document.taxYear, input.category || document.category, input.issuer || document.issuer, input.taxpayer || document.taxpayer),
      storageRef: input.storageRef === undefined ? document.storageRef : input.storageRef,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(document.updatedAt).getTime() && event.type !== "MISSING_SCAN";
    if (!staleUpdate) {
      if (event.type === "DOCUMENT_EXPECTED") this.applyEventToDocument(document, event, "EXPECTED");
      if (event.type === "DOCUMENT_RECEIVED") this.applyEventToDocument(document, event, "RECEIVED");
      if (event.type === "DOCUMENT_CLASSIFIED") this.applyEventToDocument(document, event, "CLASSIFIED");
      if (event.type === "DOCUMENT_REVIEWED") this.applyEventToDocument(document, event, "REVIEWED");
      if (event.type === "DOCUMENT_ARCHIVED") this.applyEventToDocument(document, event, "ARCHIVED");
      if (event.type === "DOCUMENT_DUPLICATE") this.applyEventToDocument(document, event, "DUPLICATE");
    }

    this.detectDuplicates(document);
    this.scanDocuments(occurredAt);
    this.createAudit(staleUpdate ? "STALE_TAX_EVENT_IGNORED" : "TAX_EVENT_INGESTED", { eventId: event.id, documentId: document.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyEventToDocument(document: TaxDocument, event: TaxEvent, status: DocumentStatus) {
    document.taxYear = event.taxYear;
    document.taxpayer = event.taxpayer;
    document.name = event.name;
    document.category = event.category;
    document.issuer = event.issuer;
    document.amount = event.amount;
    document.dueBy = event.dueBy;
    document.receivedAt = event.type === "DOCUMENT_RECEIVED" && !event.receivedAt ? event.occurredAt : event.receivedAt;
    document.status = status;
    document.fingerprint = event.fingerprint;
    document.storageRef = event.storageRef;
    document.updatedAt = event.occurredAt;
    document.notes = event.notes || document.notes;
  }

  detectDuplicates(document: TaxDocument) {
    if (!document.receivedAt) return null;
    const duplicateOf = this.documents.find((candidate) => candidate.id !== document.id && candidate.fingerprint === document.fingerprint && candidate.receivedAt);
    if (!duplicateOf) return null;
    document.status = "DUPLICATE";
    this.ensureAlert(document, "DUPLICATE_DOCUMENT", `duplicate:${document.fingerprint}`);
    this.createAudit("DUPLICATE_DOCUMENT_DETECTED", { documentId: document.id, duplicateOf: duplicateOf.id });
    return duplicateOf;
  }

  scanDocuments(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const document of this.documents) {
      if (["REVIEWED", "ARCHIVED", "DUPLICATE"].includes(document.status)) continue;
      const dueInMinutes = (new Date(document.dueBy).getTime() - now) / 60_000;
      const updatedAgeMinutes = (now - new Date(document.updatedAt).getTime()) / 60_000;
      if (!document.receivedAt && dueInMinutes < 0) {
        document.status = "MISSING";
        this.ensureAlert(document, "MISSING_DOCUMENT", `missing:${document.id}:${document.dueBy.slice(0, 10)}`);
      } else if (!document.receivedAt && dueInMinutes <= 21 * 24 * 60) {
        this.ensureAlert(document, "DEADLINE_SOON", `deadline:${document.id}:${document.dueBy.slice(0, 10)}`);
      }
      if (document.status === "RECEIVED") this.ensureAlert(document, "REVIEW_NEEDED", `review:${document.id}`);
      if (document.status === "RECEIVED" && updatedAgeMinutes > 7 * 24 * 60) this.ensureAlert(document, "STALE_CLASSIFICATION", `stale-classification:${document.id}`);
    }
    return { alerts: this.alerts.length };
  }

  classifyPending() {
    let classified = 0;
    for (const document of this.documents.filter((candidate) => candidate.status === "RECEIVED")) {
      document.status = "CLASSIFIED";
      document.updatedAt = iso();
      classified += 1;
    }
    return classified;
  }

  ensureAlert(document: TaxDocument, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), documentId: document.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  readinessScore() {
    if (this.documents.length === 0) return 100;
    const ready = this.documents.filter((document) => ["CLASSIFIED", "REVIEWED", "ARCHIVED"].includes(document.status)).length;
    return Math.round((ready / this.documents.length) * 100);
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 2555, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated document classifier timeout"; return { processed: true, job }; }
    if (job.kind === "TAX_SCAN") this.scanDocuments();
    if (job.kind === "CLASSIFICATION") this.classifyPending();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(2555);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { documents: [...this.documents].sort((a, b) => b.taxYear - a.taxYear || a.category.localeCompare(b.category) || a.name.localeCompare(b.name)), events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, metrics: { score: this.readinessScore(), total: this.documents.length, expected: this.documents.filter((document) => document.status === "EXPECTED").length, received: this.documents.filter((document) => document.status === "RECEIVED").length, classified: this.documents.filter((document) => document.status === "CLASSIFIED").length, missing: this.documents.filter((document) => document.status === "MISSING").length, duplicates: this.documents.filter((document) => document.status === "DUPLICATE").length, reviewed: this.documents.filter((document) => document.status === "REVIEWED").length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { documents: this.documents, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.documents = state.documents as TaxDocument[]; this.events = state.events as TaxEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededTaxOrganizer(now: Date = new Date()) { const organizer = new TaxDocumentOrganizer(); organizer.seed(now); return organizer; }
