import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Bell, Boxes, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Home, Menu, PackageCheck, RefreshCw, RotateCcw, Server, ShieldCheck, Tags, X } from "lucide-react";

type View = "overview" | "inventory" | "events" | "operations";
type InventoryItem = { id: string; name: string; category: string; room: string; owner: string; purchaseDate: string; value: number; replacementValue: number; serialNumber: string; proofIds: string[]; policyId: string | null; coverageLimit: number; status: string; updatedAt: string; notes: string };
type Proof = { id: string; itemId: string; kind: string; label: string; capturedAt: string; checksum: string };
type Policy = { id: string; provider: string; policyNumber: string; coverageLimit: number; deductible: number; coveredCategories: string[]; updatedAt: string };
type ExportBundle = { id: string; status: string; itemCount: number; totalValue: number; generatedAt: string; checksum: string };
type Event = { id: string; itemId: string; type: string; occurredAt: string; name: string; category: string; source: string };
type Alert = { id: string; itemId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { items: InventoryItem[]; proofs: Proof[]; policies: Policy[]; exports: ExportBundle[]; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; items: number; proofs: number; totalValue: number; missingProof: number; underinsured: number; duplicates: number; exports: number; queuedAlerts: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8341")); }, []);
  const item = (id: string) => data?.items.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.items.filter((candidate) => ["MISSING_PROOF", "UNDERINSURED", "DUPLICATE"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading inventory</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Home /></span><div><strong>HomeVault</strong><small>INVENTORY INSURANCE</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Insurance readiness</small><strong>{data.metrics.score}%</strong><p>{money.format(data.metrics.totalValue)} replacement value</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["inventory", "Inventory", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Household items, proof, coverage, exports, and reminders</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={Boxes} label="Items" value={`${data.metrics.items}`} />
              <Metric icon={FileCheck} label="Proofs" value={`${data.metrics.proofs}`} />
              <Metric icon={AlertTriangle} label="Gaps" value={`${data.metrics.missingProof + data.metrics.underinsured}`} />
              <Metric icon={ClipboardCheck} label="Exports" value={`${data.metrics.exports}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <ItemRow entry={entry} key={entry.id} />)}
              </Panel>
              <Panel title="Queued alerts">
                {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{item(alert.itemId)?.name || alert.itemId} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
              </Panel>
            </div>
          </> : null}
          {view === "inventory" ? <>
            <Panel title="Household inventory">{data.items.map((entry) => <ItemRow entry={entry} key={entry.id} />)}</Panel>
            <Panel title="Proof library">{data.proofs.map((proof) => <div className="incident" key={proof.id}><FileCheck /><div><strong>{proof.label}</strong><small>{item(proof.itemId)?.name} · {label(proof.kind)} · {date(proof.capturedAt)}</small></div><b>{proof.checksum}</b></div>)}</Panel>
            <Panel title="Policies">{data.policies.map((policy) => <div className="incident" key={policy.id}><ShieldCheck /><div><strong>{policy.provider}</strong><small>{policy.policyNumber} · {money.format(policy.coverageLimit)} limit · {money.format(policy.deductible)} deductible</small></div><b>{policy.coveredCategories.length} types</b></div>)}</Panel>
            <Panel title="Insurance exports">{data.exports.map((bundle) => <div className="incident" key={bundle.id}><ClipboardCheck /><div><strong>{bundle.id}</strong><small>{bundle.itemCount} items · {money.format(bundle.totalValue)} · {date(bundle.generatedAt)}</small></div><b className={bundle.status.toLowerCase()}>{bundle.status}</b></div>)}</Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent inventory event stream"><div className="thead"><span>Item</span><span>Type</span><span>Category</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.name}</strong><span>{label(event.type)}</span><span>{label(event.category)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["INVENTORY_SCAN", "VALUATION_REFRESH", "EXPORT_GENERATION", "REMINDER_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `proof-${Date.now()}`, itemId: "item-bike", type: "PROOF_ATTACHED", proofKind: "RECEIPT", proofLabel: "Bike shop receipt" })}>Attach proof</button>
              <button onClick={() => act("/api/events", { eventId: `coverage-${Date.now()}`, itemId: "item-tv", type: "COVERAGE_UPDATED", policyId: "policy-home", coverageLimit: 2200 })}>Raise TV coverage</button>
              <button onClick={() => act("/api/events", { eventId: `export-${Date.now()}`, itemId: "item-laptop", type: "EXPORT_REQUESTED" })}>Create export</button>
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

function ItemRow({ entry }: { entry: InventoryItem }) {
  return <div className="room"><Tags /><div><strong>{entry.name}</strong><small>{label(entry.category)} · {entry.room} · {entry.owner} · {entry.serialNumber || "no serial"} · {entry.proofIds.length} proof{entry.proofIds.length === 1 ? "" : "s"}</small></div><span>{money.format(entry.replacementValue)}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
