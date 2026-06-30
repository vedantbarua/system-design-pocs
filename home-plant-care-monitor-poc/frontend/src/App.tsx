import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, Database, Droplets, History, Leaf, Menu, RefreshCw, RotateCcw, Server, Sprout, Sun, Thermometer, Timer, X } from "lucide-react";

type View = "overview" | "plants" | "events" | "operations";
type Plant = { id: string; name: string; species: string; room: string; idealMoistureMin: number; idealMoistureMax: number; idealLightMin: number; lastWateredAt: string };
type Sensor = { id: string; plantId: string; name: string; status: string; lastSeenAt: string };
type Status = { plantId: string; moisturePct: number; lightLux: number; temperatureF: number; careState: string; nextWateringAt: string; updatedAt: string };
type PlantEvent = { id: string; plantId: string; sensorId: string; type: string; moisturePct: number; lightLux: number; temperatureF: number; observedAt: string; source: string };
type Alert = { id: string; plantId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; plantId: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { plants: Plant[]; sensors: Sensor[]; statuses: Status[]; events: PlantEvent[]; alerts: Alert[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; metrics: { plants: number; healthyPlants: number; dryPlants: number; staleSensors: number; queuedAlerts: number; queuedReminders: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8198")); }, []);
  const plantName = (id: string) => data?.plants.find((plant) => plant.id === id)?.name || id;
  const plant = (id: string) => data?.plants.find((item) => item.id === id);
  const ordered = useMemo(() => data ? [...data.statuses].sort((a, b) => a.careState.localeCompare(b.careState)) : [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading plant care</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Leaf /></span><div><strong>PlantWatch</strong><small>HOME PLANTS</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Healthy plants</small><strong>{data.metrics.healthyPlants}/{data.metrics.plants}</strong><p>{data.metrics.queuedReminders} reminders queued</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["plants", "Plants", Sprout], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Plant care</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={Leaf} label="Plants" value={`${data.metrics.plants}`} />
              <Metric icon={Check} label="Healthy" value={`${data.metrics.healthyPlants}`} />
              <Metric icon={Droplets} label="Dry or missed" value={`${data.metrics.dryPlants}`} />
              <Metric icon={AlertTriangle} label="Stale sensors" value={`${data.metrics.staleSensors}`} />
            </div>
            <div className="grid">
              <Panel title="Plant status">
                {ordered.map((status) => <div className="room" key={status.plantId}><Sprout /><div><strong>{plantName(status.plantId)}</strong><small>{plant(status.plantId)?.room} · moisture {status.moisturePct}% · light {status.lightLux} lux</small></div><b className={status.careState.toLowerCase()}>{label(status.careState)}</b></div>)}
              </Panel>
              <Panel title="Upcoming care">
                {data.reminders.map((reminder) => <div className="recommendation" key={reminder.id}><Timer /><div><strong>{plantName(reminder.plantId)}</strong><small>{date(reminder.scheduledFor)}</small></div><b className={reminder.status.toLowerCase()}>{reminder.status}</b></div>)}
              </Panel>
            </div>
            <Panel title="Active alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{plantName(alert.plantId)} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "plants" ? <Panel title="Plant board">{data.statuses.map((status) => <div className="room" key={status.plantId}><Leaf /><div><strong>{plantName(status.plantId)}</strong><small>{plant(status.plantId)?.species} · next water {date(status.nextWateringAt)}</small></div><span>{status.temperatureF} F</span><b className={status.careState.toLowerCase()}>{label(status.careState)}</b></div>)}</Panel> : null}
          {view === "events" ? <Panel title="Idempotent plant event stream"><div className="thead"><span>Plant</span><span>Type</span><span>Moisture</span><span>Light</span><span>Observed</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{plantName(event.plantId)}</strong><span>{label(event.type)}</span><span>{event.moisturePct}%</span><span>{event.lightLux}</span><span>{date(event.observedAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">{["CARE_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}<button onClick={() => act("/api/jobs/fail-next")}>Fail next</button><button className="primary" onClick={() => act("/api/jobs/drain")}>Drain jobs</button><button onClick={() => act("/api/reset")}><RotateCcw /></button></div>
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
