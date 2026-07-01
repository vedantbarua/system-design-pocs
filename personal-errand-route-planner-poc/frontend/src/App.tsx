import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, Clock3, Database, History, ListChecks, Map, MapPin, Menu, Navigation, PackageCheck, RefreshCw, RotateCcw, Route, Server, X } from "lucide-react";

type View = "overview" | "errands" | "events" | "operations";
type Errand = { id: string; title: string; kind: string; location: string; priority: number; deadlineAt: string; opensAt: string; closesAt: string; status: string };
type RouteStop = { errandId: string; sequence: number; eta: string; distanceMiles: number; reason: string };
type RoutePlan = { status: string; generatedAt: string; totalMiles: number; stops: RouteStop[] };
type Event = { id: string; errandId: string; type: string; occurredAt: string; title: string; source: string };
type Alert = { id: string; errandId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; errandId: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { errands: Errand[]; routePlan: RoutePlan | null; events: Event[]; alerts: Alert[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; metrics: { pending: number; completed: number; missed: number; routeMiles: number; routeStale: boolean; queuedAlerts: number; queuedReminders: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8199")); }, []);
  const errand = (id: string) => data?.errands.find((item) => item.id === id);
  const routeStops = useMemo(() => data?.routePlan?.stops || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading route</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Route /></span><div><strong>ErrandRun</strong><small>ROUTE PLANNER</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Route miles</small><strong>{data.metrics.routeMiles}</strong><p>{data.metrics.pending} pending errands</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["errands", "Errands", ListChecks], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Personal errands</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={Map} label="Route" value={data.metrics.routeStale ? "Stale" : "Fresh"} />
              <Metric icon={Navigation} label="Miles" value={`${data.metrics.routeMiles}`} />
              <Metric icon={PackageCheck} label="Complete" value={`${data.metrics.completed}`} />
              <Metric icon={AlertTriangle} label="Missed" value={`${data.metrics.missed}`} />
            </div>
            <div className="grid">
              <Panel title="Route plan">
                {routeStops.map((stop) => <div className="room" key={stop.errandId}><MapPin /><div><strong>{stop.sequence}. {errand(stop.errandId)?.title}</strong><small>{errand(stop.errandId)?.location} · ETA {date(stop.eta)} · {stop.distanceMiles} mi</small></div><b>{stop.reason}</b></div>)}
              </Panel>
              <Panel title="Reminders">
                {data.reminders.map((reminder) => <div className="recommendation" key={reminder.id}><Clock3 /><div><strong>{errand(reminder.errandId)?.title}</strong><small>{date(reminder.scheduledFor)}</small></div><b className={reminder.status.toLowerCase()}>{reminder.status}</b></div>)}
              </Panel>
            </div>
            <Panel title="Active alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{errand(alert.errandId)?.title} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "errands" ? <Panel title="Errand board">{data.errands.map((item) => <div className="room" key={item.id}><ListChecks /><div><strong>{item.title}</strong><small>{item.location} · priority {item.priority} · due {date(item.deadlineAt)}</small></div><span>{item.opensAt}-{item.closesAt}</span><b className={item.status.toLowerCase()}>{item.status}</b></div>)}</Panel> : null}
          {view === "events" ? <Panel title="Idempotent errand event stream"><div className="thead"><span>Errand</span><span>Type</span><span>Source</span><span>Status</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{errand(event.errandId)?.title}</strong><span>{label(event.type)}</span><span>{event.source}</span><span>{errand(event.errandId)?.status}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">{["ROUTE_REBUILD", "WINDOW_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}<button onClick={() => act("/api/jobs/fail-next")}>Fail next</button><button className="primary" onClick={() => act("/api/jobs/drain")}>Drain jobs</button><button onClick={() => act("/api/reset")}><RotateCcw /></button></div>
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
