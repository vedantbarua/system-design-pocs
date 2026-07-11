import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Menu, PackageCheck, RefreshCw, RotateCcw, Search, Server, ShieldAlert, Tags, X } from "lucide-react";

type View = "overview" | "resources" | "events" | "operations";
type CommunityResource = { id: string; name: string; category: string; address: string; zipCode: string; languages: string[]; eligibility: string[]; documents: string[]; hours: string; capacity: number; available: number; status: string; phone: string; verifiedAt: string };
type SavedResource = { id: string; userId: string; resourceId: string; reason: string; savedAt: string; lastNotifiedAt: string | null };
type Event = { id: string; resourceId: string; type: string; occurredAt: string; name: string; category: string; source: string };
type Alert = { id: string; resourceId: string; userId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { resources: CommunityResource[]; saved: SavedResource[]; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; search: { cachedQueries: number; featured: CommunityResource[] }; metrics: { score: number; total: number; open: number; limited: number; full: number; closed: number; stale: number; saved: number; queuedAlerts: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8290")); }, []);
  const resource = (id: string) => data?.resources.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.resources.filter((candidate) => ["LIMITED", "FULL", "CLOSED", "STALE"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading resources</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><ShieldAlert /></span><div><strong>HelpNear</strong><small>LOCAL RESOURCES</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Directory score</small><strong>{data.metrics.score}%</strong><p>{data.metrics.total} verified listings tracked</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["resources", "Resources", Search], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Community assistance directory</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={ClipboardCheck} label="Open" value={`${data.metrics.open}`} />
              <Metric icon={Clock3} label="Limited" value={`${data.metrics.limited}`} />
              <Metric icon={AlertTriangle} label="Full/closed" value={`${data.metrics.full + data.metrics.closed}`} />
              <Metric icon={Bell} label="Saved" value={`${data.metrics.saved}`} />
            </div>
            <div className="grid">
              <Panel title="Available near 60618">
                {data.search.featured.map((entry) => <ResourceRow entry={entry} key={entry.id} />)}
              </Panel>
              <Panel title="Needs attention">
                {attention.map((entry) => <ResourceRow entry={entry} key={entry.id} />)}
              </Panel>
            </div>
            <Panel title="Saved resource alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{resource(alert.resourceId)?.name} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "resources" ? <>
            <Panel title="Resource directory">{data.resources.map((entry) => <ResourceRow entry={entry} key={entry.id} />)}</Panel>
            <Panel title="Saved options">{data.saved.map((saved) => <div className="incident" key={saved.id}><FileCheck /><div><strong>{resource(saved.resourceId)?.name}</strong><small>{saved.reason} · saved {date(saved.savedAt)}</small></div><b className={saved.lastNotifiedAt ? "queued" : "sent"}>{saved.lastNotifiedAt ? "WATCHING" : "SAVED"}</b></div>)}</Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent provider event stream"><div className="thead"><span>Resource</span><span>Type</span><span>Category</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.name}</strong><span>{label(event.type)}</span><span>{label(event.category)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["RESOURCE_SCAN", "ALERT_DISPATCH", "CACHE_REFRESH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `save-${Date.now()}`, resourceId: "res-clinic", type: "RESOURCE_SAVED", userId: "user-demo" })}>Save clinic</button>
              <button onClick={() => act("/api/events", { eventId: `capacity-${Date.now()}`, resourceId: "res-food-bank", type: "CAPACITY_CHANGED", available: 4 })}>Low food</button>
              <button onClick={() => act("/api/events", { eventId: `close-${Date.now()}`, resourceId: "res-food-bank", type: "RESOURCE_CLOSED" })}>Close pantry</button>
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

function ResourceRow({ entry }: { entry: CommunityResource }) {
  return <div className="room"><Tags /><div><strong>{entry.name}</strong><small>{label(entry.category)} · {entry.zipCode} · {entry.languages.join(", ")} · {entry.documents.length} docs</small></div><span>{entry.available}/{entry.capacity}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
