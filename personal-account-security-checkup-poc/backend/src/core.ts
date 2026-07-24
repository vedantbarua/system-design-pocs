import crypto from "node:crypto";

export type AccountCategory = "EMAIL" | "BANKING" | "SOCIAL" | "SHOPPING" | "WORK" | "CLOUD" | "HEALTH" | "UTILITY" | "OTHER";
export type AccountStatus = "SECURE" | "MFA_MISSING" | "RECOVERY_INCOMPLETE" | "PASSWORD_STALE" | "BREACHED" | "DUPLICATE" | "ARCHIVED";
export type AccountEventType = "ACCOUNT_ADDED" | "ACCOUNT_UPDATED" | "MFA_ENABLED" | "MFA_DISABLED" | "RECOVERY_UPDATED" | "PASSWORD_ROTATED" | "BREACH_IMPORTED" | "SESSION_REVOKED" | "ACCOUNT_ARCHIVED" | "EXPORT_REQUESTED" | "SECURITY_SCAN";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Account = {
  id: string;
  provider: string;
  username: string;
  category: AccountCategory;
  domain: string;
  importance: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  mfaEnabled: boolean;
  mfaMethod: "NONE" | "SMS" | "TOTP" | "PASSKEY" | "HARDWARE_KEY";
  recoveryEmail: string;
  recoveryPhone: string;
  passwordLastChangedAt: string;
  lastLoginAt: string;
  activeSessions: number;
  riskScore: number;
  status: AccountStatus;
  updatedAt: string;
  notes: string;
};

export type BreachFinding = {
  id: string;
  accountId: string;
  source: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  detectedAt: string;
  resolvedAt: string | null;
};

export type RecoveryChecklist = {
  id: string;
  status: "QUEUED" | "READY";
  accountCount: number;
  highRiskCount: number;
  generatedAt: string;
  checksum: string;
};

export type AccountEventInput = {
  eventId: string;
  accountId: string;
  type: AccountEventType;
  occurredAt?: string;
  provider?: string;
  username?: string;
  category?: AccountCategory;
  domain?: string;
  importance?: Account["importance"];
  mfaEnabled?: boolean;
  mfaMethod?: Account["mfaMethod"];
  recoveryEmail?: string;
  recoveryPhone?: string;
  passwordLastChangedAt?: string;
  lastLoginAt?: string;
  activeSessions?: number;
  breachSource?: string;
  breachSeverity?: BreachFinding["severity"];
  notes?: string;
  source?: string;
};

export type AccountEvent = Required<Omit<AccountEventInput, "occurredAt" | "provider" | "username" | "category" | "domain" | "importance" | "mfaEnabled" | "mfaMethod" | "recoveryEmail" | "recoveryPhone" | "passwordLastChangedAt" | "lastLoginAt" | "activeSessions" | "breachSource" | "breachSeverity" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  provider: string;
  username: string;
  category: AccountCategory;
  domain: string;
  importance: Account["importance"];
  mfaEnabled: boolean;
  mfaMethod: Account["mfaMethod"];
  recoveryEmail: string;
  recoveryPhone: string;
  passwordLastChangedAt: string;
  lastLoginAt: string;
  activeSessions: number;
  breachSource: string;
  breachSeverity: BreachFinding["severity"];
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  accountId: string;
  kind: "MFA_MISSING" | "RECOVERY_INCOMPLETE" | "PASSWORD_STALE" | "BREACH_OPEN" | "DUPLICATE_ACCOUNT" | "SESSION_SPIKE" | "CHECKLIST_READY";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "SECURITY_SCAN" | "BREACH_IMPORT" | "CHECKLIST_EXPORT" | "REMINDER_DISPATCH" | "RETENTION";
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

export function accountEventKey(input: Pick<AccountEventInput, "accountId" | "eventId">) {
  if (!input.accountId || !input.eventId) throw new Error("accountId and eventId are required");
  return `${input.accountId}:${input.eventId}`;
}

export function accountFingerprint(input: Pick<Account, "domain" | "username">) {
  return `${input.domain.trim().toLowerCase()}:${input.username.trim().toLowerCase()}`;
}

