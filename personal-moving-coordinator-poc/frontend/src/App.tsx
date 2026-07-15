import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Boxes, CalendarDays, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Home, Menu, PackageCheck, RefreshCw, RotateCcw, Server, Tags, Truck, X } from "lucide-react";

type View = "overview" | "move" | "events" | "operations";
type MoveTask = { id: string; title: string; area: string; owner: string; dueAt: string; status: string; priority: string; relatedRef: string | null; notes: string };
type Box = { id: string; room: string; label: string; priority: string; fragile: boolean; packed: boolean; essentials: boolean; updatedAt: string };
type Vendor = { id: string; name: string; kind: string; arrivalWindow: string; deposit: number; status: string };
type Event = { id: string; taskId: string; type: string; occurredAt: string; title: string; area: string; source: string };
type Alert = { id: string; taskId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { tasks: MoveTask[]; boxes: Box[]; vendors: Vendor[]; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; total: number; dueSoon: number; overdue: number; done: number; packed: number; unpacked: number; vendors: number; blocked: number; duplicates: number; queuedAlerts: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8330")); }, []);
  const task = (id: string) => data?.tasks.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.tasks.filter((candidate) => ["DUE_SOON", "OVERDUE", "BLOCKED", "DUPLICATE"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading move plan</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Home /></span><div><strong>MovePlan</strong><small>MOVE COORDINATOR</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Move readiness</small><strong>{data.metrics.score}%</strong><p>{data.metrics.unpacked} boxes unpacked</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["move", "Move", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Timeline, packing, vendors, and address changes</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={Clock3} label="Due soon" value={`${data.metrics.dueSoon}`} />
              <Metric icon={AlertTriangle} label="Overdue" value={`${data.metrics.overdue}`} />
              <Metric icon={Boxes} label="Packed" value={`${data.metrics.packed}`} />
              <Metric icon={Truck} label="Vendors" value={`${data.metrics.vendors}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <TaskRow entry={entry} key={entry.id} />)}
              </Panel>
              <Panel title="Queued alerts">
                {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{task(alert.taskId)?.title} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
              </Panel>
            </div>
          </> : null}
          {view === "move" ? <>
            <Panel title="Move timeline">{data.tasks.map((entry) => <TaskRow entry={entry} key={entry.id} />)}</Panel>
            <Panel title="Packing inventory">{data.boxes.map((box) => <div className="incident" key={box.id}><Boxes /><div><strong>{box.label}</strong><small>{box.room} · {label(box.priority)} priority · {box.fragile ? "fragile" : "standard"} · {box.essentials ? "essentials" : "bulk"}</small></div><b className={box.packed ? "packed" : "overdue"}>{box.packed ? "PACKED" : "OPEN"}</b></div>)}</Panel>
            <Panel title="Vendors">{data.vendors.map((vendor) => <div className="incident" key={vendor.id}><Truck /><div><strong>{vendor.name}</strong><small>{label(vendor.kind)} · {date(vendor.arrivalWindow)} · {money.format(vendor.deposit)} deposit</small></div><b className={vendor.status.toLowerCase()}>{label(vendor.status)}</b></div>)}</Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent move event stream"><div className="thead"><span>Task</span><span>Type</span><span>Area</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.title}</strong><span>{label(event.type)}</span><span>{label(event.area)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["MOVE_SCAN", "VENDOR_RECHECK", "REMINDER_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `pack-${Date.now()}`, taskId: "task-pack-kitchen", type: "BOX_PACKED", relatedRef: "box-kitchen-essentials", room: "Kitchen", boxLabel: "Kitchen essentials", fragile: true, essentials: true })}>Pack essentials</button>
              <button onClick={() => act("/api/events", { eventId: `mail-${Date.now()}`, taskId: "task-mail", type: "ADDRESS_UPDATED" })}>Forward mail</button>
              <button onClick={() => act("/api/events", { eventId: `issue-${Date.now()}`, taskId: "task-movers", type: "ISSUE_REPORTED", notes: "Mover changed arrival window." })}>Report issue</button>
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

function TaskRow({ entry }: { entry: MoveTask }) {
  return <div className="room"><Tags /><div><strong>{entry.title}</strong><small>{label(entry.area)} · {entry.owner} · due {date(entry.dueAt)} · {entry.relatedRef || "no ref"}</small></div><span>{label(entry.priority)}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
