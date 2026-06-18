import crypto from "node:crypto";

export type DocumentKind = "note" | "pdf" | "bookmark" | "snippet";
export type Visibility = "private" | "shared" | "work";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";
export type EventSource = "seed" | "api" | "kafka" | "replay";

export type KnowledgeDocument = {
  id: string;
  eventId: string;
  eventKey: string;
  title: string;
  path: string;
  kind: DocumentKind;
  visibility: Visibility;
  owner: string;
  content: string;
  contentHash: string;
  tags: string[];
  version: number;
  source: EventSource;
  updatedAt: string;
  indexedAt: string | null;
  stale: boolean;
};

export type SearchIndexEntry = {
  documentId: string;
  tokens: string[];
  tokenCounts: Record<string, number>;
  embedding: number[];
  indexedAt: string;
};

export type IndexJob = {
  id: string;
  kind: "INDEX_DOCUMENT" | "REBUILD_INDEX" | "STALE_SCAN";
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  dedupeKey: string;
  payload: Record<string, string | number | boolean | string[]>;
  queuedAt: string;
  completedAt: string | null;
  lastError: string | null;
};

export type Grant = {
  id: string;
  documentId: string;
  principal: string;
  access: "read";
  expiresAt: string | null;
};

export type SearchAudit = {
  id: string;
  actor: string;
  query: string;
  mode: "keyword" | "semantic" | "hybrid";
  results: number;
  cached: boolean;
  at: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  at: string;
};

export type DocumentInput = {
  eventId?: string;
  title: string;
  path: string;
  kind: DocumentKind;
  visibility?: Visibility;
  owner?: string;
  content: string;
  tags?: string[];
  updatedAt?: string;
  source?: EventSource;
};

export type SearchResult = {
  document: KnowledgeDocument;
  score: number;
  reason: string;
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

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function eventKey(input: DocumentInput): string {
  return input.eventId ? `${input.path}:${input.eventId}` : `${input.path}:${sha256(input.content)}`;
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);
}

function vectorize(tokens: string[], dimensions = 8): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of tokens) {
    const bucket = Number.parseInt(sha256(token).slice(0, 8), 16) % dimensions;
    vector[bucket] += 1;
  }
  const length = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
  return vector.map((value) => Number((value / length).toFixed(4)));
}

function cosine(left: number[], right: number[]): number {
  return left.reduce((total, value, index) => total + value * (right[index] || 0), 0);
}

export class PersonalKnowledgeIndex {
  documents: KnowledgeDocument[] = [];
  index: SearchIndexEntry[] = [];
  jobs: IndexJob[] = [];
  grants: Grant[] = [];
  searchAudits: SearchAudit[] = [];
  audit: AuditEvent[] = [];
  processedEvents = new Set<string>();
  queryCache = new Map<string, SearchResult[]>();
  failNextJob = false;

  seed(): void {
    this.documents = [];
    this.index = [];
    this.jobs = [];
    this.grants = [];
    this.searchAudits = [];
    this.audit = [];
    this.processedEvents = new Set();
    this.queryCache = new Map();
    this.failNextJob = false;
    this.ingestDocument({ eventId: "seed-tax", title: "Tax checklist", path: "/Finance/tax-checklist.md", kind: "note", visibility: "private", owner: "vedant", content: "W2 forms mortgage interest receipts charitable donations filing deadline", tags: ["finance", "tax"], updatedAt: "2026-06-18T12:00:00Z", source: "seed" });
    this.ingestDocument({ eventId: "seed-travel", title: "Japan itinerary", path: "/Travel/japan.pdf", kind: "pdf", visibility: "shared", owner: "vedant", content: "Tokyo hotel reservation Kyoto train tickets ramen map passport checklist", tags: ["travel"], updatedAt: "2026-06-18T12:10:00Z", source: "seed" });
    this.ingestDocument({ eventId: "seed-work", title: "Kafka design notes", path: "/Work/kafka-design.md", kind: "note", visibility: "work", owner: "vedant", content: "Kafka partitions consumer groups replay offsets schema registry dead letter queues", tags: ["work", "systems"], updatedAt: "2026-06-18T12:20:00Z", source: "seed" });
    this.ingestDocument({ eventId: "seed-bookmark", title: "Recipe bookmark", path: "/Bookmarks/pasta.url", kind: "bookmark", visibility: "shared", owner: "vedant", content: "weeknight pasta recipe tomato garlic parmesan saved bookmark", tags: ["cooking"], updatedAt: "2026-06-18T12:30:00Z", source: "seed" });
    this.drainJobs();
    const travel = this.documents.find((doc) => doc.title === "Japan itinerary");
    if (travel) this.createGrant(travel.id, "maya", null);
    this.createAudit("DEMO_SEEDED", "system", { documents: this.documents.length, indexed: this.index.length });
  }

  createAudit(action: string, actor: string, details: Record<string, unknown>): AuditEvent {
    const event = { id: id("audit"), action, actor, details, at: iso() };
    this.audit.unshift(event);
    return event;
  }

