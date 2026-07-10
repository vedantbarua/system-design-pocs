import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Menu, PackageCheck, RefreshCw, RotateCcw, Server, ShieldAlert, Tags, X } from "lucide-react";

type View = "overview" | "tasks" | "events" | "operations";
type CareTask = { id: string; recipient: string; title: string; category: string; scheduledStartAt: string; scheduledEndAt: string; caregiver: string; backupCaregiver: string; location: string; status: string; priority: string; lastLoggedAt: string | null; notes: string };
type CareLog = { id: string; taskId: string; caregiver: string; type: string; occurredAt: string; duplicateOf: string | null };
type Event = { id: string; taskId: string; type: string; occurredAt: string; title: string; caregiver: string; source: string };
type Alert = { id: string; taskId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; taskId: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { tasks: CareTask[]; logs: CareLog[]; events: Event[]; alerts: Alert[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; scheduled: number; done: number; missed: number; handoffs: number; escalated: number; logs: number; queuedAlerts: number; queuedReminders: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8280")); }, []);
  const task = (id: string) => data?.tasks.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.tasks.filter((candidate) => ["DUE_SOON", "MISSED", "HANDOFF_PENDING", "ESCALATED"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading care plan</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><ShieldAlert /></span><div><strong>CareCircle</strong><small>ELDER CARE</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Care reliability</small><strong>{data.metrics.score}%</strong><p>{data.metrics.escalated} escalated tasks</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["tasks", "Tasks", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Everyday caregiver coordination</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={ClipboardCheck} label="Scheduled" value={`${data.metrics.scheduled}`} />
              <Metric icon={Check} label="Done" value={`${data.metrics.done}`} />
              <Metric icon={AlertTriangle} label="Missed" value={`${data.metrics.missed}`} />
              <Metric icon={Bell} label="Handoffs" value={`${data.metrics.handoffs}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <div className="room" key={entry.id}><FileCheck /><div><strong>{entry.title}</strong><small>{entry.recipient} · {entry.caregiver} · {entry.location}</small></div><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}
              </Panel>
              <Panel title="Reminders">
                {data.reminders.map((reminder) => <div className="recommendation" key={reminder.id}><Clock3 /><div><strong>{task(reminder.taskId)?.title}</strong><small>{date(reminder.scheduledFor)}</small></div><b className={reminder.status.toLowerCase()}>{reminder.status}</b></div>)}
              </Panel>
            </div>
            <Panel title="Active alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{task(alert.taskId)?.title} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "tasks" ? <>
            <Panel title="Care plan">{data.tasks.map((entry) => <div className="room" key={entry.id}><Tags /><div><strong>{entry.title}</strong><small>{label(entry.category)} · {entry.recipient} · {entry.caregiver} / backup {entry.backupCaregiver}</small></div><span>{date(entry.scheduledStartAt)}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}</Panel>
            <Panel title="Care logs">{data.logs.map((log) => <div className="incident" key={log.id}><Check /><div><strong>{task(log.taskId)?.title}</strong><small>{log.caregiver} · {label(log.type)} · {date(log.occurredAt)}</small></div><b className={log.duplicateOf ? "queued" : "sent"}>{log.duplicateOf ? "DUPLICATE" : "LOGGED"}</b></div>)}</Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent care event stream"><div className="thead"><span>Task</span><span>Type</span><span>Caregiver</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.title}</strong><span>{label(event.type)}</span><span>{event.caregiver}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["CARE_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `log-${Date.now()}`, taskId: "task-breakfast", type: "CARE_LOGGED", caregiver: "Ava" })}>Log breakfast</button>
              <button onClick={() => act("/api/events", { eventId: `handoff-${Date.now()}`, taskId: "task-pharmacy", type: "HANDOFF_REQUESTED", backupCaregiver: "Noah" })}>Handoff</button>
              <button onClick={() => act("/api/events", { eventId: `skip-${Date.now()}`, taskId: "task-appointment", type: "TASK_SKIPPED", caregiver: "Isha" })}>Skip appointment</button>
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

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
