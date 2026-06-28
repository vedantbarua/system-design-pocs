import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  ClipboardList,
  Database,
  History,
  Home,
  Menu,
  Recycle,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Trash2,
  Truck,
  X
} from "lucide-react";

type View = "overview" | "schedule" | "events" | "operations";
type Household = { address: string; zone: string };
type Schedule = { id: string; stream: string; binColor: string; routeId: string; scheduledFor: string; recurrence: string; status: string };
type RouteEvent = { id: string; routeId: string; scheduleId: string; type: string; occurredAt: string; effectiveFor: string; delayMinutes: number; notes: string; source: string };
type Alert = { id: string; scheduleId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; scheduleId: string; channel: string; status: string; scheduledFor: string };
type RouteStatus = { routeId: string; status: string; updatedAt: string; note: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = {
  household: Household;
  schedules: Schedule[];
  events: RouteEvent[];
  alerts: Alert[];
  reminders: Reminder[];
  routeStatuses: RouteStatus[];
  jobs: Job[];
  audit: Audit[];
  metrics: {
    scheduled: number;
    completed: number;
    delayed: number;
    missed: number;
    skipped: number;
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
    load().catch(() => setToast("Start API on port 8196"));
  }, []);

  const scheduleTitle = (id: string) => {
    const schedule = data?.schedules.find((item) => item.id === id);
    return schedule ? `${label(schedule.stream)} · ${date(schedule.scheduledFor)}` : id;
  };

  const upcoming = useMemo(() => (data ? data.schedules.filter((schedule) => ["SCHEDULED", "DELAYED"].includes(schedule.status)).slice(0, 5) : []), [data]);

  if (!data) {
    return (
      <div className="loading">
        <RefreshCw />
        Loading pickup schedule
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header>
          <span>
            <Recycle />
          </span>
          <div>
            <strong>BinDay</strong>
            <small>WASTE PICKUP</small>
          </div>
          <button onClick={() => setMenu(false)}>
            <X />
          </button>
        </header>

        <section>
          <small>{data.household.zone} zone</small>
          <strong>{data.metrics.scheduled}</strong>
          <p>upcoming pickups</p>
        </section>

        <nav>
          {[
            ["overview", "Overview", Activity],
            ["schedule", "Schedule", CalendarClock],
            ["events", "Route events", History],
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
            <small>{data.household.address}</small>
            <h1>{view === "events" ? "Route Events" : view[0].toUpperCase() + view.slice(1)}</h1>
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
                <Metric icon={CalendarClock} label="Scheduled" value={`${data.metrics.scheduled}`} />
                <Metric icon={Check} label="Completed" value={`${data.metrics.completed}`} />
                <Metric icon={Truck} label="Delayed" value={`${data.metrics.delayed}`} />
                <Metric icon={AlertTriangle} label="Missed" value={`${data.metrics.missed}`} />
              </div>

              <div className="grid">
                <Panel title="Upcoming pickups">
                  {upcoming.map((schedule) => (
                    <div className="room" key={schedule.id}>
                      {schedule.stream === "RECYCLING" ? <Recycle /> : <Trash2 />}
                      <div>
                        <strong>{label(schedule.stream)}</strong>
                        <small>
                          {schedule.binColor} · {date(schedule.scheduledFor)} · {schedule.routeId}
                        </small>
                      </div>
                      <b className={schedule.status.toLowerCase()}>{schedule.status}</b>
                    </div>
                  ))}
                </Panel>

                <Panel title="Route status">
                  {data.routeStatuses.map((route) => (
                    <div className="recommendation" key={route.routeId}>
                      <Truck />
                      <div>
                        <strong>{route.routeId}</strong>
                        <small>{route.note}</small>
                      </div>
                      <b className={route.status.toLowerCase()}>{route.status}</b>
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
                      <small>{scheduleTitle(alert.scheduleId)} · {date(alert.createdAt)}</small>
                    </div>
                    <b className={alert.status.toLowerCase()}>{alert.status}</b>
                  </div>
                ))}
              </Panel>
            </>
          ) : null}

          {view === "schedule" ? (
            <Panel title="Pickup schedule">
              {data.schedules.map((schedule) => (
                <div className="room" key={schedule.id}>
                  <ClipboardList />
                  <div>
                    <strong>{label(schedule.stream)}</strong>
                    <small>
                      {schedule.binColor} · {schedule.recurrence} · {schedule.routeId}
                    </small>
                  </div>
                  <span>{date(schedule.scheduledFor)}</span>
                  <b className={schedule.status.toLowerCase()}>{schedule.status}</b>
                </div>
              ))}
            </Panel>
          ) : null}

          {view === "events" ? (
            <Panel title="Idempotent route event stream">
              <div className="thead">
                <span>Route</span>
                <span>Schedule</span>
                <span>Type</span>
                <span>Delay</span>
                <span>Occurred</span>
              </div>
              {data.events.map((event) => (
                <div className="event" key={event.id}>
                  <strong>{event.routeId}</strong>
                  <span>{scheduleTitle(event.scheduleId)}</span>
                  <span>{label(event.type)}</span>
                  <span>{event.delayMinutes}m</span>
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
                    <strong>{scheduleTitle(reminder.scheduleId)}</strong>
                    <span>{date(reminder.scheduledFor)}</span>
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
