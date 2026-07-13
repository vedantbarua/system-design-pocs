import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Home, Menu, PackageCheck, RefreshCw, RotateCcw, Server, ShieldAlert, Tags, X } from "lucide-react";

type View = "overview" | "records" | "events" | "operations";
type LeaseRecord = { id: string; leaseId: string; title: string; area: string; party: string; amount: number; dueAt: string; openedAt: string; status: string; evidenceRef: string | null; notes: string };
type Event = { id: string; recordId: string; type: string; occurredAt: string; title: string; area: string; source: string };
type Alert = { id: string; recordId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { records: LeaseRecord[]; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; total: number; dueSoon: number; overdue: number; open: number; resolved: number; paid: number; duplicates: number; queuedAlerts: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8310")); }, []);
  const record = (id: string) => data?.records.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.records.filter((candidate) => ["DUE_SOON", "OVERDUE", "OPEN", "DISPUTED", "DUPLICATE"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading lease tracker</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Home /></span><div><strong>RentRight</strong><small>TENANT TRACKER</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Tenant readiness</small><strong>{data.metrics.score}%</strong><p>{data.metrics.overdue} overdue items</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["records", "Records", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Rental lease and tenant workflow</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={Clock3} label="Due soon" value={`${data.metrics.dueSoon}`} />
              <Metric icon={AlertTriangle} label="Overdue" value={`${data.metrics.overdue}`} />
              <Metric icon={FileCheck} label="Resolved" value={`${data.metrics.resolved}`} />
              <Metric icon={ClipboardCheck} label="Paid" value={`${data.metrics.paid}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <RecordRow entry={entry} key={entry.id} />)}
              </Panel>
              <Panel title="Queued alerts">
                {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{record(alert.recordId)?.title} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
              </Panel>
            </div>
          </> : null}
          {view === "records" ? <Panel title="Lease, rent, deposit, and repair records">{data.records.map((entry) => <RecordRow entry={entry} key={entry.id} />)}</Panel> : null}
          {view === "events" ? <Panel title="Idempotent tenant event stream"><div className="thead"><span>Record</span><span>Type</span><span>Area</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.title}</strong><span>{label(event.type)}</span><span>{label(event.area)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["LEASE_SCAN", "EVIDENCE_REVIEW", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `pay-${Date.now()}`, recordId: "rec-rent", type: "RENT_PAID", amount: 2250 })}>Pay rent</button>
              <button onClick={() => act("/api/events", { eventId: `respond-${Date.now()}`, recordId: "rec-repair", type: "LANDLORD_RESPONDED", notes: "Plumber scheduled." })}>Landlord response</button>
              <button onClick={() => act("/api/events", { eventId: `notice-${Date.now()}`, recordId: "rec-notice-copy", type: "NOTICE_RECEIVED", leaseId: "lease-apt-42", title: "Rent increase notice", area: "NOTICE", party: "Landlord", evidenceRef: "inbox://copy.pdf" })}>Duplicate notice</button>
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

function RecordRow({ entry }: { entry: LeaseRecord }) {
  return <div className="room"><Tags /><div><strong>{entry.title}</strong><small>{label(entry.area)} · {entry.party} · due {date(entry.dueAt)} · {entry.evidenceRef || "no evidence"}</small></div><span>{entry.amount ? money.format(entry.amount) : "no fee"}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
