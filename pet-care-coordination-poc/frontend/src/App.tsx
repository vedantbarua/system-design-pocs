import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  ClipboardCheck,
  Database,
  HeartPulse,
  History,
  Home,
  Menu,
  Pill,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Users,
  Utensils,
  X
} from "lucide-react";

type View = "overview" | "tasks" | "events" | "operations";
type Pet = { id: string; name: string; species: string; breed: string };
type Caregiver = { id: string; name: string; role: string };
type CareTask = { id: string; petId: string; kind: string; title: string; dueAt: string; windowMinutes: number; assignedTo: string; status: string };
type CareEvent = { id: string; taskId: string; petId: string; caregiverId: string; type: string; occurredAt: string; notes: string; source: string };
type Alert = { id: string; taskId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; taskId: string; caregiverId: string; channel: string; status: string; scheduledFor: string };
type Handoff = { petId: string; activeCaregiverId: string; nextCaregiverId: string; startsAt: string; notes: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = {
  pets: Pet[];
  caregivers: Caregiver[];
  tasks: CareTask[];
  events: CareEvent[];
  alerts: Alert[];
  reminders: Reminder[];
  handoffs: Handoff[];
  jobs: Job[];
  audit: Audit[];
  metrics: {
    pets: number;
    pendingTasks: number;
    completedTasks: number;
    missedTasks: number;
    medicationDue: number;
    queuedAlerts: number;
    queuedReminders: number;
    queuedJobs: number;
  };
};
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

  useEffect(() => {
    load().catch(() => setToast("Start API on port 8195"));
  }, []);

  const petName = (id: string) => data?.pets.find((pet) => pet.id === id)?.name || id;
  const caregiverName = (id: string) => data?.caregivers.find((caregiver) => caregiver.id === id)?.name || id;
  const taskTitle = (id: string) => data?.tasks.find((task) => task.id === id)?.title || id;
  const progress = useMemo(() => {
    if (!data) return 0;
    const total = data.metrics.pendingTasks + data.metrics.completedTasks + data.metrics.missedTasks;
    return total ? Math.round((data.metrics.completedTasks / total) * 100) : 0;
  }, [data]);

  if (!data) {
    return (
      <div className="loading">
        <RefreshCw />
        Loading pet care
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header>
          <span>
            <HeartPulse />
          </span>
          <div>
            <strong>CarePack</strong>
            <small>PET CARE</small>
          </div>
          <button onClick={() => setMenu(false)}>
            <X />
          </button>
        </header>

        <section>
          <small>Today complete</small>
          <strong>{progress}%</strong>
          <p>{data.metrics.missedTasks} missed tasks</p>
        </section>

        <nav>
          {[
            ["overview", "Overview", Activity],
            ["tasks", "Tasks", ClipboardCheck],
            ["events", "Care events", History],
            ["operations", "Operations", Server]
          ].map(([id, title, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id as View)} key={String(id)}>
              <Icon />
              {String(title)}
              {id === "operations" && data.metrics.queuedJobs > 0 ? <b>{data.metrics.queuedJobs}</b> : null}
            </button>
          ))}
        </nav>

        <footer>
          <Database />
          <span>
            <strong>{health?.postgres || "memory"}</strong>
            <small>
              Kafka {health?.kafka || "memory"} · Redis {health?.redis || "memory"}
            </small>
          </span>
        </footer>
      </aside>

      <main>
        <header className="top">
          <button onClick={() => setMenu(true)}>
            <Menu />
          </button>
          <div>
            <small>Household care</small>
            <h1>{view === "events" ? "Care Events" : view[0].toUpperCase() + view.slice(1)}</h1>
          </div>
          <span>
            <Bell />
            <small>{data.metrics.queuedAlerts} queued alerts</small>
          </span>
        </header>

        <div className="content">
          {view === "overview" ? (
            <>
              <div className="metrics">
                <Metric icon={HeartPulse} label="Pets" value={`${data.metrics.pets}`} />
                <Metric icon={ClipboardCheck} label="Pending" value={`${data.metrics.pendingTasks}`} />
                <Metric icon={Pill} label="Meds due" value={`${data.metrics.medicationDue}`} />
                <Metric icon={AlertTriangle} label="Reminders" value={`${data.metrics.queuedReminders}`} />
              </div>

              <div className="grid">
                <Panel title="Today care plan">
                  {data.tasks.slice(0, 6).map((task) => (
                    <div className="room" key={task.id}>
                      {task.kind === "FEEDING" ? <Utensils /> : task.kind === "MEDICATION" ? <Pill /> : <ClipboardCheck />}
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          {petName(task.petId)} · {caregiverName(task.assignedTo)} · {date(task.dueAt)}
                        </small>
                      </div>
                      <b className={task.status.toLowerCase()}>{task.status}</b>
                    </div>
                  ))}
                </Panel>

                <Panel title="Caregiver handoff">
                  {data.handoffs.map((handoff) => (
                    <div className="recommendation" key={`${handoff.petId}:${handoff.startsAt}`}>
                      <Users />
                      <div>
                        <strong>{petName(handoff.petId)}</strong>
                        <small>
                          {caregiverName(handoff.activeCaregiverId)} to {caregiverName(handoff.nextCaregiverId)} · {date(handoff.startsAt)}
                        </small>
                      </div>
                      <b className="medium">HANDOFF</b>
                    </div>
                  ))}
                </Panel>
              </div>

              <Panel title="Active alerts">
                {data.alerts.slice(0, 8).map((alert) => (
                  <div className="incident" key={alert.id}>
                    <AlertTriangle />
                    <div>
                      <strong>{label(alert.kind)}</strong>
                      <small>{taskTitle(alert.taskId)} · {date(alert.createdAt)}</small>
                    </div>
                    <b className={alert.status.toLowerCase()}>{alert.status}</b>
                  </div>
                ))}
              </Panel>
            </>
          ) : null}

          {view === "tasks" ? (
            <Panel title="Care schedule">
              {data.tasks.map((task) => (
                <div className="room" key={task.id}>
                  <CalendarClock />
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {petName(task.petId)} · {label(task.kind)} · window {task.windowMinutes}m
                    </small>
                  </div>
                  <span>{caregiverName(task.assignedTo)}</span>
                  <span>{date(task.dueAt)}</span>
                  <b className={task.status.toLowerCase()}>{task.status}</b>
                </div>
              ))}
            </Panel>
          ) : null}

          {view === "events" ? (
            <Panel title="Idempotent care event stream">
              <div className="thead">
                <span>Pet</span>
                <span>Task</span>
                <span>Caregiver</span>
                <span>Type</span>
                <span>Occurred</span>
              </div>
              {data.events.map((event) => (
                <div className="event" key={event.id}>
                  <strong>{petName(event.petId)}</strong>
                  <span>{taskTitle(event.taskId)}</span>
                  <span>{caregiverName(event.caregiverId)}</span>
                  <span>{label(event.type)}</span>
                  <span>{date(event.occurredAt)}</span>
                </div>
              ))}
            </Panel>
          ) : null}

          {view === "operations" ? (
            <>
              <div className="actions">
                {["SCHEDULE_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => (
                  <button onClick={() => act("/api/jobs", { kind })} key={kind}>
                    {kind.split("_")[0]}
                  </button>
                ))}
                <button onClick={() => act("/api/jobs/fail-next")}>Fail next</button>
                <button className="primary" onClick={() => act("/api/jobs/drain")}>
                  Drain jobs
                </button>
                <button onClick={() => act("/api/reset")}>
                  <RotateCcw />
                </button>
              </div>

              <Panel title="Reminder queue">
                {data.reminders.map((reminder) => (
                  <div className="alert" key={reminder.id}>
                    <ShieldCheck />
                    <strong>{taskTitle(reminder.taskId)}</strong>
                    <span>{caregiverName(reminder.caregiverId)}</span>
                    <b className={reminder.status.toLowerCase()}>{reminder.status}</b>
                  </div>
                ))}
              </Panel>

              <Panel title="Job history">
                {data.jobs.map((job) => (
                  <div className="job" key={job.id}>
                    <strong>{label(job.kind)}</strong>
                    <b className={job.status.toLowerCase()}>{job.status}</b>
                    <span>{job.attempts}/3</span>
                    <span>{job.lastError || date(job.queuedAt)}</span>
                  </div>
                ))}
              </Panel>

              <Panel title="Audit stream">
                {data.audit.slice(0, 8).map((entry) => (
                  <div className="audit" key={entry.id}>
                    <strong>{label(entry.action)}</strong>
                    <span>{date(entry.at)}</span>
                    <code>{JSON.stringify(entry.details)}</code>
                  </div>
                ))}
              </Panel>
            </>
          ) : null}
        </div>
      </main>

      {toast ? (
        <div className="toast">
          <Check />
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <article>
      <Icon />
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}