  ingestDocument(input: DocumentInput): { duplicate: boolean; document?: KnowledgeDocument; job?: IndexJob; replaced?: string } {
    assertCondition(input.title, "title is required");
    assertCondition(input.path?.startsWith("/"), "path must be absolute");
    assertCondition(input.content, "content is required");
    const key = eventKey(input);
    if (this.processedEvents.has(key)) return { duplicate: true };
    const existing = this.documents.find((doc) => doc.path === input.path);
    const contentHash = sha256(input.content);
    if (existing && existing.contentHash === contentHash) {
      this.processedEvents.add(key);
      return { duplicate: true, document: existing };
    }
    const document: KnowledgeDocument = {
      id: existing?.id || id("doc"),
      eventId: input.eventId || key,
      eventKey: key,
      title: input.title,
      path: input.path,
      kind: input.kind,
      visibility: input.visibility || existing?.visibility || "private",
      owner: input.owner || existing?.owner || "vedant",
      content: input.content,
      contentHash,
      tags: input.tags || existing?.tags || [],
      version: (existing?.version || 0) + 1,
      source: input.source || "api",
      updatedAt: iso(input.updatedAt || new Date()),
      indexedAt: null,
      stale: true
    };
    if (existing) this.documents = this.documents.filter((doc) => doc.id !== existing.id);
    this.documents.push(document);
    this.index = this.index.filter((entry) => entry.documentId !== document.id);
    this.processedEvents.add(key);
    this.queryCache.clear();
    const job = this.ensureJob("INDEX_DOCUMENT", `${document.id}:v${document.version}:index`, { documentId: document.id });
    this.createAudit(existing ? "DOCUMENT_UPDATED" : "DOCUMENT_INGESTED", "document-ingest", { documentId: document.id, path: document.path, version: document.version });
    return { duplicate: false, document, job, replaced: existing?.id };
  }

