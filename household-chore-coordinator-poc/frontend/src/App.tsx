import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bell, CalendarDays, Check, CheckCircle2, ChevronRight,
  CircleGauge, ClipboardCheck, Clock3, Database, History, Home, ListRestart, LockKeyhole,
  Menu, Plus, RefreshCw, RotateCcw, Server, ShieldCheck, Sparkles, TimerReset, UserRound,
  Users, WifiOff, X, Zap
} from "lucide-react";

type View = "today" | "schedule" | "workload" | "operations";
type Member = { id: string; name: string; initials: string; color: string; active: boolean };
type Definition = { id: string; name: string; area: string; recurrenceDays: number; effortPoints: number; anchorAt: string; active: boolean; eligibleMemberIds: string[] };
type Claim = { id: string; holderId: string; fencingToken: number; acquiredAt: string; expiresAt: string };
type Task = { id: string; choreId: string; occurrenceKey: string; dueAt: string; assignedTo: string; status: "OPEN" | "CLAIMED" | "OVERDUE" | "COMPLETED"; claim: Claim | null; completedAt: string | null; completedBy: string | null; escalationLevel: number };
type Reminder = { id: string; taskId: string; memberId: string; kind: string; status: string; createdAt: string; sentAt: string | null };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; completedAt: string | null; lastError: string | null };
type Audit = { id: string; action: string; actor: string; details: Record<string, unknown>; at: string };
type Workload = Member & { assignedTasks: number; openPoints: number; completedTasks: number; completedPoints: number; overdueTasks: number };
type Snapshot = {
  members: Member[]; definitions: Definition[]; tasks: Task[]; reminders: Reminder[]; jobs: Job[]; audit: Audit[]; workload: Workload[];
  metrics: { routines: number; openTasks: number; dueToday: number; overdue: number; claimed: number; completed: number; queuedReminders: number; queuedJobs: number };
};
type Health = { status: string; kafka: string; postgres: string; redis: string; bufferedMessages: number };

const nav = [
  { id: "today" as const, label: "Today", icon: CheckCircle2 },
  { id: "schedule" as const, label: "Schedule", icon: CalendarDays },
  { id: "workload" as const, label: "Workload", icon: BarChart3 },
  { id: "operations" as const, label: "Operations", icon: Server }
];

const fmtTime = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const relativeDue = (value: string) => {
  const hours = Math.round((new Date(value).getTime() - Date.now()) / 3_600_000);
  if (hours < -24) return `${Math.abs(Math.round(hours / 24))}d overdue`;
  if (hours < 0) return `${Math.abs(hours)}h overdue`;
  if (hours < 1) return "Due soon";
  if (hours < 24) return `In ${hours}h`;
  return `In ${Math.round(hours / 24)}d`;
};

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [view, setView] = useState<View>("today");
  const [currentMemberId, setCurrentMemberId] = useState("member-vedant");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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

  useEffect(() => { refresh().catch(() => setToast("Start the API on port 8189")); }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!snapshot) return <div className="loading"><RefreshCw className="spin" size={19} /> Loading homeboard</div>;
  const pageTitle = nav.find((item) => item.id === view)?.label || "Today";
  const currentMember = snapshot.members.find((member) => member.id === currentMemberId) || snapshot.members[0];
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark"><Home size={20} /></div><div><strong>Homeboard</strong><span>SHARED CHORES</span></div><button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={18} /></button></div>
      <div className="household"><span>Household</span><strong>Maple Street</strong><small>{snapshot.members.length} members · {snapshot.metrics.routines} routines</small></div>
      <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMenuOpen(false); }}><Icon size={17} />{label}{id === "today" && snapshot.metrics.overdue > 0 && <span>{snapshot.metrics.overdue}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="infra"><Database size={17} /><div><strong>{health?.postgres === "postgres" ? "Connected storage" : "Memory workspace"}</strong><small>Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}</small></div><i className={health?.status === "ok" ? "online" : ""} /></div>
        <button className="reset-button" onClick={() => request("/api/reset", { method: "POST" }, "Demo data restored")}><RotateCcw size={14} />Reset demo</button>
      </div>
    </aside>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    <main>
      <header className="topbar"><button className="icon-button menu-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={19} /></button><div><p>Maple Street / {pageTitle}</p><h1>{pageTitle}</h1></div><div className="member-picker"><div className="avatar" style={{ background: currentMember.color }}>{currentMember.initials}</div><select aria-label="Acting member" value={currentMemberId} onChange={(event) => setCurrentMemberId(event.target.value)}>{snapshot.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></div></header>
      <div className={`content ${busy ? "content-busy" : ""}`}>
        {view === "today" && <Today snapshot={snapshot} memberId={currentMemberId} request={request} setView={setView} />}
        {view === "schedule" && <Schedule snapshot={snapshot} request={request} />}
        {view === "workload" && <WorkloadView snapshot={snapshot} />}
        {view === "operations" && <Operations snapshot={snapshot} health={health} request={request} />}
      </div>
    </main>
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>;
}

