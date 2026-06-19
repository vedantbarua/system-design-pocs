import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, AlertTriangle, Archive, Barcode, Boxes, Check, ChevronRight, CircleDollarSign,
  Clock3, Database, History, ListChecks, Menu, PackagePlus, RefreshCw, RotateCcw,
  ScanLine, Server, ShoppingCart, Trash2, Wheat, X, Zap
} from "lucide-react";

type View = "overview" | "inventory" | "shopping" | "operations";
type Product = { id: string; name: string; category: string; barcode: string; unit: string; lowStockThreshold: number; defaultLocation: string };
type Inventory = Product & { quantity: number; nextExpiry: string | null; value: number; lots: number; lowStock: boolean };
type Lot = { id: string; productId: string; quantity: number; initialQuantity: number; expiresAt: string | null; receivedAt: string; location: string; unitCost: number };
type StockEvent = { id: string; eventId: string; productId: string; type: string; quantity: number; actor: string; source: string; occurredAt: string };
type ShoppingItem = { id: string; productId: string; quantity: number; status: "NEEDED" | "IN_CART" | "BOUGHT"; reason: string; updatedAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; completedAt: string | null; lastError: string | null };
type Audit = { id: string; action: string; actor: string; details: Record<string, unknown>; at: string };
type Snapshot = {
  products: Product[]; inventory: Inventory[]; lots: Lot[]; stockEvents: StockEvent[]; shoppingItems: ShoppingItem[]; jobs: Job[]; audit: Audit[];
  metrics: { products: number; unitsOnHand: number; lowStock: number; expiringLots: number; expiredLots: number; openShoppingItems: number; inventoryValue: number; wastedUnits: number; queuedJobs: number };
};
type Health = { status: string; kafka: string; postgres: string; redis: string; bufferedMessages: number };

const nav = [
  { id: "overview" as const, label: "Overview", icon: Activity },
  { id: "inventory" as const, label: "Inventory", icon: Boxes },
  { id: "shopping" as const, label: "Shopping", icon: ShoppingCart },
  { id: "operations" as const, label: "Operations", icon: Server }
];

