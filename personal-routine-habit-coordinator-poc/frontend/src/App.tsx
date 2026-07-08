import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, CalendarCheck, Check, Clock3, Database, FileCheck, Flame, History, ListChecks, Menu, RefreshCw, RotateCcw, Server, Tags, X } from "lucide-react";

type View = "overview" | "habits" | "events" | "operations";
type Habit = { id: string; title: string; category: string; cadence: string; windowStartAt: string; windowEndAt: string; reminderAt: string; owner: string; streak: number; longestStreak: number; status: string; lastCheckInAt: string | null; archived: boolean };
type HabitLog = { id: string; habitId: string; type: string; occurredAt: string; windowKey: string; duplicateOf: string | null };
type Event = { id: string; habitId: string; type: string; occurredAt: string; title: string; owner: string; source: string };
type Alert = { id: string; habitId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; habitId: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { habits: Habit[]; logs: HabitLog[]; events: Event[]; alerts: Alert[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; metrics: { active: number; dueSoon: number; missed: number; done: number; bestStreak: number; queuedAlerts: number; queuedReminders: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8260")); }, []);
  const habit = (id: string) => data?.habits.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.habits.filter((candidate) => ["DUE_SOON", "MISSED", "OVERLOADED"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading routines</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><ListChecks /></span><div><strong>RoutineDesk</strong><small>HABITS & STREAKS</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Best streak</small><strong>{data.metrics.bestStreak}</strong><p>{data.metrics.missed} missed windows</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["habits", "Habits", CalendarCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Personal routine habit coordinator</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={ListChecks} label="Active" value={`${data.metrics.active}`} />
              <Metric icon={Clock3} label="Due soon" value={`${data.metrics.dueSoon}`} />
              <Metric icon={AlertTriangle} label="Missed" value={`${data.metrics.missed}`} />
              <Metric icon={Check} label="Done" value={`${data.metrics.done}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <div className="room" key={entry.id}><FileCheck /><div><strong>{entry.title}</strong><small>{label(entry.category)} · {date(entry.windowStartAt)} · streak {entry.streak}</small></div><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}
              </Panel>
              <Panel title="Reminders">
                {data.reminders.map((reminder) => <div className="recommendation" key={reminder.id}><Clock3 /><div><strong>{habit(reminder.habitId)?.title}</strong><small>{date(reminder.scheduledFor)}</small></div><b className={reminder.status.toLowerCase()}>{reminder.status}</b></div>)}
              </Panel>
            </div>
            <Panel title="Active alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{habit(alert.habitId)?.title} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "habits" ? <>
            <Panel title="Habit queue">{data.habits.map((entry) => <div className="room" key={entry.id}><Tags /><div><strong>{entry.title}</strong><small>{label(entry.category)} · {entry.owner} · {date(entry.windowStartAt)} to {date(entry.windowEndAt)}</small></div><span><Flame /> {entry.streak}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}</Panel>
            <Panel title="Recent logs">{data.logs.slice(0, 10).map((entry) => <div className="room" key={entry.id}><Check /><div><strong>{habit(entry.habitId)?.title}</strong><small>{label(entry.type)} · {date(entry.occurredAt)} · {entry.windowKey}</small></div><b className={entry.duplicateOf ? "retry" : "sent"}>{entry.duplicateOf ? "DUPLICATE" : "RECORDED"}</b></div>)}</Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent habit event stream"><div className="thead"><span>Habit</span><span>Type</span><span>Owner</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.title}</strong><span>{label(event.type)}</span><span>{event.owner}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">{["ROUTINE_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}<button onClick={() => act("/api/jobs/fail-next")}>Fail next</button><button className="primary" onClick={() => act("/api/jobs/drain")}>Drain jobs</button><button onClick={() => act("/api/reset")}><RotateCcw /></button></div>
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
