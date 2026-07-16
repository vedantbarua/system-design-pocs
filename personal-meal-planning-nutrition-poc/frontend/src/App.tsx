import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Bell, Boxes, CalendarDays, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Home, Menu, PackageCheck, RefreshCw, RotateCcw, Server, ShoppingCart, Tags, X } from "lucide-react";

type View = "overview" | "meals" | "events" | "operations";
type MealPlan = { id: string; day: string; slot: string; recipe: string; servings: number; calories: number; protein: number; fiber: number; sodium: number; budget: number; ingredients: string[]; status: string; updatedAt: string; notes: string };
type GroceryGap = { id: string; item: string; quantity: number; unit: string; neededBy: string; sourceMealId: string; duplicateOf: string | null; status: string };
type PantryItem = { id: string; name: string; quantity: number; unit: string; expiresAt: string; updatedAt: string };
type Event = { id: string; mealId: string; type: string; occurredAt: string; recipe: string; slot: string; source: string };
type Alert = { id: string; mealId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Target = { calories: number; protein: number; fiber: number; sodium: number; budget: number; restrictions: string[] };
type Snapshot = { meals: MealPlan[]; groceries: GroceryGap[]; pantry: PantryItem[]; target: Target; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; meals: number; planned: number; needsGroceries: number; cooked: number; groceries: number; duplicates: number; expiring: number; queuedAlerts: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8340")); }, []);
  const meal = (id: string) => data?.meals.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.meals.filter((candidate) => ["NEEDS_GROCERIES", "SKIPPED", "DUPLICATE"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading meal plan</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Home /></span><div><strong>MealPlan</strong><small>NUTRITION OPS</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Meal readiness</small><strong>{data.metrics.score}%</strong><p>{data.metrics.groceries} grocery gaps</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["meals", "Meals", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Weekly meals, nutrition targets, pantry gaps, and reminders</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={CalendarDays} label="Meals" value={`${data.metrics.meals}`} />
              <Metric icon={ShoppingCart} label="Gaps" value={`${data.metrics.groceries}`} />
              <Metric icon={AlertTriangle} label="Expiring" value={`${data.metrics.expiring}`} />
              <Metric icon={ClipboardCheck} label="Cooked" value={`${data.metrics.cooked}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <MealRow entry={entry} key={entry.id} />)}
              </Panel>
              <Panel title="Queued alerts">
                {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{meal(alert.mealId)?.recipe || alert.mealId} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
              </Panel>
            </div>
          </> : null}
          {view === "meals" ? <>
            <Panel title="Weekly meal plan">{data.meals.map((entry) => <MealRow entry={entry} key={entry.id} />)}</Panel>
            <Panel title="Grocery gaps">{data.groceries.map((gap) => <div className="incident" key={gap.id}><ShoppingCart /><div><strong>{gap.item}</strong><small>{gap.quantity} {gap.unit} · needed {date(gap.neededBy)} · {meal(gap.sourceMealId)?.recipe || gap.sourceMealId}</small></div><b className={gap.status.toLowerCase()}>{label(gap.status)}</b></div>)}</Panel>
            <Panel title="Pantry watch">{data.pantry.map((item) => <div className="incident" key={item.id}><Boxes /><div><strong>{item.name}</strong><small>{item.quantity} {item.unit} · expires {date(item.expiresAt)}</small></div><b>{item.quantity > 0 ? "IN STOCK" : "EMPTY"}</b></div>)}</Panel>
            <Panel title="Daily target"><div className="rollup"><span><small>Calories</small><strong>{data.target.calories}</strong></span><span><small>Protein</small><strong>{data.target.protein}g</strong></span><span><small>Fiber</small><strong>{data.target.fiber}g</strong></span><span><small>Budget</small><strong>{money.format(data.target.budget)}</strong></span></div></Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent meal event stream"><div className="thead"><span>Meal</span><span>Type</span><span>Slot</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.recipe}</strong><span>{label(event.type)}</span><span>{label(event.slot)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["MEAL_SCAN", "GROCERY_REBUILD", "REMINDER_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `cook-${Date.now()}`, mealId: "meal-tacos", type: "MEAL_COOKED" })}>Cook tacos</button>
              <button onClick={() => act("/api/events", { eventId: `swap-${Date.now()}`, mealId: "meal-pasta", type: "RECIPE_SWAPPED", recipe: "Chickpea pasta", ingredients: ["chickpea pasta", "spinach", "tomato sauce"], calories: 700, protein: 44, fiber: 18, notes: "Higher protein." })}>Swap pasta</button>
              <button onClick={() => act("/api/events", { eventId: `grocery-${Date.now()}`, mealId: "meal-tacos", type: "GROCERY_ADDED", item: "tortillas", day: new Date(Date.now() + 86_400_000).toISOString() })}>Add grocery</button>
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

function MealRow({ entry }: { entry: MealPlan }) {
  return <div className="room"><Tags /><div><strong>{entry.recipe}</strong><small>{label(entry.slot)} · {entry.servings} serving{entry.servings === 1 ? "" : "s"} · {entry.calories} cal · {entry.protein}g protein · {date(entry.day)}</small></div><span>{money.format(entry.budget)}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
