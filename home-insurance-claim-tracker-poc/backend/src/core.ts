import crypto from "node:crypto";

export type ClaimType = "WATER" | "ROOF" | "FIRE" | "THEFT" | "LIABILITY" | "OTHER";
export type ClaimStatus = "OPEN" | "WAITING_ON_DOCS" | "INSPECTION_SCHEDULED" | "ESTIMATE_REVIEW" | "APPROVED" | "PAID" | "DENIED" | "STALE";
export type ClaimEventType = "CLAIM_OPENED" | "PROVIDER_UPDATED" | "EVIDENCE_ADDED" | "INSPECTION_SCHEDULED" | "ESTIMATE_RECEIVED" | "PAYMENT_ISSUED" | "CLAIM_CLOSED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Claim = {
  id: string;
  policyNumber: string;
  title: string;
  type: ClaimType;
  status: ClaimStatus;
  incidentAt: string;
  openedAt: string;
  adjuster: string;
  nextDeadlineAt: string | null;
  inspectionAt: string | null;
  expectedPaymentCents: number;
  updatedAt: string;
};

export type Evidence = {
  id: string;
  claimId: string;
  kind: "PHOTO" | "RECEIPT" | "ESTIMATE" | "REPORT" | "INVOICE";
  label: string;
  fingerprint: string;
  uploadedAt: string;
  duplicateOf: string | null;
};

export type ClaimEventInput = {
  eventId: string;
  claimId: string;
  type: ClaimEventType;
  occurredAt?: string;
  policyNumber?: string;
  title?: string;
  claimType?: ClaimType;
  status?: ClaimStatus;
  adjuster?: string;
  nextDeadlineAt?: string | null;
  inspectionAt?: string | null;
  expectedPaymentCents?: number;
  evidenceKind?: Evidence["kind"];
  evidenceLabel?: string;
  evidenceHash?: string;
  notes?: string;
  source?: string;
};

export type ClaimEvent = Required<Omit<ClaimEventInput, "occurredAt" | "policyNumber" | "title" | "claimType" | "status" | "adjuster" | "nextDeadlineAt" | "inspectionAt" | "expectedPaymentCents" | "evidenceKind" | "evidenceLabel" | "evidenceHash" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  policyNumber: string;
  title: string;
  claimType: ClaimType;
  status: ClaimStatus;
  adjuster: string;
  nextDeadlineAt: string | null;
  inspectionAt: string | null;
  expectedPaymentCents: number;
  evidenceKind: Evidence["kind"] | null;
  evidenceLabel: string;
  evidenceHash: string;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  claimId: string;
  kind: "DOCUMENT_DEADLINE" | "INSPECTION_SOON" | "STALE_CLAIM" | "DUPLICATE_EVIDENCE" | "PAYMENT_READY";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  claimId: string;
  channel: "PUSH" | "EMAIL";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "CLAIM_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
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

export function claimEventKey(input: Pick<ClaimEventInput, "claimId" | "eventId">) {
  if (!input.claimId || !input.eventId) throw new Error("claimId and eventId are required");
  return `${input.claimId}:${input.eventId}`;
}

export function evidenceFingerprint(kind: Evidence["kind"], label: string, evidenceHash: string) {
  return `${kind}:${label.trim().toLowerCase().replace(/\s+/g, " ")}:${evidenceHash.trim().toLowerCase()}`;
}

