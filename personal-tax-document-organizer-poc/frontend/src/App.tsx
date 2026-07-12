import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Menu, PackageCheck, RefreshCw, RotateCcw, Server, ShieldAlert, Tags, X } from "lucide-react";

type View = "overview" | "documents" | "events" | "operations";
type TaxDocument = { id: string; taxYear: number; taxpayer: string; name: string; category: string; issuer: string; amount: number; dueBy: string; receivedAt: string | null; status: string; storageRef: string | null; notes: string };
type Event = { id: string; documentId: string; type: string; occurredAt: string; name: string; category: string; source: string };
type Alert = { id: string; documentId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { documents: TaxDocument[]; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; total: number; expected: number; received: number; classified: number; missing: number; duplicates: number; reviewed: number; queuedAlerts: number; queuedJobs: number } };
type Health = { kafka: string; postgres: string; redis: string; bufferedMessages: number };

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const date = (value: string) => fmt.format(new Date(value));
const label = (value: string) => value.replaceAll("_", " ");

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [view, setView] = useState<View>("overview");
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");

  async function load() {
    const [snapshot, healthResult] = await Promise.all([fetch("/api/snapshot"), fetch("/api/health")]);
    setData(await snapshot.json());
    setHealth(await healthResult.json());
  }

  async function act(path: string, body: Record<string, unknown> = {}) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setToast(response.ok ? "Updated" : result.error);
    await load();
  }

  useEffect(() => { load().catch(() => setToast("Start API on port 8300")); }, []);
  const document = (id: string) => data?.documents.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.documents.filter((candidate) => ["EXPECTED", "RECEIVED", "MISSING", "DUPLICATE"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading tax checklist</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><ShieldAlert /></span><div><strong>TaxFolder</strong><small>2026 ORGANIZER</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Filing readiness</small><strong>{data.metrics.score}%</strong><p>{data.metrics.missing} missing documents</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["documents", "Documents", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Personal tax document organizer</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={ClipboardCheck} label="Classified" value={`${data.metrics.classified}`} />
              <Metric icon={Clock3} label="Expected" value={`${data.metrics.expected}`} />
              <Metric icon={AlertTriangle} label="Missing" value={`${data.metrics.missing}`} />
              <Metric icon={FileCheck} label="Reviewed" value={`${data.metrics.reviewed}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <DocumentRow entry={entry} key={entry.id} />)}
              </Panel>
              <Panel title="Queued alerts">
                {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{document(alert.documentId)?.name} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
              </Panel>
            </div>
          </> : null}
          {view === "documents" ? <Panel title="Tax document checklist">{data.documents.map((entry) => <DocumentRow entry={entry} key={entry.id} />)}</Panel> : null}
          {view === "events" ? <Panel title="Idempotent tax event stream"><div className="thead"><span>Document</span><span>Type</span><span>Category</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.name}</strong><span>{label(event.type)}</span><span>{label(event.category)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["TAX_SCAN", "CLASSIFICATION", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `receive-${Date.now()}`, documentId: "doc-1099-bank", type: "DOCUMENT_RECEIVED", storageRef: "inbox://1099-int.pdf" })}>Receive 1099</button>
              <button onClick={() => act("/api/events", { eventId: `duplicate-${Date.now()}`, documentId: "doc-w2-copy", type: "DOCUMENT_RECEIVED", taxYear: 2026, taxpayer: "Ava", name: "W-2 duplicate", category: "W2", issuer: "Northwind Labs", amount: 84250, storageRef: "inbox://w2-copy.pdf" })}>Duplicate W-2</button>
              <button onClick={() => act("/api/jobs/fail-next")}>Fail next</button>
              <button className="primary" onClick={() => act("/api/jobs/drain")}>Drain jobs</button>
              <button onClick={() => act("/api/reset")}><RotateCcw /></button>
            </div>
            <Panel title="Job history">{data.jobs.map((job) => <div className="job" key={job.id}><strong>{label(job.kind)}</strong><b className={job.status.toLowerCase()}>{job.status}</b><span>{job.attempts}/3</span><span>{job.lastError || date(job.queuedAt)}</span></div>)}</Panel>
            <Panel title="Audit stream">{data.audit.slice(0, 8).map((entry) => <div className="audit" key={entry.id}><strong>{label(entry.action)}</strong><span>{date(entry.at)}</span><code>{JSON.stringify(entry.details)}</code></div>)}</Panel>
          </> : null}
        </div>
      </main>
      {toast ? <div className="toast"><Check />{toast}</div> : null}
    </div>
  );
}

function DocumentRow({ entry }: { entry: TaxDocument }) {
  return <div className="room"><Tags /><div><strong>{entry.name}</strong><small>{entry.taxYear} · {label(entry.category)} · {entry.issuer} · due {date(entry.dueBy)}</small></div><span>{money.format(entry.amount)}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
