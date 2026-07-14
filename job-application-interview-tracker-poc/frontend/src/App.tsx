import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Briefcase, CalendarDays, Check, ClipboardCheck, Clock3, Database, FileCheck, History, Menu, PackageCheck, RefreshCw, RotateCcw, Server, Tags, X } from "lucide-react";

type View = "overview" | "applications" | "events" | "operations";
type Application = { id: string; company: string; role: string; source: string; location: string; salaryMin: number; salaryMax: number; status: string; priority: string; nextActionAt: string; lastContactAt: string; resumeVersion: string; notes: string };
type Interview = { id: string; applicationId: string; round: string; scheduledAt: string; status: string; notes: string };
type Offer = { id: string; applicationId: string; salary: number; bonus: number; deadlineAt: string; status: string; notes: string };
type Event = { id: string; applicationId: string; type: string; occurredAt: string; company: string; role: string; eventSource: string };
type Alert = { id: string; applicationId: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = { applications: Application[]; interviews: Interview[]; offers: Offer[]; events: Event[]; alerts: Alert[]; jobs: Job[]; audit: Audit[]; metrics: { score: number; total: number; active: number; followUps: number; interviews: number; offers: number; stale: number; duplicates: number; rejected: number; queuedAlerts: number; queuedJobs: number } };
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

  useEffect(() => { load().catch(() => setToast("Start API on port 8320")); }, []);
  const application = (id: string) => data?.applications.find((candidate) => candidate.id === id);
  const attention = useMemo(() => data?.applications.filter((candidate) => ["FOLLOW_UP_DUE", "STALE", "INTERVIEW", "OFFER", "DUPLICATE"].includes(candidate.status)) || [], [data]);

  if (!data) return <div className="loading"><RefreshCw />Loading job search</div>;

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header><span><Briefcase /></span><div><strong>CareerLoop</strong><small>JOB SEARCH</small></div><button onClick={() => setMenu(false)}><X /></button></header>
        <section><small>Pipeline health</small><strong>{data.metrics.score}%</strong><p>{data.metrics.active} active applications</p></section>
        <nav>
          {([["overview", "Overview", Activity], ["applications", "Applications", PackageCheck], ["events", "Events", History], ["operations", "Operations", Server]] as const).map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon />{title}{id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}</button>
          ))}
        </nav>
        <footer><Database /><span><strong>{health?.postgres || "memory"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></span></footer>
      </aside>
      <main>
        <header className="top"><button onClick={() => setMenu(true)}><Menu /></button><div><small>Applications, interviews, offers, and follow-ups</small><h1>{view[0].toUpperCase() + view.slice(1)}</h1></div><span><Bell /><small>{data.metrics.queuedAlerts} queued alerts</small></span></header>
        <div className="content">
          {view === "overview" ? <>
            <div className="metrics">
              <Metric icon={ClipboardCheck} label="Active" value={`${data.metrics.active}`} />
              <Metric icon={Clock3} label="Follow-ups" value={`${data.metrics.followUps}`} />
              <Metric icon={CalendarDays} label="Interviews" value={`${data.metrics.interviews}`} />
              <Metric icon={FileCheck} label="Offers" value={`${data.metrics.offers}`} />
            </div>
            <div className="grid">
              <Panel title="Needs attention">
                {attention.map((entry) => <ApplicationRow entry={entry} key={entry.id} />)}
              </Panel>
              <Panel title="Queued alerts">
                {data.alerts.slice(0, 8).map((alert) => <div className="incident" key={alert.id}><AlertTriangle /><div><strong>{label(alert.kind)}</strong><small>{application(alert.applicationId)?.company} · {date(alert.createdAt)}</small></div><b className={alert.status.toLowerCase()}>{alert.status}</b></div>)}
              </Panel>
            </div>
          </> : null}
          {view === "applications" ? <>
            <Panel title="Application pipeline">{data.applications.map((entry) => <ApplicationRow entry={entry} key={entry.id} />)}</Panel>
            <Panel title="Interview loop">{data.interviews.map((interview) => <div className="incident" key={interview.id}><CalendarDays /><div><strong>{application(interview.applicationId)?.company} · {interview.round}</strong><small>{label(interview.status)} · {date(interview.scheduledAt)} · {interview.notes}</small></div><b className={interview.status.toLowerCase()}>{interview.status}</b></div>)}</Panel>
            <Panel title="Offer comparison">{data.offers.map((offer) => <div className="incident" key={offer.id}><FileCheck /><div><strong>{application(offer.applicationId)?.company}</strong><small>{money.format(offer.salary)} salary · {money.format(offer.bonus)} bonus · deadline {date(offer.deadlineAt)}</small></div><b className={offer.status.toLowerCase()}>{label(offer.status)}</b></div>)}</Panel>
          </> : null}
          {view === "events" ? <Panel title="Idempotent application event stream"><div className="thead"><span>Company</span><span>Type</span><span>Role</span><span>Source</span><span>Occurred</span></div>{data.events.map((event) => <div className="event" key={event.id}><strong>{event.company}</strong><span>{label(event.type)}</span><span>{event.role}</span><span>{event.eventSource}</span><span>{date(event.occurredAt)}</span></div>)}</Panel> : null}
          {view === "operations" ? <>
            <div className="actions">
              {["APPLICATION_SCAN", "OFFER_REVIEW", "REMINDER_DISPATCH", "RETENTION"].map((kind) => <button onClick={() => act("/api/jobs", { kind })} key={kind}>{kind.split("_")[0]}</button>)}
              <button onClick={() => act("/api/events", { eventId: `interview-${Date.now()}`, applicationId: "app-contoso", type: "INTERVIEW_SCHEDULED", round: "Hiring manager", scheduledAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString() })}>Schedule interview</button>
              <button onClick={() => act("/api/events", { eventId: `offer-${Date.now()}`, applicationId: "app-contoso", type: "OFFER_RECEIVED", offerSalary: 170000, offerBonus: 15000, offerDeadlineAt: new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString() })}>Add offer</button>
              <button onClick={() => act("/api/events", { eventId: `dupe-${Date.now()}`, applicationId: "app-northwind-copy", type: "APPLICATION_ADDED", company: "Northwind Labs", role: "Senior Frontend Engineer", source: "Indeed", location: "Remote", salaryMin: 150000, salaryMax: 185000 })}>Duplicate post</button>
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

function ApplicationRow({ entry }: { entry: Application }) {
  return <div className="room"><Tags /><div><strong>{entry.company} · {entry.role}</strong><small>{entry.source} · {entry.location} · {entry.resumeVersion} · next {date(entry.nextActionAt)}</small></div><span>{money.format(entry.salaryMin)}-{money.format(entry.salaryMax)}</span><b className={entry.status.toLowerCase()}>{label(entry.status)}</b></div>;
}
function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <article><Icon /><small>{label}</small><strong>{value}</strong></article>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><header><h2>{title}</h2></header>{children}</section>; }