const fmtDate = (value: string | null) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value)) : "No expiry";
const fmtTime = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const daysUntil = (value: string | null) => value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000) : null;

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [view, setView] = useState<View>("overview");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");

  async function refresh() {
    const [stateResponse, healthResponse] = await Promise.all([fetch("/api/snapshot"), fetch("/api/health")]);
    if (!stateResponse.ok || !healthResponse.ok) throw new Error("API unavailable");
    setSnapshot(await stateResponse.json());
    setHealth(await healthResponse.json());
  }

  async function request(path: string, options: RequestInit = {}, message = "Updated") {
    setBusy(true);
    try {
      const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed");
      await refresh();
      setToast(message);
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { refresh().catch(() => setToast("Start the API on port 8188")); }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!snapshot) return <div className="loading"><RefreshCw className="spin" size={19} /> Loading pantry</div>;
  const pageTitle = nav.find((item) => item.id === view)?.label || "Overview";
  const openItems = snapshot.shoppingItems.filter((item) => item.status !== "BOUGHT");

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Wheat size={21} /></div>
          <div><strong>Pantry Ledger</strong><span>HOUSEHOLD INVENTORY</span></div>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={18} /></button>
        </div>
        <div className="household"><span>Current household</span><strong>Home pantry</strong><small>{snapshot.metrics.unitsOnHand} units across {snapshot.metrics.products} products</small></div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMenuOpen(false); }}>
              <Icon size={17} /> {label}
              {id === "shopping" && openItems.length > 0 && <span>{openItems.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="infra"><Database size={17} /><div><strong>{health?.postgres === "postgres" ? "Connected storage" : "Memory workspace"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></div><i className={health?.status === "ok" ? "online" : ""} /></div>
          <button className="reset-button" onClick={() => request("/api/reset", { method: "POST" }, "Demo data restored")}><RotateCcw size={14} /> Reset demo</button>
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <main>
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={19} /></button>
          <div><p>Home pantry / {pageTitle}</p><h1>{pageTitle}</h1></div>
          <div className="top-status"><Zap size={16} /><span><strong>Projection current</strong><small>{health?.bufferedMessages || 0} broker events waiting</small></span></div>
        </header>
        <div className={`content ${busy ? "content-busy" : ""}`}>
          {view === "overview" && <Overview snapshot={snapshot} setView={setView} />}
          {view === "inventory" && <InventoryView snapshot={snapshot} request={request} />}
          {view === "shopping" && <ShoppingView snapshot={snapshot} request={request} />}
          {view === "operations" && <Operations snapshot={snapshot} health={health} request={request} />}
        </div>
      </main>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function Overview({ snapshot, setView }: { snapshot: Snapshot; setView: (view: View) => void }) {
  const product = (id: string) => snapshot.products.find((item) => item.id === id)!;
  const risky = snapshot.inventory.filter((item) => item.nextExpiry && (daysUntil(item.nextExpiry) || 99) <= 7).sort((a, b) => (a.nextExpiry || "").localeCompare(b.nextExpiry || ""));
  return <>
    <section className="metrics-grid">
      <Metric icon={Boxes} tone="green" label="On hand" value={snapshot.metrics.unitsOnHand} detail={`${snapshot.metrics.products} tracked products`} />
      <Metric icon={AlertTriangle} tone="amber" label="Expiring soon" value={snapshot.metrics.expiringLots} detail={`${snapshot.metrics.expiredLots} already expired`} />
      <Metric icon={ShoppingCart} tone="blue" label="Shopping list" value={snapshot.metrics.openShoppingItems} detail={`${snapshot.metrics.lowStock} low-stock products`} />
      <Metric icon={CircleDollarSign} tone="rose" label="Inventory value" value={`$${snapshot.metrics.inventoryValue.toFixed(2)}`} detail={`${snapshot.metrics.wastedUnits} units wasted`} />
    </section>
    <div className="overview-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Rotation queue</span><h2>Use these first</h2></div><button className="text-button" onClick={() => setView("inventory")}>All inventory <ChevronRight size={14} /></button></div>
        <div className="risk-list">
          {risky.map((item) => <div className="risk-row" key={item.id}>
            <div className={`category-icon ${item.category}`}><Archive size={17} /></div>
            <div><strong>{item.name}</strong><small>{item.quantity} {item.unit} · {item.defaultLocation}</small></div>
            <div className={`expiry ${daysUntil(item.nextExpiry)! <= 1 ? "urgent" : ""}`}><strong>{daysUntil(item.nextExpiry)}d</strong><small>{fmtDate(item.nextExpiry)}</small></div>
          </div>)}
          {risky.length === 0 && <div className="empty">No lots expire in the next seven days.</div>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Recent ledger</span><h2>Stock movements</h2></div><History size={18} /></div>
        <div className="event-list">
          {snapshot.stockEvents.slice(0, 6).map((event) => <div className="event-row" key={event.id}>
            <span className={`event-mark ${event.type.toLowerCase()}`}>{event.type === "RECEIVE" ? "+" : "−"}</span>
            <div><strong>{product(event.productId).name}</strong><small>{event.source} · {fmtTime(event.occurredAt)}</small></div>
            <b>{event.quantity} {product(event.productId).unit}</b>
          </div>)}
        </div>
      </section>
    </div>
  </>;
}

function Metric({ icon: Icon, tone, label, value, detail }: { icon: typeof Boxes; tone: string; label: string; value: string | number; detail: string }) {
  return <div className={`metric metric-${tone}`}><div className="metric-icon"><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function InventoryView({ snapshot, request }: { snapshot: Snapshot; request: (path: string, options?: RequestInit, message?: string) => Promise<void> }) {
  const [productId, setProductId] = useState(snapshot.products[0].id);
  const [type, setType] = useState("RECEIVE");
  const [quantity, setQuantity] = useState(1);
  const [expiresAt, setExpiresAt] = useState("");
  const [barcode, setBarcode] = useState("");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => snapshot.inventory.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.barcode.includes(query)), [snapshot.inventory, query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await request("/api/stock/events", { method: "POST", body: JSON.stringify({ eventId: `ui-${Date.now()}`, productId, type, quantity, expiresAt: expiresAt || null, unitCost: type === "RECEIVE" ? 4 : 0 }) }, `${type.toLowerCase()} recorded`);
  }
  async function scan() {
    const response = await fetch(`/api/products/barcode/${barcode}`);
    const body = await response.json();
    if (response.ok) { setProductId(body.id); setBarcode(""); }
  }
  return <>
    <section className="inventory-tools panel">
      <div className="tool-title"><span className="eyebrow">Stock ledger</span><h2>Record movement</h2></div>
      <form className="stock-form" onSubmit={submit}>
        <select aria-label="Product" value={productId} onChange={(event) => setProductId(event.target.value)}>{snapshot.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
        <div className="segmented">{["RECEIVE", "CONSUME", "WASTE"].map((value) => <button type="button" key={value} className={type === value ? "active" : ""} onClick={() => setType(value)}>{value === "RECEIVE" ? "Add" : value === "CONSUME" ? "Use" : "Waste"}</button>)}</div>
        <input aria-label="Quantity" type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
        {type === "RECEIVE" && <input aria-label="Expiry date" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />}
        <button className="button" type="submit"><PackagePlus size={16} /> Record</button>
      </form>
      <div className="barcode-control"><Barcode size={17} /><input aria-label="Barcode" placeholder="Scan barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} /><button className="icon-button" aria-label="Find barcode" type="button" onClick={scan}><ScanLine size={16} /></button></div>
    </section>
    <div className="section-toolbar"><div><span className="eyebrow">Current stock</span><h2>{filtered.length} products</h2></div><input className="search" placeholder="Search name or barcode" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    <section className="inventory-grid">
      {filtered.map((item) => <article className="inventory-card" key={item.id}>
        <header><div className={`category-icon ${item.category}`}><Archive size={18} /></div><span className={`status ${item.lowStock ? "status-low" : "status-good"}`}>{item.lowStock ? "Low stock" : "Stocked"}</span></header>
        <h3>{item.name}</h3><p>{item.barcode}</p>
        <div className="quantity"><strong>{item.quantity}</strong><span>{item.unit}</span></div>
        <footer><span><Clock3 size={13} /> {fmtDate(item.nextExpiry)}</span><span>{item.lots} lot{item.lots === 1 ? "" : "s"} · ${item.value.toFixed(2)}</span></footer>
      </article>)}
    </section>
  </>;
}

function ShoppingView({ snapshot, request }: { snapshot: Snapshot; request: (path: string, options?: RequestInit, message?: string) => Promise<void> }) {
  const [productId, setProductId] = useState(snapshot.products[0].id);
  const [quantity, setQuantity] = useState(1);
  const product = (id: string) => snapshot.products.find((item) => item.id === id)!;
  const ordered = [...snapshot.shoppingItems].sort((a, b) => (a.status === "BOUGHT" ? 1 : 0) - (b.status === "BOUGHT" ? 1 : 0));
  async function add(event: FormEvent) {
    event.preventDefault();
    await request("/api/shopping-items", { method: "POST", body: JSON.stringify({ productId, quantity }) }, "Added to shopping list");
  }
  function nextStatus(item: ShoppingItem) { return item.status === "NEEDED" ? "IN_CART" : item.status === "IN_CART" ? "BOUGHT" : "NEEDED"; }
  return <>
    <section className="shopping-toolbar">
      <div><span className="eyebrow">Shared list</span><h2>{snapshot.metrics.openShoppingItems} items remaining</h2></div>
      <form onSubmit={add}><select value={productId} onChange={(event) => setProductId(event.target.value)}>{snapshot.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label="Quantity" type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /><button className="button"><ShoppingCart size={15} /> Add item</button></form>
    </section>
    <section className="shopping-board panel">
      {ordered.map((item) => <button className={`shopping-row ${item.status === "BOUGHT" ? "done" : ""}`} key={item.id} onClick={() => request(`/api/shopping-items/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus(item) }) }, `${product(item.productId).name}: ${nextStatus(item).toLowerCase()}`)}>
        <span className={`check ${item.status.toLowerCase()}`}>{item.status === "BOUGHT" ? <Check size={15} /> : item.status === "IN_CART" ? <ShoppingCart size={14} /> : null}</span>
        <div><strong>{product(item.productId).name}</strong><small>{item.reason === "LOW_STOCK" ? "Low-stock rule" : "Manually added"} · {product(item.productId).defaultLocation}</small></div>
        <b>{item.quantity} {product(item.productId).unit}</b><span className={`status status-${item.status.toLowerCase()}`}>{item.status.replace("_", " ")}</span>
      </button>)}
    </section>
  </>;
}

function Operations({ snapshot, health, request }: { snapshot: Snapshot; health: Health | null; request: (path: string, options?: RequestInit, message?: string) => Promise<void> }) {
  return <>
    <section className="operation-actions">
      <div><span className="eyebrow">Control plane</span><h2>Workers and projections</h2></div>
      <div>
        <button className="button secondary" onClick={() => request("/api/jobs/expiration", { method: "POST", body: JSON.stringify({ withinDays: 7 }) }, "Expiration scan queued")}><Clock3 size={15} /> Queue expiry scan</button>
        <button className="button secondary" onClick={() => request("/api/jobs/shopping-rebuild", { method: "POST" }, "Projection rebuild queued")}><ListChecks size={15} /> Rebuild list</button>
        <button className="button secondary" onClick={() => request("/api/jobs/fail-next", { method: "POST" }, "Next worker failure armed")}><AlertTriangle size={15} /> Fail next</button>
        <button className="button secondary" onClick={() => request("/api/kafka/drain", { method: "POST" }, "Broker backlog drained")}><Activity size={15} /> Drain broker</button>
        <button className="button" onClick={() => request("/api/jobs/drain", { method: "POST" }, "Job queue drained")}><Zap size={15} /> Drain jobs</button>
      </div>
    </section>
    <section className="infra-grid">
      {[{ label: "Kafka ingress", value: health?.kafka || "memory", meta: `${health?.bufferedMessages || 0} buffered`, icon: Activity }, { label: "PostgreSQL", value: health?.postgres || "memory", meta: "ledger snapshot", icon: Database }, { label: "Redis", value: health?.redis || "memory", meta: "read projections", icon: Zap }].map(({ label, value, meta, icon: Icon }) => <div className="infra-card" key={label}><Icon size={18} /><div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div><i className="online" /></div>)}
    </section>
    <section className="panel table-panel">
      <div className="panel-heading"><div><span className="eyebrow">Background work</span><h2>Job history</h2></div><span className="queue-count">{snapshot.metrics.queuedJobs} queued</span></div>
      <div className="job-head"><span>Job</span><span>Status</span><span>Attempts</span><span>Queued</span><span>Result</span></div>
      {snapshot.jobs.map((job) => <div className="job-row" key={job.id}><span>{job.kind.replaceAll("_", " ")}</span><span className={`status status-${job.status.toLowerCase()}`}>{job.status}</span><span>{job.attempts} / 3</span><span>{fmtTime(job.queuedAt)}</span><span>{job.lastError || (job.completedAt ? "Completed" : "Waiting")}</span></div>)}
      {snapshot.jobs.length === 0 && <div className="empty">No background jobs have been queued.</div>}
    </section>
    <section className="panel audit-panel">
      <div className="panel-heading"><div><span className="eyebrow">Traceability</span><h2>Audit stream</h2></div><History size={18} /></div>
      {snapshot.audit.slice(0, 10).map((event) => <div className="audit-row" key={event.id}><span>{event.action.replaceAll("_", " ")}</span><span>{event.actor}</span><span>{fmtTime(event.at)}</span><code>{JSON.stringify(event.details)}</code></div>)}
    </section>
  </>;
}
