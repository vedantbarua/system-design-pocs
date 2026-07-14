import crypto from "node:crypto";

export type ApplicationStatus = "SAVED" | "APPLIED" | "SCREEN" | "INTERVIEW" | "OFFER" | "REJECTED" | "WITHDRAWN" | "STALE" | "FOLLOW_UP_DUE" | "DUPLICATE";
export type ApplicationPriority = "LOW" | "MEDIUM" | "HIGH";
export type ApplicationEventType = "APPLICATION_ADDED" | "APPLICATION_UPDATED" | "STATUS_CHANGED" | "INTERVIEW_SCHEDULED" | "INTERVIEW_COMPLETED" | "FOLLOW_UP_LOGGED" | "OFFER_RECEIVED" | "OFFER_UPDATED" | "REJECTION_RECEIVED" | "APPLICATION_WITHDRAWN" | "RESUME_ATTACHED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type JobApplication = {
  id: string;
  company: string;
  role: string;
  source: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  status: ApplicationStatus;
  priority: ApplicationPriority;
  nextActionAt: string;
  lastContactAt: string;
  resumeVersion: string;
  postingFingerprint: string;
  updatedAt: string;
  notes: string;
};

export type Interview = {
  id: string;
  applicationId: string;
  round: string;
  scheduledAt: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  notes: string;
};

export type Offer = {
  id: string;
  applicationId: string;
  salary: number;
  bonus: number;
  deadlineAt: string;
  status: "PENDING" | "NEGOTIATING" | "ACCEPTED" | "DECLINED";
  notes: string;
};

export type ApplicationEventInput = {
  eventId: string;
  applicationId: string;
  type: ApplicationEventType;
  occurredAt?: string;
  company?: string;
  role?: string;
  source?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  status?: ApplicationStatus;
  priority?: ApplicationPriority;
  nextActionAt?: string;
  lastContactAt?: string;
  resumeVersion?: string;
  round?: string;
  scheduledAt?: string;
  offerSalary?: number;
  offerBonus?: number;
  offerDeadlineAt?: string;
  notes?: string;
  eventSource?: string;
};

export type ApplicationEvent = Required<Omit<ApplicationEventInput, "occurredAt" | "company" | "role" | "source" | "location" | "salaryMin" | "salaryMax" | "status" | "priority" | "nextActionAt" | "lastContactAt" | "resumeVersion" | "round" | "scheduledAt" | "offerSalary" | "offerBonus" | "offerDeadlineAt" | "notes" | "eventSource">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  company: string;
  role: string;
  source: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  status: ApplicationStatus;
  priority: ApplicationPriority;
  nextActionAt: string;
  lastContactAt: string;
  resumeVersion: string;
  postingFingerprint: string;
  round: string;
  scheduledAt: string;
  offerSalary: number;
  offerBonus: number;
  offerDeadlineAt: string;
  notes: string;
  eventSource: string;
};

