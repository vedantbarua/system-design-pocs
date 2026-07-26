import crypto from "node:crypto";

export type TransactionCategory = "GROCERY" | "DINING" | "TRAVEL" | "ELECTRONICS" | "JEWELRY" | "GAS" | "SUBSCRIPTION" | "CASH" | "OTHER";
export type TransactionStatus = "AUTHORIZED" | "SETTLED" | "DECLINED" | "BLOCKED" | "SAFE" | "DISPUTED";
export type FraudEventType = "TRANSACTION_AUTHORIZED" | "TRANSACTION_SETTLED" | "TRANSACTION_DECLINED" | "TRANSACTION_MARKED_SAFE" | "DISPUTE_OPENED" | "CARD_FROZEN" | "CARD_UNFROZEN" | "RISK_SCAN";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Card = {
  id: string;
  nickname: string;
  holder: string;
  last4: string;
  homeCountry: string;
  frozen: boolean;
  dailyLimit: number;
  updatedAt: string;
};

export type Transaction = {
  id: string;
  cardId: string;
  merchant: string;
  category: TransactionCategory;
  amount: number;
  currency: string;
  city: string;
  country: string;
  occurredAt: string;
  status: TransactionStatus;
  riskScore: number;
  riskReasons: string[];
  fingerprint: string;
  updatedAt: string;
};

export type FraudRules = {
  largeAmount: number;
  velocityCount: number;
  velocityMinutes: number;
  highRiskCategories: TransactionCategory[];
};

export type FraudEventInput = {
  eventId: string;
  transactionId: string;
  type: FraudEventType;
  occurredAt?: string;
  cardId?: string;
  merchant?: string;
  category?: TransactionCategory;
  amount?: number;
  currency?: string;
  city?: string;
  country?: string;
  status?: TransactionStatus;
  notes?: string;
  source?: string;
};

export type FraudEvent = Required<Omit<FraudEventInput, "occurredAt" | "cardId" | "merchant" | "category" | "amount" | "currency" | "city" | "country" | "status" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  cardId: string;
  merchant: string;
  category: TransactionCategory;
  amount: number;
  currency: string;
  city: string;
  country: string;
  status: TransactionStatus;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  transactionId: string;
  kind: "DUPLICATE_TRANSACTION" | "VELOCITY_SPIKE" | "LARGE_TRANSACTION" | "LOCATION_ANOMALY" | "MERCHANT_ANOMALY" | "HIGH_RISK" | "CARD_FROZEN" | "DISPUTE_OPEN";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "RISK_SCAN" | "VELOCITY_REBUILD" | "ALERT_DISPATCH" | "RETENTION";
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

export function fraudEventKey(input: Pick<FraudEventInput, "transactionId" | "eventId">) {
  if (!input.transactionId || !input.eventId) throw new Error("transactionId and eventId are required");
  return `${input.transactionId}:${input.eventId}`;
}

export function transactionFingerprint(input: Pick<Transaction, "cardId" | "merchant" | "amount" | "currency" | "occurredAt">) {
  const minute = iso(input.occurredAt).slice(0, 16);
  return `${input.cardId}:${input.merchant.trim().toLowerCase().replace(/\s+/g, " ")}:${input.amount.toFixed(2)}:${input.currency}:${minute}`;
}

export class TransactionFraudWatch {
  cards: Card[] = [];
  transactions: Transaction[] = [];
  rules: FraudRules = { largeAmount: 500, velocityCount: 3, velocityMinutes: 15, highRiskCategories: ["JEWELRY", "ELECTRONICS", "CASH"] };
  events: FraudEvent[] = [];
  alerts: Alert[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.cards = [
      { id: "card-primary", nickname: "Everyday Visa", holder: "Ava", last4: "4242", homeCountry: "US", frozen: false, dailyLimit: 2500, updatedAt: iso(now) },
      { id: "card-travel", nickname: "Travel Mastercard", holder: "Ava", last4: "1881", homeCountry: "US", frozen: false, dailyLimit: 5000, updatedAt: iso(now) }
    ];
    this.transactions = [
      this.tx("tx-coffee", "card-primary", "Blue Bottle", "DINING", 6.75, "USD", "Chicago", "US", addMinutes(-90, now), "SETTLED", addMinutes(-89, now)),
      this.tx("tx-grocery", "card-primary", "Neighborhood Market", "GROCERY", 84.23, "USD", "Chicago", "US", addMinutes(-70, now), "AUTHORIZED", addMinutes(-69, now)),
      this.tx("tx-laptop", "card-primary", "TechSquare", "ELECTRONICS", 1299.99, "USD", "Chicago", "US", addMinutes(-40, now), "AUTHORIZED", addMinutes(-39, now)),
      this.tx("tx-paris", "card-primary", "Paris Boutique", "JEWELRY", 780, "EUR", "Paris", "FR", addMinutes(-25, now), "AUTHORIZED", addMinutes(-24, now)),
      this.tx("tx-gas", "card-travel", "FuelStop", "GAS", 48.1, "USD", "Milwaukee", "US", addMinutes(-10, now), "AUTHORIZED", addMinutes(-9, now))
    ];
    this.events = [];
    this.alerts = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanRisk(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { cards: this.cards.length, transactions: this.transactions.length, alerts: this.alerts.length });
  }