export class InsuranceClaimTracker {
  claims: Claim[] = [];
  evidence: Evidence[] = [];
  events: ClaimEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.claims = [
      this.claim("claim-water", "HO-44821", "Basement water damage", "WATER", "WAITING_ON_DOCS", addMinutes(-6 * 24 * 60, now), addMinutes(-5 * 24 * 60, now), "Iris Chen", addMinutes(20 * 60, now), addMinutes(30 * 60, now), 420000, addMinutes(-2 * 24 * 60, now)),
      this.claim("claim-roof", "HO-44821", "Hail roof damage", "ROOF", "INSPECTION_SCHEDULED", addMinutes(-12 * 24 * 60, now), addMinutes(-10 * 24 * 60, now), "Marco Diaz", addMinutes(4 * 24 * 60, now), addMinutes(26 * 60, now), 780000, addMinutes(-8 * 24 * 60, now)),
      this.claim("claim-theft", "HO-44821", "Garage tool theft", "THEFT", "ESTIMATE_REVIEW", addMinutes(-20 * 24 * 60, now), addMinutes(-19 * 24 * 60, now), "Iris Chen", addMinutes(8 * 60, now), null, 185000, addMinutes(-11 * 24 * 60, now)),
      this.claim("claim-fire", "HO-44821", "Kitchen smoke cleanup", "FIRE", "APPROVED", addMinutes(-40 * 24 * 60, now), addMinutes(-39 * 24 * 60, now), "Priya Shah", null, null, 95000, addMinutes(-2 * 60, now))
    ];
    this.evidence = [
      this.evidenceItem("ev-water-photo", "claim-water", "PHOTO", "Basement standing water", "hash-water-1", addMinutes(-4 * 24 * 60, now)),
      this.evidenceItem("ev-roof-photo", "claim-roof", "PHOTO", "North roof hail dents", "hash-roof-1", addMinutes(-9 * 24 * 60, now)),
      this.evidenceItem("ev-roof-photo-copy", "claim-roof", "PHOTO", "North roof hail dents", "hash-roof-1", addMinutes(-8 * 24 * 60, now)),
      this.evidenceItem("ev-theft-report", "claim-theft", "REPORT", "Police report", "hash-police-1", addMinutes(-17 * 24 * 60, now))
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanClaims(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { claims: this.claims.length, evidence: this.evidence.length, alerts: this.alerts.length });
  }

  claim(idValue: string, policyNumber: string, title: string, type: ClaimType, status: ClaimStatus, incidentAt: string, openedAt: string, adjuster: string, nextDeadlineAt: string | null, inspectionAt: string | null, expectedPaymentCents: number, updatedAt: string): Claim {
    return { id: idValue, policyNumber, title, type, status, incidentAt: iso(incidentAt), openedAt: iso(openedAt), adjuster, nextDeadlineAt: nextDeadlineAt ? iso(nextDeadlineAt) : null, inspectionAt: inspectionAt ? iso(inspectionAt) : null, expectedPaymentCents, updatedAt: iso(updatedAt) };
  }