export type Alert = {
  id: string;
  applicationId: string;
  kind: "FOLLOW_UP_DUE" | "INTERVIEW_UPCOMING" | "OFFER_DEADLINE" | "STALE_APPLICATION" | "DUPLICATE_POSTING" | "THANK_YOU_DUE";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "APPLICATION_SCAN" | "REMINDER_DISPATCH" | "OFFER_REVIEW" | "RETENTION";
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

export function applicationEventKey(input: Pick<ApplicationEventInput, "applicationId" | "eventId">) {
  if (!input.applicationId || !input.eventId) throw new Error("applicationId and eventId are required");
  return `${input.applicationId}:${input.eventId}`;
}

export function postingFingerprint(company: string, role: string, location: string) {
  return `${company.trim().toLowerCase().replace(/\s+/g, " ")}:${role.trim().toLowerCase().replace(/\s+/g, " ")}:${location.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export class JobApplicationTracker {
  applications: JobApplication[] = [];
  interviews: Interview[] = [];
  offers: Offer[] = [];
  events: ApplicationEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.applications = [
      this.application("app-northwind", "Northwind Labs", "Senior Frontend Engineer", "LinkedIn", "Remote", 155000, 185000, "INTERVIEW", "HIGH", addMinutes(24 * 60, now), addMinutes(-2 * 24 * 60, now), "frontend-v4", addMinutes(-6 * 24 * 60, now), "Panel loop scheduled."),
      this.application("app-contoso", "Contoso Health", "Platform Engineer", "Referral", "Chicago", 145000, 175000, "APPLIED", "HIGH", addMinutes(-2 * 24 * 60, now), addMinutes(-14 * 24 * 60, now), "platform-v2", addMinutes(-14 * 24 * 60, now), "Referral submitted by Sam."),
      this.application("app-fabrikam", "Fabrikam", "Engineering Manager", "Company Site", "Hybrid", 170000, 210000, "OFFER", "HIGH", addMinutes(3 * 24 * 60, now), addMinutes(-1 * 24 * 60, now), "manager-v1", addMinutes(-10 * 24 * 60, now), "Offer needs comparison."),
      this.application("app-adatum", "Adatum", "Full Stack Developer", "Indeed", "Remote", 120000, 145000, "APPLIED", "MEDIUM", addMinutes(5 * 24 * 60, now), addMinutes(-18 * 24 * 60, now), "fullstack-v3", addMinutes(-18 * 24 * 60, now), "No update since apply."),
      this.application("app-trey", "Trey Research", "Staff UI Engineer", "Recruiter", "New York", 180000, 230000, "SCREEN", "MEDIUM", addMinutes(2 * 24 * 60, now), addMinutes(-1 * 24 * 60, now), "frontend-v4", addMinutes(-3 * 24 * 60, now), "Recruiter screen complete."),
      this.application("app-old", "Old Co", "Frontend Engineer", "LinkedIn", "Remote", 110000, 130000, "REJECTED", "LOW", addMinutes(-10 * 24 * 60, now), addMinutes(-9 * 24 * 60, now), "frontend-v1", addMinutes(-9 * 24 * 60, now), "Rejected after screen.")
    ];
    this.interviews = [
      { id: "int-northwind-panel", applicationId: "app-northwind", round: "Panel", scheduledAt: addMinutes(24 * 60, now), status: "SCHEDULED", notes: "System design and product sense." },
      { id: "int-trey-screen", applicationId: "app-trey", round: "Recruiter screen", scheduledAt: addMinutes(-1 * 24 * 60, now), status: "COMPLETED", notes: "Send thank-you note." }
    ];
    this.offers = [
      { id: "offer-fabrikam", applicationId: "app-fabrikam", salary: 190000, bonus: 25000, deadlineAt: addMinutes(3 * 24 * 60, now), status: "NEGOTIATING", notes: "Ask for remote flexibility." }
    ];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanApplications(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { applications: this.applications.length, interviews: this.interviews.length, offers: this.offers.length, alerts: this.alerts.length });
  }

  application(idValue: string, company: string, role: string, source: string, location: string, salaryMin: number, salaryMax: number, status: ApplicationStatus, priority: ApplicationPriority, nextActionAt: string, lastContactAt: string, resumeVersion: string, updatedAt: string, notes: string): JobApplication {
    return { id: idValue, company, role, source, location, salaryMin, salaryMax, status, priority, nextActionAt: iso(nextActionAt), lastContactAt: iso(lastContactAt), resumeVersion, postingFingerprint: postingFingerprint(company, role, location), updatedAt: iso(updatedAt), notes };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  applicationById(applicationId: string) {
    const application = this.applications.find((candidate) => candidate.id === applicationId);
    if (!application) throw new Error("job application not found");
    return application;
  }

  ingest(input: ApplicationEventInput) {
    let application = this.applications.find((candidate) => candidate.id === input.applicationId);
    const eventKey = applicationEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!application && input.type !== "APPLICATION_ADDED") throw new Error("job application not found");
    if (!application) {
      application = this.application(
        input.applicationId,
        input.company || "New Company",
        input.role || "Open Role",
        input.source || "Manual",
        input.location || "Remote",
        input.salaryMin || 0,
        input.salaryMax || 0,
        input.status || "SAVED",
        input.priority || "MEDIUM",
        input.nextActionAt || addMinutes(7 * 24 * 60, occurredAt),
        input.lastContactAt || occurredAt,
        input.resumeVersion || "default",
        occurredAt,
        input.notes || ""
      );
      this.applications.push(application);
    }

    const event: ApplicationEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      applicationId: input.applicationId,
      type: input.type,
      occurredAt,
      company: input.company || application.company,
      role: input.role || application.role,
      source: input.source || application.source,
      location: input.location || application.location,
      salaryMin: input.salaryMin ?? application.salaryMin,
      salaryMax: input.salaryMax ?? application.salaryMax,
      status: input.status || application.status,
      priority: input.priority || application.priority,
      nextActionAt: input.nextActionAt ? iso(input.nextActionAt) : application.nextActionAt,
      lastContactAt: input.lastContactAt ? iso(input.lastContactAt) : application.lastContactAt,
      resumeVersion: input.resumeVersion || application.resumeVersion,
      postingFingerprint: postingFingerprint(input.company || application.company, input.role || application.role, input.location || application.location),
      round: input.round || "",
      scheduledAt: input.scheduledAt ? iso(input.scheduledAt) : application.nextActionAt,
      offerSalary: input.offerSalary || 0,
      offerBonus: input.offerBonus || 0,
      offerDeadlineAt: input.offerDeadlineAt ? iso(input.offerDeadlineAt) : application.nextActionAt,
      notes: input.notes || "",
      eventSource: input.eventSource || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(application.updatedAt).getTime();
    if (!staleUpdate) {
      if (event.type === "APPLICATION_ADDED" || event.type === "APPLICATION_UPDATED" || event.type === "STATUS_CHANGED") this.applyEventToApplication(application, event, event.status);
      if (event.type === "INTERVIEW_SCHEDULED") { this.applyEventToApplication(application, { ...event, nextActionAt: event.scheduledAt, lastContactAt: event.occurredAt }, "INTERVIEW"); this.scheduleInterview(application.id, event.round || "Interview", event.scheduledAt, "SCHEDULED", event.notes); }
      if (event.type === "INTERVIEW_COMPLETED") { this.completeInterview(application.id, event.round || "Interview", occurredAt, event.notes); application.status = "INTERVIEW"; application.lastContactAt = occurredAt; application.updatedAt = occurredAt; }
      if (event.type === "FOLLOW_UP_LOGGED") { application.status = "APPLIED"; application.lastContactAt = occurredAt; application.nextActionAt = event.nextActionAt; application.updatedAt = occurredAt; }
      if (event.type === "OFFER_RECEIVED") { this.applyEventToApplication(application, event, "OFFER"); this.addOffer(application.id, event.offerSalary, event.offerBonus, event.offerDeadlineAt, event.notes); }
      if (event.type === "OFFER_UPDATED") { this.updateOffer(application.id, event.offerSalary, event.offerBonus, event.offerDeadlineAt, event.notes); application.updatedAt = occurredAt; }
      if (event.type === "REJECTION_RECEIVED") this.applyEventToApplication(application, event, "REJECTED");
      if (event.type === "APPLICATION_WITHDRAWN") this.applyEventToApplication(application, event, "WITHDRAWN");
      if (event.type === "RESUME_ATTACHED") { application.resumeVersion = event.resumeVersion; application.updatedAt = occurredAt; }
    }

    this.detectDuplicatePosting(application);
    this.scanApplications(occurredAt);
    this.createAudit(staleUpdate ? "STALE_APPLICATION_EVENT_IGNORED" : "APPLICATION_EVENT_INGESTED", { eventId: event.id, applicationId: application.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyEventToApplication(application: JobApplication, event: ApplicationEvent, status: ApplicationStatus) {
    application.company = event.company;
    application.role = event.role;
    application.source = event.source;
    application.location = event.location;
    application.salaryMin = event.salaryMin;
    application.salaryMax = event.salaryMax;
    application.status = status;
    application.priority = event.priority;
    application.nextActionAt = event.nextActionAt;
    application.lastContactAt = event.lastContactAt;
    application.resumeVersion = event.resumeVersion;
    application.postingFingerprint = event.postingFingerprint;
    application.updatedAt = event.occurredAt;
    application.notes = event.notes || application.notes;
  }

  scheduleInterview(applicationId: string, round: string, scheduledAt: string, status: Interview["status"], notes: string) {
    const existing = this.interviews.find((interview) => interview.applicationId === applicationId && interview.round === round && interview.scheduledAt === scheduledAt);
    if (existing) return existing;
    const interview: Interview = { id: id("interview"), applicationId, round, scheduledAt: iso(scheduledAt), status, notes };
    this.interviews.unshift(interview);
    return interview;
  }

  completeInterview(applicationId: string, round: string, completedAt: string, notes: string) {
    const interview = this.interviews.find((candidate) => candidate.applicationId === applicationId && candidate.round === round && candidate.status === "SCHEDULED");
    if (interview) { interview.status = "COMPLETED"; interview.notes = notes || interview.notes; }
    else this.scheduleInterview(applicationId, round, completedAt, "COMPLETED", notes);
    this.ensureAlert(this.applicationById(applicationId), "THANK_YOU_DUE", `thank-you:${applicationId}:${round}:${iso(completedAt).slice(0, 10)}`);
  }

  addOffer(applicationId: string, salary: number, bonus: number, deadlineAt: string, notes: string): Offer {
    const existing = this.offers.find((offer) => offer.applicationId === applicationId && offer.status !== "DECLINED");
    if (existing) return this.updateOffer(applicationId, salary, bonus, deadlineAt, notes);
    const offer: Offer = { id: id("offer"), applicationId, salary, bonus, deadlineAt: iso(deadlineAt), status: "NEGOTIATING", notes };
    this.offers.unshift(offer);
    return offer;
  }

  updateOffer(applicationId: string, salary: number, bonus: number, deadlineAt: string, notes: string): Offer {
    const offer = this.offers.find((candidate) => candidate.applicationId === applicationId);
    if (!offer) return this.addOffer(applicationId, salary, bonus, deadlineAt, notes);
    offer.salary = salary || offer.salary;
    offer.bonus = bonus || offer.bonus;
    offer.deadlineAt = iso(deadlineAt || offer.deadlineAt);
    offer.notes = notes || offer.notes;
    return offer;
  }

  detectDuplicatePosting(application: JobApplication) {
    const duplicateOf = this.applications.find((candidate) => candidate.id !== application.id && candidate.postingFingerprint === application.postingFingerprint && !["REJECTED", "WITHDRAWN"].includes(candidate.status));
    if (!duplicateOf) return null;
    application.status = "DUPLICATE";
    this.ensureAlert(application, "DUPLICATE_POSTING", `duplicate:${application.postingFingerprint}`);
    this.createAudit("DUPLICATE_POSTING_DETECTED", { applicationId: application.id, duplicateOf: duplicateOf.id });
    return duplicateOf;
  }

  scanApplications(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const application of this.applications) {
      if (["REJECTED", "WITHDRAWN", "DUPLICATE"].includes(application.status)) continue;
      const nextActionMinutes = (new Date(application.nextActionAt).getTime() - now) / 60_000;
      const lastContactAgeMinutes = (now - new Date(application.lastContactAt).getTime()) / 60_000;
      if (nextActionMinutes <= 0 && ["SAVED", "APPLIED", "SCREEN", "INTERVIEW", "FOLLOW_UP_DUE"].includes(application.status)) {
        application.status = "FOLLOW_UP_DUE";
        this.ensureAlert(application, "FOLLOW_UP_DUE", `follow-up:${application.id}:${application.nextActionAt.slice(0, 10)}`);
      }
      if (lastContactAgeMinutes > 14 * 24 * 60 && ["APPLIED", "SCREEN"].includes(application.status)) {
        application.status = "STALE";
        this.ensureAlert(application, "STALE_APPLICATION", `stale:${application.id}:${application.lastContactAt.slice(0, 10)}`);
      }
    }
    for (const interview of this.interviews.filter((candidate) => candidate.status === "SCHEDULED")) {
      const minutesUntil = (new Date(interview.scheduledAt).getTime() - now) / 60_000;
      if (minutesUntil >= 0 && minutesUntil <= 48 * 60) this.ensureAlert(this.applicationById(interview.applicationId), "INTERVIEW_UPCOMING", `interview:${interview.id}:${interview.scheduledAt.slice(0, 13)}`);
    }
    for (const offer of this.offers.filter((candidate) => candidate.status === "PENDING" || candidate.status === "NEGOTIATING")) {
      const minutesUntil = (new Date(offer.deadlineAt).getTime() - now) / 60_000;
      if (minutesUntil <= 5 * 24 * 60) this.ensureAlert(this.applicationById(offer.applicationId), "OFFER_DEADLINE", `offer:${offer.id}:${offer.deadlineAt.slice(0, 10)}`);
    }
    return { alerts: this.alerts.length };
  }

  reviewOffers() {
    let reviewed = 0;
    for (const offer of this.offers.filter((candidate) => candidate.status === "PENDING")) {
      offer.status = "NEGOTIATING";
      reviewed += 1;
    }
    return reviewed;
  }

  searchScore() {
    if (this.applications.length === 0) return 100;
    const active = this.applications.filter((application) => ["APPLIED", "SCREEN", "INTERVIEW", "OFFER"].includes(application.status)).length;
    return Math.round((active / this.applications.length) * 100);
  }

  ensureAlert(application: JobApplication, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), applicationId: application.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 730, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated recruiting reminder provider timeout"; return { processed: true, job }; }
    if (job.kind === "APPLICATION_SCAN") this.scanApplications();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchAlerts();
    if (job.kind === "OFFER_REVIEW") this.reviewOffers();
    if (job.kind === "RETENTION") this.retain(730);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { applications: [...this.applications].sort((a, b) => a.company.localeCompare(b.company) || a.role.localeCompare(b.role)), interviews: this.interviews, offers: this.offers, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, metrics: { score: this.searchScore(), total: this.applications.length, active: this.applications.filter((application) => ["APPLIED", "SCREEN", "INTERVIEW", "OFFER"].includes(application.status)).length, followUps: this.applications.filter((application) => application.status === "FOLLOW_UP_DUE").length, interviews: this.interviews.filter((interview) => interview.status === "SCHEDULED").length, offers: this.offers.filter((offer) => offer.status === "PENDING" || offer.status === "NEGOTIATING").length, stale: this.applications.filter((application) => application.status === "STALE").length, duplicates: this.applications.filter((application) => application.status === "DUPLICATE").length, rejected: this.applications.filter((application) => application.status === "REJECTED").length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { applications: this.applications, interviews: this.interviews, offers: this.offers, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.applications = state.applications as JobApplication[]; this.interviews = state.interviews as Interview[] || []; this.offers = state.offers as Offer[] || []; this.events = state.events as ApplicationEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededJobTracker(now: Date = new Date()) { const tracker = new JobApplicationTracker(); tracker.seed(now); return tracker; }
