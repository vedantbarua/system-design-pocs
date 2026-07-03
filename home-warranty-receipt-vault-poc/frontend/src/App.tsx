import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, Clock3, Database, FileCheck, History, Menu, PackageCheck, ReceiptText, RefreshCw, RotateCcw, Server, ShieldCheck, Tags, Wrench, X } from "lucide-react";

type View = "overview" | "items" | "events" | "operations";
type VaultItem = { id: string; name: string; merchant: string; category: string; purchasedAt: string; priceCents: number; returnBy: string | null; warrantyExpiresAt: string | null; status: string; owner: string; claimStatus: string };
type Event = { id: string; itemId: string; type: string; occurredAt: string; name: string; merchant: string; source: string };
type Alert = { id: string; itemId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; itemId: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { items: VaultItem[]; events: Event[]; alerts: Alert[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; metrics: { covered: number; returns: number; claims: number; expiring: number; archived: number; queuedAlerts: number; queuedReminders: number; queuedJobs: number } };
type Health = { kafka: string; postgres: string; redis: string; bufferedMessages: number };

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8210")); }, []);
  const item = (id: string) => data?.items.find((candidate) => candidate.id === id);
  const expiring = useMemo(() => data?.items.filter((candidate) => candidate.status === "WARRANTY_SOON" || candidate.status === "RETURN_WINDOW" || candidate.claimStatus === "OPEN") || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading receipt vault</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><ReceiptText /></span><div><strong>WarrantyVault</strong><small>RECEIPTS & CLAIMS</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Covered items</small><strong>{data.metrics.covered}</strong><p>{data.metrics.claims} active claims</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["items", "Items", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Home warranty receipt vault</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={ShieldCheck} label="Covered" value={`${data.metrics.covered}`} />
              <Metric icon={Clock3} label="Return windows" value={`${data.metrics.returns}`} />
              <Metric icon={Wrench} label="Claims" value={`${data.metrics.claims}`} />
              <Metric icon={AlertTriangle} label="Expiring" value={`${data.metrics.expiring}`} />
            </div>
            <div className="grid">
              <Panel title="Deadline queue">
                {expiring.map((entry) => <div className="room" key={entry.id}><FileCheck /><div><strong>{entry.name}</strong><small>{entry.merchant} · {entry.warrantyExpiresAt ? `Warranty ${date(entry.warrantyExpiresAt)}` : "No warranty"} · {entry.returnBy ? `Return ${date(entry.returnBy)}` : "No return window"}</small></div><b className={entry.status.toLowerCase()}>{entry.owner}</b></div>)}
              </Panel>
              <Panel title="Reminders">
                {data.reminders.map((reminder) => <div className="recommendation" key={reminder.id}><Clock3 /><div><strong>{item(reminder.itemId)?.name}</strong><small>{date(reminder.scheduledFor)}</small></div><b className={reminder.status.toLowerCase()}>{reminder.status}</b></div>)}
              </Panel>
            </div>
            <Panel title="Active alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{item(alert.itemId)?.name} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "items" ? <Panel title="Receipt vault">{data.items.map((entry) => <div className="room" key={entry.id}><Tags /><div><strong>{entry.name}</strong><small>{entry.merchant} · {label(entry.category)} · {dollars(entry.priceCents)}</small></div><span>{entry.warrantyExpiresAt ? date(entry.warrantyExpiresAt) : "No warranty"}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}</Panel> : null}
          {view === "events" ? <Panel title="Idempotent receipt event stream"><div className="thead"><span>Item</span><span>Type</span><span>Merchant</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.name}</strong><span>{label(event.type)}</span><span>{event.merchant}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">{["VAULT_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}<button onClick={() => act("/api/jobs/fail-next")}>Fail next</button><button className="primary" onClick={() => act("/api/jobs/drain")}>Drain jobs</button><button onClick={() => act("/api/reset")}><RotateCcw /></button></div>
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
