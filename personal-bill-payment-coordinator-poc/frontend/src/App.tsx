import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Check, Clock3, CreditCard, Database, FileCheck, History, Menu, ReceiptText, RefreshCw, RotateCcw, Server, Tags, WalletCards, X } from "lucide-react";

type View = "overview" | "bills" | "events" | "operations";
type Bill = { id: string; payee: string; category: string; amountCents: number; dueAt: string; autopay: boolean; paymentMethod: string; confirmationCode: string | null; status: string; accountLast4: string };
type Payment = { id: string; billId: string; amountCents: number; scheduledFor: string; paidAt: string | null; method: string; confirmationCode: string | null; status: string };
type Event = { id: string; billId: string; type: string; occurredAt: string; payee: string; amountCents: number; source: string };
type Alert = { id: string; billId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; billId: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { bills: Bill[]; payments: Payment[]; events: Event[]; alerts: Alert[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; metrics: { open: number; dueSoon: number; overdue: number; paid: number; monthlyTotal: number; queuedAlerts: number; queuedReminders: number; queuedJobs: number } };
type Health = { kafka: string; postgres: string; redis: string; bufferedMessages: number };

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8250")); }, []);
  const bill = (id: string) => data?.bills.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.bills.filter((candidate) => ["DUE_SOON", "OVERDUE", "AUTOPAY_FAILED", "NEEDS_CONFIRMATION"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading bills</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><ReceiptText /></span><div><strong>BillDesk</strong><small>HOUSEHOLD PAYMENTS</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Monthly total</small><strong>{dollars(data.metrics.monthlyTotal)}</strong><p>{data.metrics.overdue} urgent items</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["bills", "Bills", WalletCards], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Personal bill payment coordinator</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={ReceiptText} label="Open" value={`${data.metrics.open}`} />
              <Metric icon={Clock3} label="Due soon" value={`${data.metrics.dueSoon}`} />
              <Metric icon={AlertTriangle} label="Overdue" value={`${data.metrics.overdue}`} />
              <Metric icon={Check} label="Paid" value={`${data.metrics.paid}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <div className="room" key={entry.id}><FileCheck /><div><strong>{entry.payee}</strong><small>{label(entry.category)} · {date(entry.dueAt)} · {dollars(entry.amountCents)}</small></div><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}
              </Panel>
              <Panel title="Reminders">
                {data.reminders.map((reminder) => <div className="recommendation" key={reminder.id}><Clock3 /><div><strong>{bill(reminder.billId)?.payee}</strong><small>{date(reminder.scheduledFor)}</small></div><b className={reminder.status.toLowerCase()}>{reminder.status}</b></div>)}
              </Panel>
            </div>
            <Panel title="Active alerts">
              {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{bill(alert.billId)?.payee} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
            </Panel>
          </> : null}
          {view === "bills" ? <>
            <Panel title="Bill queue">{data.bills.map((entry) => <div className="room" key={entry.id}><Tags /><div><strong>{entry.payee}</strong><small>{label(entry.category)} · {entry.paymentMethod} · acct {entry.accountLast4}</small></div><span>{dollars(entry.amountCents)}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>)}</Panel>
            <Panel title="Payments">{data.payments.map((entry) => <div className="room" key={entry.id}><CreditCard /><div><strong>{bill(entry.billId)?.payee}</strong><small>{entry.method} · {date(entry.scheduledFor)} · {entry.confirmationCode || "No confirmation"}</small></div><b className={entry.status.toLowerCase()}>{entry.status}</b></div>)}</Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent bill event stream"><div className="thead"><span>Bill</span><span>Type</span><span>Amount</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.payee}</strong><span>{label(event.type)}</span><span>{dollars(event.amountCents)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">{["BILL_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}<button onClick={() => act("/api/jobs/fail-next")}>Fail next</button><button className="primary" onClick={() => act("/api/jobs/drain")}>Drain jobs</button><button onClick={() => act("/api/reset")}><RotateCcw /></button></div>
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