  ensureJob(kind: IndexJob["kind"], dedupeKey: string, payload: IndexJob["payload"]): IndexJob {
    const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey);
    if (existing) return existing;
    const job: IndexJob = { id: id("job"), kind, status: "QUEUED", attempts: 0, maxAttempts: 3, dedupeKey, payload, queuedAt: iso(), completedAt: null, lastError: null };
    this.jobs.unshift(job);
    return job;
  }

  indexDocument(documentId: string): SearchIndexEntry {
    const document = this.documents.find((doc) => doc.id === documentId);
    assertCondition(document, "document not found");
    const tokens = tokenize(`${document.title} ${document.path} ${document.tags.join(" ")} ${document.content}`);
    const tokenCounts: Record<string, number> = {};
    for (const token of tokens) tokenCounts[token] = (tokenCounts[token] || 0) + 1;
    const entry: SearchIndexEntry = { documentId, tokens: [...new Set(tokens)], tokenCounts, embedding: vectorize(tokens), indexedAt: iso() };
    this.index = this.index.filter((item) => item.documentId !== documentId);
    this.index.push(entry);
    document.indexedAt = entry.indexedAt;
    document.stale = false;
    this.queryCache.clear();
    return entry;
  }

  dispatchNextJob(): { processed: boolean; job?: IndexJob } {
    const job = this.jobs.find((item) => item.status === "QUEUED" || item.status === "RETRY");
    if (!job) return { processed: false };
    job.status = "RUNNING";
    job.attempts += 1;
    if (this.failNextJob) {
      this.failNextJob = false;
      job.lastError = "simulated index writer timeout";
      job.status = job.attempts >= job.maxAttempts ? "DEAD" : "RETRY";
      this.createAudit("INDEX_JOB_RETRY", "worker:indexer", { jobId: job.id, kind: job.kind, attempts: job.attempts });
      return { processed: true, job };
    }
    if (job.kind === "INDEX_DOCUMENT") this.indexDocument(String(job.payload.documentId));
    if (job.kind === "REBUILD_INDEX") {
      this.index = [];
      for (const document of this.documents) this.indexDocument(document.id);
    }
    if (job.kind === "STALE_SCAN") this.scanStaleDocuments(Number(job.payload.maxAgeMinutes || 60));
    job.status = "COMPLETED";
    job.completedAt = iso();
    job.lastError = null;
    this.createAudit("INDEX_JOB_COMPLETED", "worker:indexer", { jobId: job.id, kind: job.kind });
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

  createGrant(documentId: string, principal: string, expiresAt: string | null): Grant {
    const document = this.documents.find((doc) => doc.id === documentId);
    assertCondition(document, "document not found");
    const existing = this.grants.find((grant) => grant.documentId === documentId && grant.principal === principal);
    if (existing) return existing;
    const grant: Grant = { id: id("grant"), documentId, principal, access: "read", expiresAt: expiresAt ? iso(expiresAt) : null };
    this.grants.push(grant);
    this.queryCache.clear();
    this.createAudit("ACCESS_GRANTED", "access-api", { documentId, principal });
    return grant;
  }

  canRead(document: KnowledgeDocument, actor: string): boolean {
    if (document.owner === actor) return true;
    if (document.visibility === "shared") return true;
    const now = iso();
    return this.grants.some((grant) => grant.documentId === document.id && grant.principal === actor && (!grant.expiresAt || grant.expiresAt > now));
  }

  search(query: string, actor = "vedant", mode: "keyword" | "semantic" | "hybrid" = "hybrid"): { cached: boolean; results: SearchResult[] } {
    assertCondition(query.trim().length > 0, "query is required");
    const cacheKey = `${actor}:${mode}:${query.toLowerCase()}`;
    const cached = this.queryCache.get(cacheKey);
    if (cached) {
      this.searchAudits.unshift({ id: id("search"), actor, query, mode, results: cached.length, cached: true, at: iso() });
      return { cached: true, results: cached };
    }
    const queryTokens = tokenize(query);
    const queryVector = vectorize(queryTokens);
    const results: SearchResult[] = [];
    for (const entry of this.index) {
      const document = this.documents.find((doc) => doc.id === entry.documentId);
      if (!document || !this.canRead(document, actor)) continue;
      const keywordScore = queryTokens.reduce((score, token) => score + (entry.tokenCounts[token] || 0), 0);
      const semanticScore = cosine(queryVector, entry.embedding);
      const score = mode === "keyword" ? keywordScore : mode === "semantic" ? semanticScore : keywordScore + semanticScore;
      if (score > 0) results.push({ document, score: Number(score.toFixed(4)), reason: keywordScore > 0 ? "keyword match" : "semantic similarity" });
    }
    results.sort((a, b) => b.score - a.score || b.document.updatedAt.localeCompare(a.document.updatedAt));
    this.queryCache.set(cacheKey, results);
    this.searchAudits.unshift({ id: id("search"), actor, query, mode, results: results.length, cached: false, at: iso() });
    this.createAudit("SEARCH_EXECUTED", actor, { query, mode, results: results.length });
    return { cached: false, results };
  }

  rebuildIndex(): IndexJob {
    for (const document of this.documents) document.stale = true;
    const job = this.ensureJob("REBUILD_INDEX", `rebuild:${iso().slice(0, 10)}`, { documents: this.documents.length });
    this.createAudit("INDEX_REBUILD_QUEUED", "index-api", { jobId: job.id });
    return job;
  }

  scanStaleDocuments(maxAgeMinutes = 60): { stale: number } {
    const now = Date.now();
    let stale = 0;
    for (const document of this.documents) {
      const indexedAt = document.indexedAt ? new Date(document.indexedAt).getTime() : 0;
      if (!indexedAt || now - indexedAt >= maxAgeMinutes * 60_000) {
        document.stale = true;
        stale += 1;
        this.ensureJob("INDEX_DOCUMENT", `${document.id}:v${document.version}:index`, { documentId: document.id });
      }
    }
    this.createAudit("STALE_SCAN_COMPLETED", "worker:stale-scan", { stale, maxAgeMinutes });
    return { stale };
  }

  snapshot(): Record<string, unknown> {
    return {
      documents: this.documents.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      index: this.index,
      jobs: this.jobs,
      grants: this.grants,
      searchAudits: this.searchAudits,
      audit: this.audit,
      metrics: {
        documents: this.documents.length,
        indexedDocuments: this.index.length,
        staleDocuments: this.documents.filter((doc) => doc.stale).length,
        privateDocuments: this.documents.filter((doc) => doc.visibility === "private").length,
        grants: this.grants.length,
        queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length,
        cachedQueries: this.queryCache.size,
        searches: this.searchAudits.length
      }
    };
  }

  exportState(): Record<string, unknown> {
    return {
      documents: this.documents,
      index: this.index,
      jobs: this.jobs,
      grants: this.grants,
      searchAudits: this.searchAudits,
      audit: this.audit,
      processedEvents: [...this.processedEvents],
      queryCache: [...this.queryCache.entries()],
      failNextJob: this.failNextJob
    };
  }

  importState(state: Record<string, unknown>): void {
    this.documents = state.documents as KnowledgeDocument[];
    this.index = state.index as SearchIndexEntry[];
    this.jobs = state.jobs as IndexJob[];
    this.grants = state.grants as Grant[];
    this.searchAudits = state.searchAudits as SearchAudit[];
    this.audit = state.audit as AuditEvent[];
    this.processedEvents = new Set(state.processedEvents as string[]);
    this.queryCache = new Map(state.queryCache as Array<[string, SearchResult[]]>);
    this.failNextJob = Boolean(state.failNextJob);
  }
}

export function createSeededKnowledgeIndex(): PersonalKnowledgeIndex {
  const index = new PersonalKnowledgeIndex();
  index.seed();
  return index;
}
