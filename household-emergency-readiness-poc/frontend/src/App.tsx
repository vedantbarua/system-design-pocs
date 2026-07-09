import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Menu, PackageCheck, RefreshCw, RotateCcw, Server, ShieldAlert, Tags, X } from "lucide-react";

type View = "overview" | "items" | "events" | "operations";
type ReadinessItem = { id: string; name: string; area: string; location: string; owner: string; quantity: number; requiredQuantity: number; expiresAt: string | null; lastVerifiedAt: string; status: string; incidentCritical: boolean };
type Event = { id: string; itemId: string; type: string; occurredAt: string; name: string; area: string; source: string };
type Alert = { id: string; itemId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; itemId: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { items: ReadinessItem[]; events: Event[]; alerts: Alert[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; incidentMode: boolean; metrics: { score: number; ready: number; problems: number; critical: number; queuedAlerts: number; queuedReminders: number; queuedJobs: number } };
type Health = { kafka: string; postgres: string; redis: string; bufferedMessages: number };

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8270")); }, []);
  const item = (id: string) => data?.items.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.items.filter((candidate) => !["READY", "DONE"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading readiness</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><ShieldAlert /></span><div><strong>ReadyHouse</strong><small>EMERGENCY PLAN</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Readiness score</small><strong>{data.metrics.score}%</strong><p>{data.metrics.problems} items need work</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["items", "Items", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Household emergency readiness</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.incidentMode ? "Incident mode" : `${data.metrics.queuedAlerts} queued alerts`}</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={ClipboardCheck} label="Ready" value={`${data.metrics.ready}`} />
              <Metric icon={AlertTriangle} label="Problems" value={`${data.metrics.problems}`} />
              <Metric icon={ShieldAlert} label="Critical" value={`${data.metrics.critical}`} />
              <Metric icon={Bell} label="Alerts" value={`${data.metrics.queuedAlerts}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <div className="room" key={entry.id}><FileCheck /><div><strong>{entry.name}</strong><small>{label(entry.area)} · {entry.location} · {entry.quantity}/{entry.requiredQuantity}</small></div><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}
              </Panel>
              <Panel title="Reminders">
                {data.reminders.map((reminder) => <div className="recommendation" key={reminder.id}><Clock3 /><div><strong>{item(reminder.itemId)?.name}</strong><small>{date(reminder.scheduledFor)}</small></div><b className={reminder.status.toLowerCase()}>{reminder.status}</b></div>)}
              </Panel>
            </div>
            <Panel title="Active alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{item(alert.itemId)?.name} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "items" ? <Panel title="Readiness inventory">{data.items.map((entry) => <div className="room" key={entry.id}><Tags /><div><strong>{entry.name}</strong><small>{label(entry.area)} · {entry.location} · owner {entry.owner}</small></div><span>{entry.expiresAt ? date(entry.expiresAt) : `${entry.quantity}/${entry.requiredQuantity}`}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}</Panel> : null}
          {view === "events" ? <Panel title="Idempotent readiness event stream"><div className="thead"><span>Item</span><span>Type</span><span>Area</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.name}</strong><span>{label(event.type)}</span><span>{label(event.area)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">{["READINESS_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}<button onClick={() => act("/api/events", { eventId: `incident-${Date.now()}`, itemId: "item-water", type: "INCIDENT_MODE_STARTED" })}>Incident</button><button onClick={() => act("/api/jobs/fail-next")}>Fail next</button><button className="primary" onClick={() => act("/api/jobs/drain")}>Drain jobs</button><button onClick={() => act("/api/reset")}><RotateCcw /></button></div>
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
