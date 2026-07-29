import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Bell, Check, ClipboardCheck, Database, History, Home, Menu, PackageCheck, RefreshCw, RotateCcw, Server, ShoppingCart, Store, Tags, X } from "lucide-react";

type View = "overview" | "compare" | "events" | "operations";
type GroceryItem = { id: string; name: string; category: string; quantity: number; unit: string; preferredBrand: string; maxPrice: number; status: string; updatedAt: string; notes: string };
type StoreRecord = { id: string; name: string; distanceMiles: number; pickupAvailable: boolean; updatedAt: string };
type StorePrice = { id: string; itemId: string; storeId: string; brand: string; price: number; unit: string; available: boolean; previousPrice: number | null; updatedAt: string };
type Recommendation = { id: string; kind: string; total: number; savings: number; storePlan: Record<string, string[]>; generatedAt: string };
type Event = { id: string; itemId: string; type: string; occurredAt: string; name: string; storeId: string; price: number; source: string };
type Alert = { id: string; itemId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { items: GroceryItem[]; stores: StoreRecord[]; prices: StorePrice[]; recommendations: Recommendation[]; selectedStoreId: string | null; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; items: number; needed: number; stores: number; bestTotal: number; singleStoreTotal: number; savings: number; unavailable: number; duplicates: number; priceDrops: number; queuedAlerts: number; queuedJobs: number } };
type Health = { kafka: string; postgres: string; redis: string; bufferedMessages: number };

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8344")); }, []);
  const item = (id: string) => data?.items.find((candidate) => candidate.id === id);
  const store = (id: string) => data?.stores.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.items.filter((candidate) => ["UNAVAILABLE", "SUBSTITUTED", "DUPLICATE"].includes(candidate.status)) || [], [data]);
  const split = data?.recommendations.find((rec) => rec.kind === "SPLIT_STORE");

  if (!data) return <div className="loading"><RefreshCw />Loading grocery prices</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Home /></span><div><strong>CartCompare</strong><small>GROCERY PRICE WATCH</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Cart savings score</small><strong>{data.metrics.score}%</strong><p>{money.format(data.metrics.savings)} saved by splitting</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["compare", "Compare", ShoppingCart], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Grocery list, price updates, availability, substitutions, and cart recommendations</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={ShoppingCart} label="Needed" value={`${data.metrics.needed}`} />
              <Metric icon={Store} label="Stores" value={`${data.metrics.stores}`} />
              <Metric icon={AlertTriangle} label="Drops" value={`${data.metrics.priceDrops}`} />
              <Metric icon={ClipboardCheck} label="Best total" value={money.format(data.metrics.bestTotal)} />
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
          {view === "compare" ? <>
            <Panel title="Grocery list">{data.items.map((entry) => <ItemRow entry={entry} key={entry.id} />)}</Panel>
            <Panel title="Split-store recommendation">{split ? Object.entries(split.storePlan).map(([storeId, itemIds]) => <div className="incident" key={storeId}><Store /><div><strong>{store(storeId)?.name}</strong><small>{itemIds.map((id) => item(id)?.name).join(", ")} · generated {date(split.generatedAt)}</small></div><b>{money.format(split.total)}</b></div>) : null}</Panel>
            <Panel title="Store prices">{data.prices.slice(0, 14).map((price) => <div className="incident" key={price.id}><Tags /><div><strong>{item(price.itemId)?.name}</strong><small>{store(price.storeId)?.name} · {price.brand} · {price.unit} · {price.available ? "available" : "unavailable"}</small></div><b className={price.available ? "needed" : "unavailable"}>{money.format(price.price)}</b></div>)}</Panel>
            <Panel title="Store totals"><div className="rollup"><span><small>Best split</small><strong>{money.format(data.metrics.bestTotal)}</strong></span><span><small>Single store</small><strong>{money.format(data.metrics.singleStoreTotal)}</strong></span><span><small>Savings</small><strong>{money.format(data.metrics.savings)}</strong></span><span><small>Selected</small><strong>{data.selectedStoreId ? store(data.selectedStoreId)?.name : "None"}</strong></span></div></Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent grocery event stream"><div className="thead"><span>Item</span><span>Type</span><span>Store</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.name}</strong><span>{label(event.type)}</span><span>{store(event.storeId)?.name || event.storeId}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["PRICE_REFRESH", "AVAILABILITY_CHECK", "RECOMMENDATION_BUILD", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `drop-${Date.now()}`, itemId: "item-chicken", type: "PRICE_UPDATED", storeId: "store-market", brand: "Store brand", price: 4.99, unit: "lb", available: true })}>Drop chicken</button>
              <button onClick={() => act("/api/events", { eventId: `sub-${Date.now()}`, itemId: "item-apples", type: "SUBSTITUTION_FOUND", substituteItemId: "item-pears", notes: "Pears are cheaper today." })}>Suggest substitute</button>
              <button onClick={() => act("/api/events", { eventId: `select-${Date.now()}`, itemId: "item-milk", type: "STORE_SELECTED", storeId: "store-value" })}>Pick Value Foods</button>
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

function ItemRow({ entry }: { entry: GroceryItem }) {
  return <div className="room"><Tags /><div><strong>{entry.name}</strong><small>{label(entry.category)} · {entry.quantity} {entry.unit} · {entry.preferredBrand} · cap {money.format(entry.maxPrice)}</small></div><span>{label(entry.status)}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