  tx(idValue: string, cardId: string, merchant: string, category: TransactionCategory, amount: number, currency: string, city: string, country: string, occurredAt: string, status: TransactionStatus, updatedAt: string): Transaction {
    const tx = { id: idValue, cardId, merchant, category, amount, currency, city, country, occurredAt: iso(occurredAt), status, riskScore: 0, riskReasons: [] as string[], fingerprint: "", updatedAt: iso(updatedAt) };
    tx.fingerprint = transactionFingerprint(tx);
    return tx;
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  cardById(cardId: string) {
    const card = this.cards.find((candidate) => candidate.id === cardId);
    if (!card) throw new Error("card not found");
    return card;
  }

  transactionById(transactionId: string) {
    const tx = this.transactions.find((candidate) => candidate.id === transactionId);
    if (!tx) throw new Error("transaction not found");
    return tx;
  }

  ingest(input: FraudEventInput) {
    let tx = this.transactions.find((candidate) => candidate.id === input.transactionId);
    const eventKey = fraudEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    if (!tx && input.type !== "TRANSACTION_AUTHORIZED" && input.type !== "TRANSACTION_DECLINED") throw new Error("transaction not found");
    if (!tx) {
      tx = this.tx(input.transactionId, input.cardId || "card-primary", input.merchant || "Unknown merchant", input.category || "OTHER", input.amount || 0, input.currency || "USD", input.city || "Unknown", input.country || "US", occurredAt, input.type === "TRANSACTION_DECLINED" ? "DECLINED" : "AUTHORIZED", occurredAt);
      this.transactions.push(tx);
    }

    const event: FraudEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      transactionId: input.transactionId,
      type: input.type,
      occurredAt,
      cardId: input.cardId || tx.cardId,
      merchant: input.merchant || tx.merchant,
      category: input.category || tx.category,
      amount: input.amount ?? tx.amount,
      currency: input.currency || tx.currency,
      city: input.city || tx.city,
      country: input.country || tx.country,
      status: input.status || tx.status,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(tx.updatedAt).getTime() && event.type !== "RISK_SCAN";
    if (!staleUpdate) {
      if (event.type === "TRANSACTION_AUTHORIZED") this.applyTransactionEvent(tx, event, "AUTHORIZED");
      if (event.type === "TRANSACTION_SETTLED") this.applyTransactionEvent(tx, event, "SETTLED");
      if (event.type === "TRANSACTION_DECLINED") this.applyTransactionEvent(tx, event, "DECLINED");
      if (event.type === "TRANSACTION_MARKED_SAFE") { tx.status = "SAFE"; tx.riskScore = 0; tx.riskReasons = ["user marked safe"]; tx.updatedAt = occurredAt; }
      if (event.type === "DISPUTE_OPENED") { tx.status = "DISPUTED"; tx.updatedAt = occurredAt; this.ensureAlert(tx, "DISPUTE_OPEN", `dispute:${tx.id}`); }
      if (event.type === "CARD_FROZEN") this.setCardFrozen(event.cardId, true, occurredAt, tx);
      if (event.type === "CARD_UNFROZEN") this.setCardFrozen(event.cardId, false, occurredAt, tx);
    }

    this.scanRisk(occurredAt);
    this.createAudit(staleUpdate ? "STALE_FRAUD_EVENT_IGNORED" : "FRAUD_EVENT_INGESTED", { eventId: event.id, transactionId: tx.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  applyTransactionEvent(tx: Transaction, event: FraudEvent, status: TransactionStatus) {
    tx.cardId = event.cardId;
    tx.merchant = event.merchant;
    tx.category = event.category;
    tx.amount = event.amount;
    tx.currency = event.currency;
    tx.city = event.city;
    tx.country = event.country;
    tx.occurredAt = event.occurredAt;
    tx.status = status;
    tx.fingerprint = transactionFingerprint(tx);
    tx.updatedAt = event.occurredAt;
  }

  setCardFrozen(cardId: string, frozen: boolean, at: string, tx: Transaction) {
    const card = this.cardById(cardId);
    card.frozen = frozen;
    card.updatedAt = iso(at);
    if (frozen) this.ensureAlert(tx, "CARD_FROZEN", `card-frozen:${card.id}:${at.slice(0, 13)}`);
    return card;
  }

  calculateRisk(tx: Transaction, asOf: string | Date = new Date()) {
    if (tx.status === "SAFE" || tx.status === "SETTLED") return { score: 0, reasons: tx.status === "SAFE" ? ["user marked safe"] : [] };
    const card = this.cardById(tx.cardId);
    const reasons: string[] = [];
    let score = 5;
    if (tx.amount >= this.rules.largeAmount) { score += 30; reasons.push("large amount"); }
    if (tx.country !== card.homeCountry) { score += 28; reasons.push("foreign location"); }
    if (this.rules.highRiskCategories.includes(tx.category)) { score += 18; reasons.push("high-risk category"); }
    if (card.frozen) { score += 45; reasons.push("card frozen"); }
    const sameWindow = this.velocityWindow(tx, asOf);
    if (sameWindow.length >= this.rules.velocityCount) { score += 25; reasons.push("velocity spike"); }
    if (this.transactions.some((candidate) => candidate.id !== tx.id && candidate.fingerprint === tx.fingerprint && candidate.status !== "DECLINED")) { score += 35; reasons.push("possible duplicate"); }
    if (tx.amount > card.dailyLimit) { score += 30; reasons.push("over card daily limit"); }
    return { score: Math.min(100, score), reasons };
  }

  velocityWindow(tx: Transaction, asOf: string | Date = tx.occurredAt) {
    const end = new Date(asOf).getTime();
    const start = end - this.rules.velocityMinutes * 60_000;
    return this.transactions.filter((candidate) => candidate.cardId === tx.cardId && candidate.status !== "DECLINED" && new Date(candidate.occurredAt).getTime() >= start && new Date(candidate.occurredAt).getTime() <= end);
  }

  scanRisk(asOf: string | Date = new Date()) {
    for (const tx of this.transactions) {
      const { score, reasons } = this.calculateRisk(tx, asOf);
      if (tx.status !== "SAFE" && tx.status !== "SETTLED") {
        tx.riskScore = score;
        tx.riskReasons = reasons;
      }
      if (tx.status === "DECLINED" || tx.status === "SAFE" || tx.status === "SETTLED") continue;
      if (tx.riskScore >= 70) this.ensureAlert(tx, "HIGH_RISK", `high-risk:${tx.id}`);
      if (tx.amount >= this.rules.largeAmount) this.ensureAlert(tx, "LARGE_TRANSACTION", `large:${tx.id}`);
      if (this.cardById(tx.cardId).homeCountry !== tx.country) this.ensureAlert(tx, "LOCATION_ANOMALY", `location:${tx.id}`);
      if (this.rules.highRiskCategories.includes(tx.category)) this.ensureAlert(tx, "MERCHANT_ANOMALY", `merchant:${tx.id}:${tx.category}`);
      if (this.velocityWindow(tx, tx.occurredAt).length >= this.rules.velocityCount) this.ensureAlert(tx, "VELOCITY_SPIKE", `velocity:${tx.cardId}:${tx.occurredAt.slice(0, 13)}`);
      if (this.transactions.some((candidate) => candidate.id !== tx.id && candidate.fingerprint === tx.fingerprint && candidate.status !== "DECLINED")) this.ensureAlert(tx, "DUPLICATE_TRANSACTION", `duplicate:${tx.fingerprint}`);
    }
    return { alerts: this.alerts.length };
  }

  ensureAlert(tx: Transaction, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), transactionId: tx.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  fraudScore() {
    const active = this.transactions.filter((tx) => !["SAFE", "SETTLED"].includes(tx.status));
    if (active.length === 0) return 100;
    const averageRisk = active.reduce((sum, tx) => sum + tx.riskScore, 0) / active.length;
    return Math.max(0, Math.round(100 - averageRisk));
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 365, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated fraud alert provider timeout"; return { processed: true, job }; }
    if (job.kind === "RISK_SCAN" || job.kind === "VELOCITY_REBUILD") this.scanRisk();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(365);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { const active = this.transactions.filter((tx) => !["SAFE", "SETTLED"].includes(tx.status)); return { cards: this.cards, transactions: [...this.transactions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), rules: this.rules, events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, jobs: this.jobs, audit: this.audit, metrics: { score: this.fraudScore(), cards: this.cards.length, frozenCards: this.cards.filter((card) => card.frozen).length, transactions: this.transactions.length, highRisk: active.filter((tx) => tx.riskScore >= 70).length, disputed: this.transactions.filter((tx) => tx.status === "DISPUTED").length, blocked: this.transactions.filter((tx) => tx.status === "BLOCKED").length, safe: this.transactions.filter((tx) => tx.status === "SAFE").length, duplicates: this.alerts.filter((alert) => alert.kind === "DUPLICATE_TRANSACTION").length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { cards: this.cards, transactions: this.transactions, rules: this.rules, events: this.events, alerts: this.alerts, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.cards = state.cards as Card[]; this.transactions = state.transactions as Transaction[]; this.rules = state.rules as FraudRules; this.events = state.events as FraudEvent[]; this.alerts = state.alerts as Alert[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededFraudWatch(now: Date = new Date()) { const watch = new TransactionFraudWatch(); watch.seed(now); return watch; }
