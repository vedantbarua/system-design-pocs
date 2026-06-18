import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Database,
  FileSearch,
  FileText,
  FolderLock,
  History,
  KeyRound,
  Menu,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Shield,
  Sparkles,
  X,
  type LucideIcon
} from "lucide-react";

type DocumentKind = "note" | "pdf" | "bookmark" | "snippet";
type Visibility = "private" | "shared" | "work";
type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

type KnowledgeDocument = {
  id: string;
  title: string;
  path: string;
  kind: DocumentKind;
  visibility: Visibility;
  owner: string;
  content: string;
  contentHash: string;
  tags: string[];
  version: number;
  updatedAt: string;
  indexedAt: string | null;
  stale: boolean;
};

type IndexJob = { id: string; kind: "INDEX_DOCUMENT" | "REBUILD_INDEX" | "STALE_SCAN"; status: JobStatus; attempts: number; maxAttempts: number; queuedAt: string; completedAt: string | null; lastError: string | null };
type Grant = { id: string; documentId: string; principal: string; access: "read"; expiresAt: string | null };
type SearchAudit = { id: string; actor: string; query: string; mode: "keyword" | "semantic" | "hybrid"; results: number; cached: boolean; at: string };
type Audit = { id: string; action: string; actor: string; details: Record<string, unknown>; at: string };
type SearchResult = { document: KnowledgeDocument; score: number; reason: string };

type Snapshot = {
  documents: KnowledgeDocument[];
  index: Array<{ documentId: string; tokens: string[]; indexedAt: string }>;
  jobs: IndexJob[];
  grants: Grant[];
  searchAudits: SearchAudit[];
  audit: Audit[];
  metrics: {
    documents: number;
    indexedDocuments: number;
    staleDocuments: number;
    privateDocuments: number;
    grants: number;
    queuedJobs: number;
    cachedQueries: number;
    searches: number;
  };
};

type Health = { status: string; persistence: string; kafka: string; postgres: string; redis: string; bufferedMessages: number };

const NAV = [
  { id: "overview", label: "Overview", icon: Brain },
  { id: "search", label: "Search", icon: Search },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "jobs", label: "Index jobs", icon: RefreshCw },
  { id: "audit", label: "Audit", icon: Activity }
] as const;

type View = (typeof NAV)[number]["id"];

const api = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Request failed");
  return json as T;
};

const formatTime = (value: string | null) =>
  value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(value)) : "never";

const titleCase = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());

