import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Camera, Check, Clock3, Database, FileCheck, FileText, History, Home, Menu, RefreshCw, RotateCcw, Server, ShieldCheck, Tags, X } from "lucide-react";

type View = "overview" | "claims" | "events" | "operations";
type Claim = { id: string; policyNumber: string; title: string; type: string; status: string; incidentAt: string; openedAt: string; adjuster: string; nextDeadlineAt: string | null; inspectionAt: string | null; expectedPaymentCents: number; updatedAt: string };
type Evidence = { id: string; claimId: string; kind: string; label: string; uploadedAt: string; duplicateOf: string | null };
type Event = { id: string; claimId: string; type: string; occurredAt: string; title: string; status: string; source: string };
type Alert = { id: string; claimId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; claimId: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { claims: Claim[]; evidence: Evidence[]; events: Event[]; alerts: Alert[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; metrics: { open: number; stale: number; evidence: number; duplicates: number; expectedPayout: number; queuedAlerts: number; queuedReminders: number; queuedJobs: number } };
type Health = { kafka: string; postgres: string; redis: string; bufferedMessages: number };

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const date = (value: string) => fmt.format(new Date(value));
const label = (value: string) => value.replaceAll("_", " ");
const dollars = (value: number) => money.format(value / 100);

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

  useEffect(() => { load().catch(() => setToast("Start API on port 8240")); }, []);
  const claim = (id: string) => data?.claims.find((candidate) => candidate.id === id);
  const needsAction = useMemo(() => data?.claims.filter((candidate) => ["WAITING_ON_DOCS", "INSPECTION_SCHEDULED", "STALE", "ESTIMATE_REVIEW"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading claims</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><ShieldCheck /></span><div><strong>ClaimDesk</strong><small>HOME INSURANCE</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Open claims</small><strong>{data.metrics.open}</strong><p>{data.metrics.duplicates} duplicate evidence</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["claims", "Claims", Home], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Home insurance claim tracker</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={FileText} label="Open" value={`${data.metrics.open}`} />
              <Metric icon={AlertTriangle} label="Stale" value={`${data.metrics.stale}`} />
              <Metric icon={Camera} label="Evidence" value={`${data.metrics.evidence}`} />
              <Metric icon={ShieldCheck} label="Expected" value={dollars(data.metrics.expectedPayout)} />
            </div>
            <div className="grid">
              <Panel title="Needs action">
                {needsAction.map((entry) => <div className="room" key={entry.id}><FileCheck /><div><strong>{entry.title}</strong><small>{entry.adjuster} · {entry.nextDeadlineAt ? `Deadline ${date(entry.nextDeadlineAt)}` : "No deadline"} · {dollars(entry.expectedPaymentCents)}</small></div><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}
              </Panel>
              <Panel title="Reminders">
                {data.reminders.map((reminder) => <div className="recommendation" key={reminder.id}><Clock3 /><div><strong>{claim(reminder.claimId)?.title}</strong><small>{date(reminder.scheduledFor)}</small></div><b className={reminder.status.toLowerCase()}>{reminder.status}</b></div>)}
              </Panel>
            </div>
            <Panel title="Active alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{claim(alert.claimId)?.title} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "claims" ? <>
            <Panel title="Claim queue">{data.claims.map((entry) => <div className="room" key={entry.id}><Tags /><div><strong>{entry.title}</strong><small>{entry.policyNumber} · {label(entry.type)} · adjuster {entry.adjuster}</small></div><span>{entry.nextDeadlineAt ? date(entry.nextDeadlineAt) : "No deadline"}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}</Panel>
            <Panel title="Evidence">{data.evidence.map((entry) => <div className="room" key={entry.id}><Camera /><div><strong>{entry.label}</strong><small>{claim(entry.claimId)?.title} · {label(entry.kind)} · {date(entry.uploadedAt)}</small></div><b className={entry.duplicateOf ? "retry" : "sent"}>{entry.duplicateOf ? "DUPLICATE" : "STORED"}</b></div>)}</Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent claim event stream"><div className="thead"><span>Claim</span><span>Type</span><span>Status</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.title}</strong><span>{label(event.type)}</span><span>{label(event.status)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">{["CLAIM_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}<button onClick={() => act("/api/jobs/fail-next")}>Fail next</button><button className="primary" onClick={() => act("/api/jobs/drain")}>Drain jobs</button><button onClick={() => act("/api/reset")}><RotateCcw /></button></div>
            <Panel title="Job history">{data.jobs.map((job) => <div className="job" key={job.id}><strong>{label(job.kind)}</strong><b className={job.status.toLowerCase()}>{job.status}</b><span>{job.attempts}/3</span><span>{job.lastError || date(job.queuedAt)}</span></div>)}</Panel>
            <Panel title="Audit stream">{data.audit.slice(0, 8).map((entry) => <div className="audit" key={entry.id}><strong>{label(entry.action)}</strong><span>{date(entry.at)}</span><code>{JSON.stringify(entry.details)}</code></div>)}</Panel>
          </> : null}
        </div>
      </main>
      {toast ? <div className="toast"><Check />{toast}</div> : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
