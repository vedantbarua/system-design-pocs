import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, Clock3, Database, FileCheck, History, Inbox, Mail, Menu, RefreshCw, RotateCcw, Server, ShieldCheck, Tags, X } from "lucide-react";

type View = "overview" | "inbox" | "events" | "operations";
type MailItem = { id: string; sender: string; subject: string; category: string; requiredAction: string; receivedAt: string; dueAt: string | null; status: string; assignedTo: string };
type Event = { id: string; mailId: string; type: string; occurredAt: string; sender: string; subject: string; source: string };
type Alert = { id: string; mailId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; mailId: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { mail: MailItem[]; events: Event[]; alerts: Alert[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; metrics: { inbox: number; actions: number; done: number; stale: number; queuedAlerts: number; queuedReminders: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8200")); }, []);
  const item = (id: string) => data?.mail.find((mail) => mail.id === id);
  const actions = useMemo(() => data?.mail.filter((mail) => mail.status === "ACTION_REQUIRED") || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading mail</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Mail /></span><div><strong>MailDesk</strong><small>HOUSEHOLD MAIL</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Action queue</small><strong>{data.metrics.actions}</strong><p>{data.metrics.stale} stale items</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["inbox", "Inbox", Inbox], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Mail triage</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={Inbox} label="Inbox" value={`${data.metrics.inbox}`} />
              <Metric icon={FileCheck} label="Actions" value={`${data.metrics.actions}`} />
              <Metric icon={Check} label="Done" value={`${data.metrics.done}`} />
              <Metric icon={AlertTriangle} label="Stale" value={`${data.metrics.stale}`} />
            </div>
            <div className="grid">
              <Panel title="Action queue">
                {actions.map((mail) => <div className="room" key={mail.id}><FileCheck /><div><strong>{mail.subject}</strong><small>{mail.sender} · {label(mail.requiredAction)} · {mail.dueAt ? date(mail.dueAt) : "No due date"}</small></div><b className={mail.status.toLowerCase()}>{mail.assignedTo}</b></div>)}
              </Panel>
              <Panel title="Reminders">
                {data.reminders.map((reminder) => <div className="recommendation" key={reminder.id}><Clock3 /><div><strong>{item(reminder.mailId)?.subject}</strong><small>{date(reminder.scheduledFor)}</small></div><b className={reminder.status.toLowerCase()}>{reminder.status}</b></div>)}
              </Panel>
            </div>
            <Panel title="Active alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{item(alert.mailId)?.subject} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "inbox" ? <Panel title="Mail inbox">{data.mail.map((mail) => <div className="room" key={mail.id}><Tags /><div><strong>{mail.subject}</strong><small>{mail.sender} · {label(mail.category)} · {mail.dueAt ? date(mail.dueAt) : "No due date"}</small></div><span>{label(mail.requiredAction)}</span><b className={mail.status.toLowerCase()}>{label(mail.status)}</b></div>)}</Panel> : null}
          {view === "events" ? <Panel title="Idempotent mail event stream"><div className="thead"><span>Subject</span><span>Type</span><span>Sender</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.subject}</strong><span>{label(event.type)}</span><span>{event.sender}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">{["INBOX_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}<button onClick={() => act("/api/jobs/fail-next")}>Fail next</button><button className="primary" onClick={() => act("/api/jobs/drain")}>Drain jobs</button><button onClick={() => act("/api/reset")}><RotateCcw /></button></div>
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