function Status({ value }: { value: string }) {
  return <span className={`status status-${value.toLowerCase()}`}>{titleCase(value)}</span>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone: string }) {
  return <div className={`metric metric-${tone}`}><div className="metric-icon"><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function DocumentRow({ document }: { document: KnowledgeDocument }) {
  return (
    <div className="doc-row">
      <span><FileText size={16} /><strong>{document.title}</strong></span>
      <span>{document.path}</span>
      <span>{document.kind}</span>
      <Status value={document.visibility} />
      <Status value={document.stale ? "STALE" : "INDEXED"} />
      <span>{formatTime(document.updatedAt)}</span>
    </div>
  );
}

function JobRow({ job }: { job: IndexJob }) {
  return (
    <div className="job-row">
      <span><RefreshCw size={16} /><strong>{job.kind.replaceAll("_", " ")}</strong></span>
      <span>{job.attempts} / {job.maxAttempts}</span>
      <span>{formatTime(job.queuedAt)}</span>
      <Status value={job.status} />
      <span>{job.lastError || "ready"}</span>
    </div>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  return (
    <div className="result-card">
      <div><Status value={result.document.visibility} /><Status value={result.document.kind} /></div>
      <h3>{result.document.title}</h3>
      <p>{result.document.content.slice(0, 150)}</p>
      <footer><span>{result.document.path}</span><strong>{result.score.toFixed(2)} / {result.reason}</strong></footer>
    </div>
  );
}

function Overview({ data, health, onDrain, onRebuild }: { data: Snapshot; health: Health | null; onDrain: () => void; onRebuild: () => void }) {
  return (
    <>
      <section className="metrics-grid">
        <Metric icon={BookOpen} label="Documents" value={data.metrics.documents} detail={`${data.metrics.indexedDocuments} indexed`} tone="blue" />
        <Metric icon={AlertTriangle} label="Stale docs" value={data.metrics.staleDocuments} detail={`${data.metrics.queuedJobs} jobs queued`} tone="amber" />
        <Metric icon={Shield} label="Private docs" value={data.metrics.privateDocuments} detail={`${data.metrics.grants} access grants`} tone="green" />
        <Metric icon={RadioTower} label="Kafka mode" value={health?.kafka || "memory"} detail={`${health?.bufferedMessages || 0} buffered changes`} tone="red" />
      </section>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Latest documents</p><h2>Indexed knowledge</h2></div><FileSearch size={18} /></div>
          {data.documents.slice(0, 5).map((document) => <DocumentRow key={document.id} document={document} />)}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Index controls</p><h2>Operations</h2></div><RefreshCw size={18} /></div>
          <div className="control-stack">
            <button className="button" onClick={onDrain}><RefreshCw size={16} /> Drain jobs</button>
            <button className="button secondary" onClick={onRebuild}><Database size={16} /> Rebuild index</button>
            <div className="infra-card"><Server size={18} /><span><strong>{health?.persistence || "memory"}</strong><small>Redis {health?.redis || "memory"} / cache {data.metrics.cachedQueries}</small></span></div>
          </div>
        </section>
      </div>
    </>
  );
}

function SearchView({ results, query, setQuery, mode, setMode, actor, setActor, onSearch }: { results: SearchResult[]; query: string; setQuery: (value: string) => void; mode: "keyword" | "semantic" | "hybrid"; setMode: (value: "keyword" | "semantic" | "hybrid") => void; actor: string; setActor: (value: string) => void; onSearch: () => void }) {
  return (
    <>
      <section className="search-toolbar">
        <div><p className="eyebrow">Query workbench</p><h2>Personal search</h2></div>
        <div className="search-controls">
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={mode} onChange={(event) => setMode(event.target.value as "keyword" | "semantic" | "hybrid")}><option value="hybrid">hybrid</option><option value="keyword">keyword</option><option value="semantic">semantic</option></select>
          <select value={actor} onChange={(event) => setActor(event.target.value)}><option value="vedant">vedant</option><option value="maya">maya</option></select>
          <button className="button" onClick={onSearch}><Search size={16} /> Search</button>
        </div>
      </section>
      <section className="result-grid">{results.map((result) => <ResultCard key={result.document.id} result={result} />)}</section>
    </>
  );
}

function DocumentsView({ data, onPublish, onGrant, onDrainKafka, onStaleScan }: { data: Snapshot; onPublish: (kind: string) => void; onGrant: () => void; onDrainKafka: () => void; onStaleScan: () => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Document ingestion</p><h2>Change stream</h2></div>
        <div>
          <button className="button secondary" onClick={() => onPublish("note")}><FileText size={16} /> New note</button>
          <button className="button secondary" onClick={() => onPublish("bookmark")}><Sparkles size={16} /> Bookmark</button>
          <button className="button secondary" onClick={onGrant}><KeyRound size={16} /> Grant Maya</button>
          <button className="button secondary" onClick={onStaleScan}><AlertTriangle size={16} /> Stale scan</button>
          <button className="button" onClick={onDrainKafka}><RadioTower size={16} /> Drain Kafka</button>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="doc-head"><span>Title</span><span>Path</span><span>Kind</span><span>Visibility</span><span>Index</span><span>Updated</span></div>
        {data.documents.map((document) => <DocumentRow key={document.id} document={document} />)}
      </section>
    </>
  );
}

function JobsView({ data, onFail, onDrain, onRebuild }: { data: Snapshot; onFail: () => void; onDrain: () => void; onRebuild: () => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Background indexing</p><h2>Job queue</h2></div>
        <div><button className="button secondary" onClick={onFail}><AlertTriangle size={16} /> Fail next</button><button className="button secondary" onClick={onRebuild}><Database size={16} /> Rebuild</button><button className="button" onClick={onDrain}><RefreshCw size={16} /> Drain jobs</button></div>
      </section>
      <section className="panel table-panel">
        <div className="job-head"><span>Job</span><span>Attempts</span><span>Queued</span><span>Status</span><span>Error</span></div>
        {data.jobs.map((job) => <JobRow key={job.id} job={job} />)}
      </section>
      <section className="grant-grid">{data.grants.map((grant) => <div className="grant-card" key={grant.id}><FolderLock size={18} /><span><strong>{grant.principal}</strong><small>{grant.documentId} / {grant.expiresAt || "no expiry"}</small></span></div>)}</section>
    </>
  );
}

function AuditView({ data }: { data: Snapshot }) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="eyebrow">Search and system history</p><h2>Audit</h2></div><History size={18} /></div>
      <div className="audit-head"><span>Action</span><span>Actor</span><span>Time</span><span>Details</span></div>
      {[...data.audit, ...data.searchAudits.map((item) => ({ id: item.id, action: "SEARCH", actor: item.actor, at: item.at, details: { query: item.query, mode: item.mode, results: item.results, cached: item.cached } }))].slice(0, 80).map((event) => (
        <div className="audit-row" key={event.id}>
          <span>{event.action.replaceAll("_", " ")}</span>
          <span>{event.actor}</span>
          <span>{formatTime(event.at)}</span>
          <span>{Object.entries(event.details).map(([key, value]) => `${key}: ${value}`).join(" / ")}</span>
        </div>
      ))}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("Kafka replay");
  const [mode, setMode] = useState<"keyword" | "semantic" | "hybrid">("hybrid");
  const [actor, setActor] = useState("vedant");
  const [results, setResults] = useState<SearchResult[]>([]);
  const recentAudits = useMemo(() => data?.audit.slice(0, 3) || [], [data]);

  const refresh = async () => {
    const [snapshot, healthStatus] = await Promise.all([api<Snapshot>("/api/snapshot"), api<Health>("/api/health")]);
    setData(snapshot);
    setHealth(healthStatus);
  };

  useEffect(() => {
    refresh().catch((error) => setToast(error.message));
  }, []);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      setToast(message);
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(""), 3000);
    }
  };

  if (!data) return <div className="loading"><RefreshCw className="spin" size={20} /> Loading knowledge index</div>;

  const publishDocument = (kind: string) => {
    const eventId = `${kind}-${crypto.randomUUID()}`;
    const body = kind === "bookmark"
      ? { eventId, title: "Vector database bookmark", path: `/Bookmarks/vector-${eventId}.url`, kind: "bookmark", visibility: "shared", content: "vector database approximate nearest neighbor semantic search bookmark", tags: ["search", "systems"], updatedAt: "2026-06-18T15:00:00Z" }
      : { eventId, title: "Meeting synthesis notes", path: `/Notes/meeting-${eventId}.md`, kind: "note", visibility: "private", content: "meeting notes action items budget travel passport kafka indexing", tags: ["notes"], updatedAt: "2026-06-18T15:10:00Z" };
    return run(() => api("/api/documents/publish", { method: "POST", body: JSON.stringify(body) }), "Document change buffered");
  };

  const doSearch = () => run(async () => {
    const response = await api<{ cached: boolean; results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query)}&actor=${encodeURIComponent(actor)}&mode=${mode}`);
    setResults(response.results);
  }, "Search complete");

  const grantMaya = () => {
    const privateDoc = data.documents.find((doc) => doc.visibility === "private");
    return run(() => api("/api/grants", { method: "POST", body: JSON.stringify({ documentId: privateDoc?.id, principal: "maya" }) }), "Grant created");
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Brain size={21} /></div><div><strong>RecallKit</strong><span>Personal knowledge index</span></div><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="quota-card"><span>Index</span><strong>{data.metrics.indexedDocuments}/{data.metrics.documents}</strong><small>{data.metrics.staleDocuments} stale / {data.metrics.cachedQueries} cached queries</small></div>
        <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSidebarOpen(false); }}><Icon size={17} /> {label}{id === "jobs" && data.metrics.queuedJobs > 0 && <span>{data.metrics.queuedJobs}</span>}</button>)}</nav>
        <div className="sidebar-bottom">
          {recentAudits.map((event) => <div className="audit-pill" key={event.id}><Activity size={14} /><span><strong>{event.action.replaceAll("_", " ")}</strong><small>{formatTime(event.at)}</small></span></div>)}
          <div className="infra"><Database size={17} /><span><strong>{health?.persistence || "memory"}</strong><small>Kafka {health?.kafka || "memory"}</small></span><i className={health?.status === "ok" ? "online" : ""} /></div>
          <button className="reset-button" onClick={() => run(() => api("/api/reset", { method: "POST" }), "Demo reset")}><RotateCcw size={15} /> Reset demo</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <main>
        <header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><p>Thursday, June 18</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div><div className="top-status"><RadioTower size={15} /><span><strong>{health?.bufferedMessages || 0} buffered documents</strong><small>{data.metrics.queuedJobs} index jobs waiting</small></span></div></header>
        <div className={`content ${busy ? "content-busy" : ""}`}>
          {view === "overview" && <Overview data={data} health={health} onDrain={() => run(() => api("/api/jobs/drain?max=50", { method: "POST" }), "Jobs drained")} onRebuild={() => run(() => api("/api/index/rebuild", { method: "POST" }), "Rebuild queued")} />}
          {view === "search" && <SearchView results={results} query={query} setQuery={setQuery} mode={mode} setMode={setMode} actor={actor} setActor={setActor} onSearch={doSearch} />}
          {view === "documents" && <DocumentsView data={data} onPublish={publishDocument} onGrant={grantMaya} onDrainKafka={() => run(() => api("/api/kafka/drain", { method: "POST" }), "Memory Kafka drained")} onStaleScan={() => run(() => api("/api/stale-scan", { method: "POST", body: JSON.stringify({ maxAgeMinutes: 0 }) }), "Stale scan completed")} />}
          {view === "jobs" && <JobsView data={data} onFail={() => run(() => api("/api/jobs/fail-next", { method: "POST" }), "Next job will retry")} onDrain={() => run(() => api("/api/jobs/drain?max=50", { method: "POST" }), "Jobs drained")} onRebuild={() => run(() => api("/api/index/rebuild", { method: "POST" }), "Rebuild queued")} />}
          {view === "audit" && <AuditView data={data} />}
        </div>
      </main>
      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
    </div>
  );
}