export function checksum(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export class AccountSecurityCheckup {
  accounts: Account[] = [];
  breaches: BreachFinding[] = [];
  checklists: RecoveryChecklist[] = [];
  events: AccountEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.accounts = [
      this.account("acct-email", "Gmail", "ava@example.com", "EMAIL", "google.com", "CRITICAL", true, "PASSKEY", "backup@example.com", "+15551234567", addMinutes(-60 * 24 * 60, now), addMinutes(-1 * 24 * 60, now), 3, "SECURE", addMinutes(-3 * 24 * 60, now), "Primary email and recovery anchor."),
      this.account("acct-bank", "Everyday Bank", "ava", "BANKING", "everydaybank.test", "CRITICAL", false, "NONE", "ava@example.com", "", addMinutes(-260 * 24 * 60, now), addMinutes(-8 * 24 * 60, now), 2, "MFA_MISSING", addMinutes(-20 * 24 * 60, now), "Needs TOTP or passkey."),
      this.account("acct-shop", "MegaShop", "ava@example.com", "SHOPPING", "megashop.test", "MEDIUM", true, "SMS", "", "", addMinutes(-420 * 24 * 60, now), addMinutes(-90 * 24 * 60, now), 5, "RECOVERY_INCOMPLETE", addMinutes(-220 * 24 * 60, now), "Old shopping account."),
      this.account("acct-cloud", "CloudBox", "ava.dev", "CLOUD", "cloudbox.test", "HIGH", true, "TOTP", "ava@example.com", "+15551234567", addMinutes(-40 * 24 * 60, now), addMinutes(-4 * 24 * 60, now), 9, "SECURE", addMinutes(-5 * 24 * 60, now), "High session count."),
      this.account("acct-social", "Chatter", "ava", "SOCIAL", "chatter.test", "LOW", false, "NONE", "", "", addMinutes(-700 * 24 * 60, now), addMinutes(-400 * 24 * 60, now), 1, "PASSWORD_STALE", addMinutes(-380 * 24 * 60, now), "Consider closing.")
    ];
    this.breaches = [
      { id: "breach-shop", accountId: "acct-shop", source: "public breach import", severity: "HIGH", detectedAt: addMinutes(-15 * 24 * 60, now), resolvedAt: null }
    ];
    this.checklists = [];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanSecurity(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { accounts: this.accounts.length, breaches: this.breaches.length, alerts: this.alerts.length });
  }

  account(idValue: string, provider: string, username: string, category: AccountCategory, domain: string, importance: Account["importance"], mfaEnabled: boolean, mfaMethod: Account["mfaMethod"], recoveryEmail: string, recoveryPhone: string, passwordLastChangedAt: string, lastLoginAt: string, activeSessions: number, status: AccountStatus, updatedAt: string, notes: string): Account {
    const account = { id: idValue, provider, username, category, domain, importance, mfaEnabled, mfaMethod, recoveryEmail, recoveryPhone, passwordLastChangedAt: iso(passwordLastChangedAt), lastLoginAt: iso(lastLoginAt), activeSessions, riskScore: 0, status, updatedAt: iso(updatedAt), notes };
    account.riskScore = this.calculateRisk(account);
    return account;
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  accountById(accountId: string) {
    const account = this.accounts.find((candidate) => candidate.id === accountId);
    if (!account) throw new Error("account not found");
    return account;
  }

  ingest(input: AccountEventInput) {
    let account = this.accounts.find((candidate) => candidate.id === input.accountId);
    const eventKey = accountEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!account && input.type !== "ACCOUNT_ADDED") throw new Error("account not found");
    if (!account) {
      account = this.account(input.accountId, input.provider || "New account", input.username || "unknown", input.category || "OTHER", input.domain || "unknown.local", input.importance || "LOW", input.mfaEnabled || false, input.mfaMethod || "NONE", input.recoveryEmail || "", input.recoveryPhone || "", input.passwordLastChangedAt || occurredAt, input.lastLoginAt || occurredAt, input.activeSessions || 1, "SECURE", occurredAt, input.notes || "");
      this.accounts.push(account);
    }

    const event: AccountEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      accountId: input.accountId,
      type: input.type,
      occurredAt,
      provider: input.provider || account.provider,
      username: input.username || account.username,
      category: input.category || account.category,
      domain: input.domain || account.domain,
      importance: input.importance || account.importance,
      mfaEnabled: input.mfaEnabled ?? account.mfaEnabled,
      mfaMethod: input.mfaMethod || account.mfaMethod,
      recoveryEmail: input.recoveryEmail ?? account.recoveryEmail,
      recoveryPhone: input.recoveryPhone ?? account.recoveryPhone,
      passwordLastChangedAt: input.passwordLastChangedAt ? iso(input.passwordLastChangedAt) : account.passwordLastChangedAt,
      lastLoginAt: input.lastLoginAt ? iso(input.lastLoginAt) : account.lastLoginAt,
      activeSessions: input.activeSessions ?? account.activeSessions,
      breachSource: input.breachSource || "manual import",
      breachSeverity: input.breachSeverity || "HIGH",
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(account.updatedAt).getTime() && event.type !== "SECURITY_SCAN";
    if (!staleUpdate) {
      if (event.type === "ACCOUNT_ADDED" || event.type === "ACCOUNT_UPDATED") this.applyEventToAccount(account, event);
      if (event.type === "MFA_ENABLED") { account.mfaEnabled = true; account.mfaMethod = event.mfaMethod === "NONE" ? "TOTP" : event.mfaMethod; account.updatedAt = occurredAt; }
      if (event.type === "MFA_DISABLED") { account.mfaEnabled = false; account.mfaMethod = "NONE"; account.updatedAt = occurredAt; }
      if (event.type === "RECOVERY_UPDATED") { account.recoveryEmail = event.recoveryEmail; account.recoveryPhone = event.recoveryPhone; account.updatedAt = occurredAt; }
      if (event.type === "PASSWORD_ROTATED") { account.passwordLastChangedAt = occurredAt; account.updatedAt = occurredAt; }
      if (event.type === "SESSION_REVOKED") { account.activeSessions = Math.max(0, account.activeSessions - 1); account.updatedAt = occurredAt; }
      if (event.type === "BREACH_IMPORTED") this.importBreach(account, event);
      if (event.type === "ACCOUNT_ARCHIVED") { account.status = "ARCHIVED"; account.updatedAt = occurredAt; }
      if (event.type === "EXPORT_REQUESTED") this.generateChecklist(occurredAt);
    }

    this.scanSecurity(occurredAt);
    this.createAudit(staleUpdate ? "STALE_ACCOUNT_EVENT_IGNORED" : "ACCOUNT_EVENT_INGESTED", { eventId: event.id, accountId: account.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyEventToAccount(account: Account, event: AccountEvent) {
    account.provider = event.provider;
    account.username = event.username;
    account.category = event.category;
    account.domain = event.domain;
    account.importance = event.importance;
    account.mfaEnabled = event.mfaEnabled;
    account.mfaMethod = event.mfaMethod;
    account.recoveryEmail = event.recoveryEmail;
    account.recoveryPhone = event.recoveryPhone;
    account.passwordLastChangedAt = event.passwordLastChangedAt;
    account.lastLoginAt = event.lastLoginAt;
    account.activeSessions = event.activeSessions;
    account.updatedAt = event.occurredAt;
    account.notes = event.notes || account.notes;
  }

  importBreach(account: Account, event: AccountEvent) {
    const existing = this.breaches.find((breach) => breach.accountId === account.id && breach.source === event.breachSource && breach.resolvedAt === null);
    if (!existing) this.breaches.unshift({ id: id("breach"), accountId: account.id, source: event.breachSource, severity: event.breachSeverity, detectedAt: event.occurredAt, resolvedAt: null });
    account.updatedAt = event.occurredAt;
  }

  calculateRisk(account: Account, asOf: string | Date = new Date()) {
    if (account.status === "ARCHIVED") return 0;
    const ageDays = (new Date(asOf).getTime() - new Date(account.passwordLastChangedAt).getTime()) / 86_400_000;
    const loginAgeDays = (new Date(asOf).getTime() - new Date(account.lastLoginAt).getTime()) / 86_400_000;
    const importance = { LOW: 5, MEDIUM: 10, HIGH: 18, CRITICAL: 25 }[account.importance];
    let risk = importance;
    if (!account.mfaEnabled) risk += account.importance === "CRITICAL" ? 35 : 25;
    if (account.mfaMethod === "SMS") risk += 8;
    if (!account.recoveryEmail || !account.recoveryPhone) risk += 15;
    if (ageDays > 180) risk += 20;
    if (loginAgeDays > 365) risk += 10;
    if (account.activeSessions > 6) risk += 12;
    if (this.breaches.some((breach) => breach.accountId === account.id && breach.resolvedAt === null)) risk += 30;
    return Math.min(100, Math.round(risk));
  }

  scanSecurity(asOf: string | Date = new Date()) {
    const fingerprints = new Map<string, Account>();
    for (const account of this.accounts) {
      if (account.status === "ARCHIVED") continue;
      const fingerprint = accountFingerprint(account);
      const duplicate = fingerprints.get(fingerprint);
      const passwordAgeDays = (new Date(asOf).getTime() - new Date(account.passwordLastChangedAt).getTime()) / 86_400_000;

      account.riskScore = this.calculateRisk(account, asOf);
      if (duplicate) {
        account.status = "DUPLICATE";
        this.ensureAlert(account, "DUPLICATE_ACCOUNT", `duplicate:${fingerprint}`);
      } else {
        fingerprints.set(fingerprint, account);
        if (this.breaches.some((breach) => breach.accountId === account.id && breach.resolvedAt === null)) account.status = "BREACHED";
        else if (!account.mfaEnabled) account.status = "MFA_MISSING";
        else if (!account.recoveryEmail || !account.recoveryPhone) account.status = "RECOVERY_INCOMPLETE";
        else if (passwordAgeDays > 180) account.status = "PASSWORD_STALE";
        else account.status = "SECURE";
      }

      if (!account.mfaEnabled) this.ensureAlert(account, "MFA_MISSING", `mfa:${account.id}`);
      if (!account.recoveryEmail || !account.recoveryPhone) this.ensureAlert(account, "RECOVERY_INCOMPLETE", `recovery:${account.id}`);
      if (passwordAgeDays > 180) this.ensureAlert(account, "PASSWORD_STALE", `password:${account.id}`);
      if (this.breaches.some((breach) => breach.accountId === account.id && breach.resolvedAt === null)) this.ensureAlert(account, "BREACH_OPEN", `breach:${account.id}`);
      if (account.activeSessions > 6) this.ensureAlert(account, "SESSION_SPIKE", `sessions:${account.id}`);
    }
    return { alerts: this.alerts.length };
  }

  ensureAlert(account: Account, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), accountId: account.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  generateChecklist(at: string | Date = new Date()) {
    const active = this.accounts.filter((account) => account.status !== "ARCHIVED");
    const checklist: RecoveryChecklist = { id: id("checklist"), status: "READY", accountCount: active.length, highRiskCount: active.filter((account) => account.riskScore >= 60).length, generatedAt: iso(at), checksum: checksum(active.map((account) => ({ id: account.id, domain: account.domain, username: account.username, status: account.status, riskScore: account.riskScore }))) };
    this.checklists.unshift(checklist);
    this.ensureAlert(active[0] || this.accounts[0], "CHECKLIST_READY", `checklist:${checklist.id}`);
    return checklist;
  }

  securityScore() {
    const active = this.accounts.filter((account) => account.status !== "ARCHIVED");
    if (active.length === 0) return 100;
    const averageRisk = active.reduce((sum, account) => sum + account.riskScore, 0) / active.length;
    return Math.max(0, Math.round(100 - averageRisk));
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated breach import provider timeout"; return { processed: true, job }; }
    if (job.kind === "SECURITY_SCAN") this.scanSecurity();
    if (job.kind === "BREACH_IMPORT") this.simulateBreachImport();
    if (job.kind === "CHECKLIST_EXPORT") this.generateChecklist();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  simulateBreachImport() { const target = this.accounts.find((account) => account.status !== "ARCHIVED" && !this.breaches.some((breach) => breach.accountId === account.id && breach.resolvedAt === null)); if (!target) return null; this.breaches.unshift({ id: id("breach"), accountId: target.id, source: "scheduled breach feed", severity: "MEDIUM", detectedAt: iso(), resolvedAt: null }); this.scanSecurity(); return target; }
  snapshot() { const active = this.accounts.filter((account) => account.status !== "ARCHIVED"); return { accounts: [...this.accounts].sort((a, b) => b.riskScore - a.riskScore || a.provider.localeCompare(b.provider)), breaches: this.breaches, checklists: this.checklists, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, metrics: { score: this.securityScore(), accounts: active.length, critical: active.filter((account) => account.importance === "CRITICAL").length, mfaMissing: active.filter((account) => account.status === "MFA_MISSING").length, recoveryGaps: active.filter((account) => account.status === "RECOVERY_INCOMPLETE").length, stalePasswords: active.filter((account) => account.status === "PASSWORD_STALE").length, breached: active.filter((account) => account.status === "BREACHED").length, duplicates: active.filter((account) => account.status === "DUPLICATE").length, highRisk: active.filter((account) => account.riskScore >= 60).length, checklists: this.checklists.length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { accounts: this.accounts, breaches: this.breaches, checklists: this.checklists, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.accounts = state.accounts as Account[]; this.breaches = state.breaches as BreachFinding[] || []; this.checklists = state.checklists as RecoveryChecklist[] || []; this.events = state.events as AccountEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededAccountSecurity(now: Date = new Date()) { const security = new AccountSecurityCheckup(); security.seed(now); return security; }
