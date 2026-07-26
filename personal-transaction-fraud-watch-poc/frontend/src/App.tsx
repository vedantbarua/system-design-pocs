import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Bell, Check, ClipboardCheck, Clock3, CreditCard, Database, FileCheck, History, Home, LockKeyhole, Menu, PackageCheck, RefreshCw, RotateCcw, Server, ShieldCheck, Tags, X } from "lucide-react";

type View = "overview" | "transactions" | "events" | "operations";
type Card = { id: string; nickname: string; holder: string; last4: string; homeCountry: string; frozen: boolean; dailyLimit: number; updatedAt: string };
type Transaction = { id: string; cardId: string; merchant: string; category: string; amount: number; currency: string; city: string; country: string; occurredAt: string; status: string; riskScore: number; riskReasons: string[]; fingerprint: string; updatedAt: string };
type Rules = { largeAmount: number; velocityCount: number; velocityMinutes: number; highRiskCategories: string[] };
type Event = { id: string; transactionId: string; type: string; occurredAt: string; merchant: string; category: string; amount: number; source: string };
type Alert = { id: string; transactionId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { cards: Card[]; transactions: Transaction[]; rules: Rules; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; cards: number; frozenCards: number; transactions: number; highRisk: number; disputed: number; blocked: number; safe: number; duplicates: number; queuedAlerts: number; queuedJobs: number } };
type Health = { kafka: string; postgres: string; redis: string; bufferedMessages: number };

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const date = (value: string) => fmt.format(new Date(value));
const label = (value: string) => value.replaceAll("_", " ");
const amount = (tx: Transaction) => tx.currency === "USD" ? money.format(tx.amount) : `${tx.amount.toFixed(2)} ${tx.currency}`;

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

  useEffect(() => { load().catch(() => setToast("Start API on port 8343")); }, []);
  const card = (id: string) => data?.cards.find((candidate) => candidate.id === id);
  const transaction = (id: string) => data?.transactions.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.transactions.filter((candidate) => candidate.riskScore >= 60 || ["DISPUTED", "BLOCKED"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading fraud watch</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Home /></span><div><strong>FraudWatch</strong><small>TRANSACTION RISK</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Risk readiness</small><strong>{data.metrics.score}%</strong><p>{data.metrics.highRisk} high-risk transactions</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["transactions", "Transactions", CreditCard], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Transaction events, velocity windows, anomaly scoring, disputes, and alerts</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={CreditCard} label="Cards" value={`${data.metrics.cards}`} />
              <Metric icon={AlertTriangle} label="High risk" value={`${data.metrics.highRisk}`} />
              <Metric icon={LockKeyhole} label="Frozen" value={`${data.metrics.frozenCards}`} />
              <Metric icon={ClipboardCheck} label="Safe" value={`${data.metrics.safe}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <TransactionRow entry={entry} key={entry.id} />)}
              </Panel>
              <Panel title="Queued alerts">
                {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{transaction(alert.transactionId)?.merchant || alert.transactionId} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
              </Panel>
            </div>
          </> : null}
          {view === "transactions" ? <>
            <Panel title="Risk-scored transaction stream">{data.transactions.map((entry) => <TransactionRow entry={entry} key={entry.id} />)}</Panel>
            <Panel title="Cards">{data.cards.map((entry) => <div className="incident" key={entry.id}><CreditCard /><div><strong>{entry.nickname}</strong><small>{entry.holder} · ending {entry.last4} · {entry.homeCountry} · {money.format(entry.dailyLimit)} daily limit</small></div><b className={entry.frozen ? "blocked" : "secure"}>{entry.frozen ? "FROZEN" : "ACTIVE"}</b></div>)}</Panel>
            <Panel title="Rules"><div className="rollup"><span><small>Large amount</small><strong>{money.format(data.rules.largeAmount)}</strong></span><span><small>Velocity</small><strong>{data.rules.velocityCount}/{data.rules.velocityMinutes}m</strong></span><span><small>Categories</small><strong>{data.rules.highRiskCategories.length}</strong></span><span><small>Duplicates</small><strong>{data.metrics.duplicates}</strong></span></div></Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent fraud event stream"><div className="thead"><span>Merchant</span><span>Type</span><span>Category</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.merchant}</strong><span>{label(event.type)}</span><span>{label(event.category)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["RISK_SCAN", "VELOCITY_REBUILD", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `safe-${Date.now()}`, transactionId: "tx-paris", type: "TRANSACTION_MARKED_SAFE" })}>Mark Paris safe</button>
              <button onClick={() => act("/api/events", { eventId: `dispute-${Date.now()}`, transactionId: "tx-laptop", type: "DISPUTE_OPENED" })}>Dispute laptop</button>
              <button onClick={() => act("/api/events", { eventId: `freeze-${Date.now()}`, transactionId: "tx-paris", type: "CARD_FROZEN", cardId: "card-primary" })}>Freeze card</button>
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

function TransactionRow({ entry }: { entry: Transaction }) {
  return <div className="room"><Tags /><div><strong>{entry.merchant}</strong><small>{label(entry.category)} · {amount(entry)} · {entry.city}, {entry.country} · {cardLabel(entry.cardId)} · {entry.riskReasons.join(", ") || "baseline"}</small></div><span>{entry.riskScore}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function cardLabel(cardId: string) { return cardId.replace("card-", ""); }
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