  evidenceItem(idValue: string, claimId: string, kind: Evidence["kind"], label: string, hash: string, uploadedAt: string): Evidence {
    const fingerprint = evidenceFingerprint(kind, label, hash);
    return { id: idValue, claimId, kind, label, fingerprint, uploadedAt: iso(uploadedAt), duplicateOf: null };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  claimById(claimId: string) {
    const claim = this.claims.find((candidate) => candidate.id === claimId);
    if (!claim) throw new Error("claim not found");
    return claim;
  }

  ingest(input: ClaimEventInput) {
    const claim = this.claimById(input.claimId);
    const eventKey = claimEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    const event: ClaimEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      claimId: input.claimId,
      type: input.type,
      occurredAt,
      policyNumber: input.policyNumber || claim.policyNumber,
      title: input.title || claim.title,
      claimType: input.claimType || claim.type,
      status: input.status || claim.status,
      adjuster: input.adjuster || claim.adjuster,
      nextDeadlineAt: input.nextDeadlineAt === undefined ? claim.nextDeadlineAt : input.nextDeadlineAt ? iso(input.nextDeadlineAt) : null,
      inspectionAt: input.inspectionAt === undefined ? claim.inspectionAt : input.inspectionAt ? iso(input.inspectionAt) : null,
      expectedPaymentCents: input.expectedPaymentCents ?? claim.expectedPaymentCents,
      evidenceKind: input.evidenceKind || null,
      evidenceLabel: input.evidenceLabel || "",
      evidenceHash: input.evidenceHash || "",
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(claim.updatedAt).getTime();
    if (!staleUpdate && ["CLAIM_OPENED", "PROVIDER_UPDATED", "INSPECTION_SCHEDULED", "ESTIMATE_RECEIVED"].includes(event.type)) {
      claim.policyNumber = event.policyNumber;
      claim.title = event.title;
      claim.type = event.claimType;
      claim.status = event.status;
      claim.adjuster = event.adjuster;
      claim.nextDeadlineAt = event.nextDeadlineAt;
      claim.inspectionAt = event.inspectionAt;
      claim.expectedPaymentCents = event.expectedPaymentCents;
      claim.updatedAt = occurredAt;
    }
    if (!staleUpdate && event.type === "PAYMENT_ISSUED") {
      claim.status = "PAID";
      claim.expectedPaymentCents = event.expectedPaymentCents;
      claim.updatedAt = occurredAt;
      this.ensureAlert(claim, "PAYMENT_READY", `payment:${claim.id}`);
    }
    if (!staleUpdate && event.type === "CLAIM_CLOSED") {
      claim.status = event.status === "DENIED" ? "DENIED" : "PAID";
      claim.updatedAt = occurredAt;
    }
    if (event.type === "EVIDENCE_ADDED" && event.evidenceKind && event.evidenceHash) {
      const added = this.addEvidence(claim.id, event.evidenceKind, event.evidenceLabel || event.notes || "Evidence", event.evidenceHash, occurredAt);
      if (added.duplicateOf) this.ensureAlert(claim, "DUPLICATE_EVIDENCE", `duplicate:${added.fingerprint}`);
    }

    this.scanClaims(occurredAt);
    this.createAudit(staleUpdate ? "STALE_CLAIM_EVENT_IGNORED" : "CLAIM_EVENT_INGESTED", { eventId: event.id, claimId: claim.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  addEvidence(claimId: string, kind: Evidence["kind"], label: string, hash: string, uploadedAt: string) {
    const fingerprint = evidenceFingerprint(kind, label, hash);
    const existing = this.evidence.find((item) => item.claimId === claimId && item.fingerprint === fingerprint);
    const evidence = { id: id("ev"), claimId, kind, label, fingerprint, uploadedAt: iso(uploadedAt), duplicateOf: existing?.id || null };
    this.evidence.unshift(evidence);
    return evidence;
  }

  scanClaims(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    const seenEvidence = new Map<string, Evidence>();
    for (const item of this.evidence) {
      const prior = seenEvidence.get(`${item.claimId}:${item.fingerprint}`);
      if (prior && !item.duplicateOf) item.duplicateOf = prior.id;
      if (prior) this.ensureAlert(this.claimById(item.claimId), "DUPLICATE_EVIDENCE", `duplicate:${item.claimId}:${item.fingerprint}`);
      seenEvidence.set(`${item.claimId}:${item.fingerprint}`, item);
    }

    for (const claim of this.claims) {
      if (["PAID", "DENIED"].includes(claim.status)) continue;
      if (new Date(claim.updatedAt).getTime() < now - 7 * 24 * 60 * 60_000) {
        claim.status = "STALE";
        this.ensureAlert(claim, "STALE_CLAIM", `stale:${claim.id}`);
      }
      if (claim.nextDeadlineAt) {
        const minutesUntilDeadline = (new Date(claim.nextDeadlineAt).getTime() - now) / 60_000;
        if (minutesUntilDeadline <= 48 * 60 && minutesUntilDeadline >= 0) {
          this.ensureAlert(claim, "DOCUMENT_DEADLINE", `deadline:${claim.id}`);
          this.ensureReminder(claim, "DOCUMENT_DEADLINE", addMinutes(-4 * 60, claim.nextDeadlineAt));
        }
      }
      if (claim.inspectionAt) {
        const minutesUntilInspection = (new Date(claim.inspectionAt).getTime() - now) / 60_000;
        if (minutesUntilInspection <= 48 * 60 && minutesUntilInspection >= 0) {
          this.ensureAlert(claim, "INSPECTION_SOON", `inspection:${claim.id}`);
          this.ensureReminder(claim, "INSPECTION_SOON", addMinutes(-2 * 60, claim.inspectionAt));
        }
      }
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  ensureAlert(claim: Claim, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), claimId: claim.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(claim: Claim, kind: Alert["kind"], scheduledFor: string) {
    const dedupeKey = `reminder:${claim.id}:${kind}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), claimId: claim.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
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
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated insurer notification timeout"; return { processed: true, job }; }
    if (job.kind === "CLAIM_SCAN") this.scanClaims();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { claims: [...this.claims].sort((a, b) => (a.nextDeadlineAt || "9999").localeCompare(b.nextDeadlineAt || "9999")), evidence: this.evidence, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { open: this.claims.filter((claim) => !["PAID", "DENIED"].includes(claim.status)).length, stale: this.claims.filter((claim) => claim.status === "STALE").length, evidence: this.evidence.length, duplicates: this.evidence.filter((item) => item.duplicateOf).length, expectedPayout: this.claims.reduce((sum, claim) => sum + claim.expectedPaymentCents, 0), queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { claims: this.claims, evidence: this.evidence, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.claims = state.claims as Claim[]; this.evidence = state.evidence as Evidence[]; this.events = state.events as ClaimEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededTracker(now: Date = new Date()) { const tracker = new InsuranceClaimTracker(); tracker.seed(now); return tracker; }
