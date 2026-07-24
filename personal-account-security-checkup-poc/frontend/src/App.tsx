import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Bell, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Home, KeyRound, LockKeyhole, Menu, PackageCheck, RefreshCw, RotateCcw, Server, ShieldCheck, Tags, X } from "lucide-react";

type View = "overview" | "accounts" | "events" | "operations";
type Account = { id: string; provider: string; username: string; category: string; domain: string; importance: string; mfaEnabled: boolean; mfaMethod: string; recoveryEmail: string; recoveryPhone: string; passwordLastChangedAt: string; lastLoginAt: string; activeSessions: number; riskScore: number; status: string; updatedAt: string; notes: string };
type Breach = { id: string; accountId: string; source: string; severity: string; detectedAt: string; resolvedAt: string | null };
type Checklist = { id: string; status: string; accountCount: number; highRiskCount: number; generatedAt: string; checksum: string };
type Event = { id: string; accountId: string; type: string; occurredAt: string; provider: string; category: string; source: string };
type Alert = { id: string; accountId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { accounts: Account[]; breaches: Breach[]; checklists: Checklist[]; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; accounts: number; critical: number; mfaMissing: number; recoveryGaps: number; stalePasswords: number; breached: number; duplicates: number; highRisk: number; checklists: number; queuedAlerts: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8342")); }, []);
  const account = (id: string) => data?.accounts.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.accounts.filter((candidate) => candidate.riskScore >= 50 || ["MFA_MISSING", "RECOVERY_INCOMPLETE", "PASSWORD_STALE", "BREACHED", "DUPLICATE"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading security checkup</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Home /></span><div><strong>AccountGuard</strong><small>SECURITY CHECKUP</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Security readiness</small><strong>{data.metrics.score}%</strong><p>{data.metrics.highRisk} high-risk accounts</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["accounts", "Accounts", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Account metadata, MFA, recovery readiness, breach checks, and reminders</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={LockKeyhole} label="Accounts" value={`${data.metrics.accounts}`} />
              <Metric icon={ShieldCheck} label="Critical" value={`${data.metrics.critical}`} />
              <Metric icon={AlertTriangle} label="MFA gaps" value={`${data.metrics.mfaMissing}`} />
              <Metric icon={FileCheck} label="Checklists" value={`${data.metrics.checklists}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <AccountRow entry={entry} key={entry.id} />)}
              </Panel>
              <Panel title="Queued alerts">
                {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{account(alert.accountId)?.provider || alert.accountId} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
              </Panel>
            </div>
          </> : null}
          {view === "accounts" ? <>
            <Panel title="Account risk register">{data.accounts.map((entry) => <AccountRow entry={entry} key={entry.id} />)}</Panel>
            <Panel title="Open breach findings">{data.breaches.map((breach) => <div className="incident" key={breach.id}><AlertTriangle /><div><strong>{account(breach.accountId)?.provider}</strong><small>{breach.source} · {label(breach.severity)} · {date(breach.detectedAt)}</small></div><b className={breach.resolvedAt ? "resolved" : "breached"}>{breach.resolvedAt ? "RESOLVED" : "OPEN"}</b></div>)}</Panel>
            <Panel title="Recovery checklists">{data.checklists.map((checklist) => <div className="incident" key={checklist.id}><ClipboardCheck /><div><strong>{checklist.id}</strong><small>{checklist.accountCount} accounts · {checklist.highRiskCount} high risk · {date(checklist.generatedAt)}</small></div><b className={checklist.status.toLowerCase()}>{checklist.checksum}</b></div>)}</Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent account security event stream"><div className="thead"><span>Account</span><span>Type</span><span>Category</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.provider}</strong><span>{label(event.type)}</span><span>{label(event.category)}</span><span>{event.source}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["SECURITY_SCAN", "BREACH_IMPORT", "CHECKLIST_EXPORT", "REMINDER_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `mfa-${Date.now()}`, accountId: "acct-bank", type: "MFA_ENABLED", mfaMethod: "TOTP" })}>Enable bank MFA</button>
              <button onClick={() => act("/api/events", { eventId: `recover-${Date.now()}`, accountId: "acct-shop", type: "RECOVERY_UPDATED", recoveryEmail: "backup@example.com", recoveryPhone: "+15550000000" })}>Fix recovery</button>
              <button onClick={() => act("/api/events", { eventId: `export-${Date.now()}`, accountId: "acct-email", type: "EXPORT_REQUESTED" })}>Create checklist</button>
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

function AccountRow({ entry }: { entry: Account }) {
  return <div className="room"><Tags /><div><strong>{entry.provider}</strong><small>{entry.username} · {label(entry.category)} · {entry.domain} · {entry.mfaEnabled ? label(entry.mfaMethod) : "MFA missing"} · {entry.activeSessions} sessions</small></div><span>{entry.riskScore}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