function Metric({ icon: Icon, tone, label, value, detail }: { icon: typeof Activity; tone: string; label: string; value: number | string; detail: string }) {
  return <div className={`metric metric-${tone}`}><div className="metric-icon"><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function Today({ snapshot, memberId, request, setView }: { snapshot: Snapshot; memberId: string; request: (path: string, options?: RequestInit, message?: string) => Promise<void>; setView: (view: View) => void }) {
  const definition = (id: string) => snapshot.definitions.find((item) => item.id === id)!;
  const member = (id: string) => snapshot.members.find((item) => item.id === id)!;
  const tasks = snapshot.tasks.filter((task) => task.status !== "COMPLETED").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const activeClaim = (task: Task) => task.claim && task.claim.expiresAt > new Date().toISOString() ? task.claim : null;
  async function claim(task: Task) { await request(`/api/tasks/${task.id}/claim`, { method: "POST", body: JSON.stringify({ memberId, ttlMinutes: 15 }) }, `${definition(task.choreId).name} claimed`); }
  async function complete(task: Task, offline = false) {
    const input = { eventId: `${offline ? "offline" : "ui"}-${Date.now()}`, taskId: task.id, memberId, fencingToken: task.claim?.fencingToken ?? null };
    await request(offline ? "/api/completions/publish" : "/api/completions", { method: "POST", body: JSON.stringify(input) }, offline ? "Completion queued offline" : "Chore completed");
  }
  return <>
    <section className="metrics-grid">
      <Metric icon={ClipboardCheck} tone="blue" label="Open chores" value={snapshot.metrics.openTasks} detail={`${snapshot.metrics.dueToday} due in 24 hours`} />
      <Metric icon={AlertTriangle} tone="rose" label="Overdue" value={snapshot.metrics.overdue} detail={`${snapshot.metrics.queuedReminders} reminders queued`} />
      <Metric icon={LockKeyhole} tone="amber" label="Active claims" value={snapshot.metrics.claimed} detail="15 minute claim leases" />
      <Metric icon={CheckCircle2} tone="green" label="Completed" value={snapshot.metrics.completed} detail="Current schedule window" />
    </section>
    <section className="today-heading"><div><span className="eyebrow">Priority queue</span><h2>Next up</h2></div><button className="text-button" onClick={() => setView("schedule")}>Full schedule <ChevronRight size={14} /></button></section>
    <section className="task-list panel">
      {tasks.slice(0, 10).map((task) => {
        const chore = definition(task.choreId);
        const lease = activeClaim(task);
        const owned = lease?.holderId === memberId;
        return <article className={`task-row ${task.status === "OVERDUE" ? "overdue" : ""}`} key={task.id}>
          <div className={`area-mark area-${chore.area.toLowerCase()}`}><Sparkles size={17} /></div>
          <div className="task-info"><div><span className={`status status-${task.status.toLowerCase()}`}>{task.status}</span>{task.escalationLevel > 1 && <span className="status status-escalated">Escalated</span>}</div><h3>{chore.name}</h3><p>{chore.area} · {chore.effortPoints} effort points</p></div>
          <div className="assignee"><div className="avatar small" style={{ background: member(task.assignedTo).color }}>{member(task.assignedTo).initials}</div><span><strong>{member(task.assignedTo).name}</strong><small>Assigned</small></span></div>
          <div className="due"><strong>{relativeDue(task.dueAt)}</strong><small>{fmtTime(task.dueAt)}</small></div>
          <div className="task-actions">
            {!lease && <button className="button secondary" onClick={() => claim(task)}><LockKeyhole size={14} />Claim</button>}
            {lease && !owned && <span className="lease-label"><LockKeyhole size={13} />{member(lease.holderId).name}</span>}
            {owned && <><button className="icon-button" title="Queue offline completion" aria-label="Queue offline completion" onClick={() => complete(task, true)}><WifiOff size={15} /></button><button className="button" onClick={() => complete(task)}><Check size={15} />Done</button></>}
          </div>
        </article>;
      })}
    </section>
  </>;
}

function Schedule({ snapshot, request }: { snapshot: Snapshot; request: (path: string, options?: RequestInit, message?: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("Kitchen");
  const [recurrenceDays, setRecurrenceDays] = useState(7);
  const [effortPoints, setEffortPoints] = useState(2);
  const definition = (id: string) => snapshot.definitions.find((item) => item.id === id)!;
  async function submit(event: FormEvent) {
    event.preventDefault();
    await request("/api/definitions", { method: "POST", body: JSON.stringify({ name, area, recurrenceDays, effortPoints }) }, "Routine created");
    setName("");
  }
  const grouped = useMemo(() => {
    const days = new Map<string, Task[]>();
    for (const task of snapshot.tasks.filter((item) => item.status !== "COMPLETED")) {
      const key = new Date(task.dueAt).toISOString().slice(0, 10);
      days.set(key, [...(days.get(key) || []), task]);
    }
    return [...days.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [snapshot.tasks]);
  return <>
    <section className="routine-form panel"><div><span className="eyebrow">Recurring work</span><h2>Add routine</h2></div><form onSubmit={submit}><input required placeholder="Routine name" value={name} onChange={(event) => setName(event.target.value)} /><select value={area} onChange={(event) => setArea(event.target.value)}>{["Kitchen", "Bathroom", "Laundry", "Outside", "General"].map((value) => <option key={value}>{value}</option>)}</select><label><span>Every</span><input aria-label="Recurrence days" type="number" min="1" max="30" value={recurrenceDays} onChange={(event) => setRecurrenceDays(Number(event.target.value))} /><span>days</span></label><label><input aria-label="Effort points" type="number" min="1" max="10" value={effortPoints} onChange={(event) => setEffortPoints(Number(event.target.value))} /><span>points</span></label><button className="button"><Plus size={15} />Add</button></form></section>
    <div className="schedule-grid">
      <section className="panel routine-panel"><div className="panel-heading"><div><span className="eyebrow">Rules</span><h2>{snapshot.definitions.length} active routines</h2></div><ListRestart size={18} /></div>{snapshot.definitions.map((item) => <div className="routine-row" key={item.id}><div className={`area-mark area-${item.area.toLowerCase()}`}><Sparkles size={15} /></div><div><strong>{item.name}</strong><small>{item.area}</small></div><span>Every {item.recurrenceDays}d</span><b>{item.effortPoints} pts</b></div>)}</section>
      <section className="calendar-column">{grouped.slice(0, 7).map(([day, tasks]) => <div className="day-group panel" key={day}><header><strong>{new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`))}</strong><span>{tasks.length} chore{tasks.length === 1 ? "" : "s"}</span></header>{tasks.map((task) => <div className="calendar-task" key={task.id}><span className={`dot status-${task.status.toLowerCase()}`} /><div><strong>{definition(task.choreId).name}</strong><small>{fmtTime(task.dueAt)} · {definition(task.choreId).area}</small></div><span className={`status status-${task.status.toLowerCase()}`}>{task.status}</span></div>)}</div>)}</section>
    </div>
  </>;
}

function WorkloadView({ snapshot }: { snapshot: Snapshot }) {
  const maxPoints = Math.max(...snapshot.workload.map((item) => item.openPoints), 1);
  const totalPoints = snapshot.workload.reduce((sum, item) => sum + item.openPoints, 0);
  return <>
    <section className="workload-summary"><div><span className="eyebrow">Assignment projection</span><h2>{totalPoints} open effort points</h2></div><div className="fairness"><CircleGauge size={19} /><span><strong>{Math.max(...snapshot.workload.map((item) => item.openPoints)) - Math.min(...snapshot.workload.map((item) => item.openPoints))} point spread</strong><small>Lower is more balanced</small></span></div></section>
    <section className="workload-grid">{snapshot.workload.map((item) => <article className="member-card" key={item.id}><header><div className="avatar large" style={{ background: item.color }}>{item.initials}</div><div><h3>{item.name}</h3><p>{item.assignedTasks} assigned chores</p></div><span className={`status ${item.overdueTasks ? "status-overdue" : "status-completed"}`}>{item.overdueTasks ? `${item.overdueTasks} overdue` : "On track"}</span></header><div className="point-total"><strong>{item.openPoints}</strong><span>open points</span></div><div className="bar"><i style={{ width: `${(item.openPoints / maxPoints) * 100}%`, background: item.color }} /></div><footer><span><CheckCircle2 size={14} />{item.completedTasks} completed</span><span>{item.completedPoints} earned points</span></footer></article>)}</section>
    <section className="panel assignment-table"><div className="panel-heading"><div><span className="eyebrow">Upcoming ownership</span><h2>Assignment distribution</h2></div><Users size={18} /></div>{snapshot.tasks.filter((task) => task.status !== "COMPLETED").slice(0, 12).map((task) => { const chore = snapshot.definitions.find((item) => item.id === task.choreId)!; const owner = snapshot.members.find((item) => item.id === task.assignedTo)!; return <div className="assignment-row" key={task.id}><span>{chore.name}</span><span>{chore.area}</span><span>{relativeDue(task.dueAt)}</span><div><div className="avatar tiny" style={{ background: owner.color }}>{owner.initials}</div>{owner.name}</div><b>{chore.effortPoints} pts</b></div>; })}</section>
  </>;
}

function Operations({ snapshot, health, request }: { snapshot: Snapshot; health: Health | null; request: (path: string, options?: RequestInit, message?: string) => Promise<void> }) {
  const queue = (kind: string, payload = {}) => request("/api/jobs", { method: "POST", body: JSON.stringify({ kind, payload }) }, `${kind.replaceAll("_", " ").toLowerCase()} queued`);
  return <>
    <section className="operation-actions"><div><span className="eyebrow">Control plane</span><h2>Workers and projections</h2></div><div><button className="button secondary" onClick={() => queue("MATERIALIZE_OCCURRENCES", { horizonDays: 14 })}><CalendarDays size={15} />Materialize</button><button className="button secondary" onClick={() => queue("OVERDUE_SCAN")}><TimerReset size={15} />Overdue scan</button><button className="button secondary" onClick={() => queue("REMINDER_DISPATCH")}><Bell size={15} />Dispatch reminders</button><button className="button secondary" onClick={() => request("/api/jobs/fail-next", { method: "POST" }, "Next worker failure armed")}><AlertTriangle size={15} />Fail next</button><button className="button secondary" onClick={() => request("/api/kafka/drain", { method: "POST" }, "Offline events replayed")}><WifiOff size={15} />Replay offline</button><button className="button" onClick={() => request("/api/jobs/drain", { method: "POST" }, "Job queue drained")}><Zap size={15} />Drain jobs</button></div></section>
    <section className="infra-grid">{[{ label: "Kafka ingress", value: health?.kafka || "memory", meta: `${health?.bufferedMessages || 0} offline events`, icon: Activity }, { label: "PostgreSQL", value: health?.postgres || "memory", meta: "completion ledger", icon: Database }, { label: "Redis", value: health?.redis || "memory", meta: "task projections", icon: Zap }].map(({ label, value, meta, icon: Icon }) => <div className="infra-card" key={label}><Icon size={18} /><div><span>{label}</span><strong>{value}</strong><small>{meta}</small></div><i className="online" /></div>)}</section>
    <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">Background work</span><h2>Job history</h2></div><span className="queue-count">{snapshot.metrics.queuedJobs} queued</span></div><div className="job-head"><span>Job</span><span>Status</span><span>Attempts</span><span>Queued</span><span>Result</span></div>{snapshot.jobs.map((job) => <div className="job-row" key={job.id}><span>{job.kind.replaceAll("_", " ")}</span><span className={`status status-${job.status.toLowerCase()}`}>{job.status}</span><span>{job.attempts} / 3</span><span>{fmtTime(job.queuedAt)}</span><span>{job.lastError || (job.completedAt ? "Completed" : "Waiting")}</span></div>)}{snapshot.jobs.length === 0 && <div className="empty">No background jobs have been queued.</div>}</section>
    <section className="operations-lower"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Notifications</span><h2>Reminder queue</h2></div><Bell size={18} /></div>{snapshot.reminders.slice(0, 6).map((reminder) => <div className="reminder-row" key={reminder.id}><Bell size={14} /><span><strong>{reminder.kind.replaceAll("_", " ")}</strong><small>{reminder.memberId}</small></span><span className={`status status-${reminder.status.toLowerCase()}`}>{reminder.status}</span></div>)}</section><section className="panel audit-panel"><div className="panel-heading"><div><span className="eyebrow">Traceability</span><h2>Audit stream</h2></div><History size={18} /></div>{snapshot.audit.slice(0, 8).map((event) => <div className="audit-row" key={event.id}><span>{event.action.replaceAll("_", " ")}</span><span>{event.actor}</span><span>{fmtTime(event.at)}</span><code>{JSON.stringify(event.details)}</code></div>)}</section></section>
  </>;
}
