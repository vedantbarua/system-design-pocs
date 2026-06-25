import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  Clock3,
  Database,
  History,
  Menu,
  Moon,
  RefreshCw,
  RotateCcw,
  Server,
  Sparkles,
  Watch,
  X,
  Zap
} from "lucide-react";

type View = "overview" | "sessions" | "events" | "operations";
type Device = { id: string; name: string; kind: string; lastSyncAt: string };
type SleepEvent = { id: string; deviceId: string; type: string; occurredAt: string; quality: number; source: string };
type Session = { id: string; kind: string; startedAt: string; endedAt: string | null; durationMinutes: number; qualityScore: number; status: string };
type DailyRecovery = { date: string; totalSleepMinutes: number; nightSleepMinutes: number; napMinutes: number; sleepDebtMinutes: number; bedtimeVarianceMinutes: number; consistencyScore: number; recoveryScore: number };
type Recommendation = { id: string; priority: string; kind: string; message: string };
type Alert = { id: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = {
  devices: Device[];
  events: SleepEvent[];
  sessions: Session[];
  dailyRecovery: DailyRecovery[];
  recommendations: Recommendation[];
  alerts: Alert[];
  jobs: Job[];
  audit: Audit[];
  metrics: {
    recoveryScore: number;
    sleepDebtMinutes: number;
    averageSleepHours: number;
    shortNightStreak: number;
    completeSessions: number;
    openSessions: number;
    queuedAlerts: number;
    queuedJobs: number;
  };
};
type Health = { kafka: string; postgres: string; redis: string; bufferedMessages: number };

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const date = (value: string) => fmt.format(new Date(value));
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

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
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    setToast(response.ok ? "Updated" : result.error);
    await load();
  }

  useEffect(() => {
    load().catch(() => setToast("Start API on port 8193"));
  }, []);

  const latest = data?.dailyRecovery[0];
  const trend = useMemo(() => [...(data?.dailyRecovery || [])].reverse().slice(-7), [data]);

  if (!data) {
    return (
      <div className="loading">
        <RefreshCw />
        Loading sleep recovery
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header>
          <span>
            <Moon />
          </span>
          <div>
            <strong>Recovery</strong>
            <small>SLEEP TRACKER</small>
          </div>
          <button onClick={() => setMenu(false)}>
            <X />
          </button>
        </header>

        <section>
          <small>Tonight readiness</small>
          <strong>{data.metrics.recoveryScore}/100</strong>
          <p>{data.metrics.shortNightStreak} short-night streak</p>
        </section>

        <nav>
          {[
            ["overview", "Overview", Activity],
            ["sessions", "Sessions", Clock3],
            ["events", "Event stream", Watch],
            ["operations", "Operations", Server]
          ].map(([id, label, Icon]) => (
            <button className={view === id ? "active" : ""} onClick={() => setView(id as View)} key={String(id)}>
              <Icon />
              {String(label)}
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
            <small>Personal sleep</small>
            <h1>{view === "events" ? "Event Stream" : view[0].toUpperCase() + view.slice(1)}</h1>
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
                <Metric icon={Sparkles} label="Recovery" value={`${data.metrics.recoveryScore}`} />
                <Metric icon={Moon} label="Avg sleep" value={`${data.metrics.averageSleepHours}h`} />
                <Metric icon={Zap} label="Sleep debt" value={hours(data.metrics.sleepDebtMinutes)} />
                <Metric icon={CalendarClock} label="Open sessions" value={`${data.metrics.openSessions}`} />
              </div>

              <div className="grid">
                <Panel title="Seven-day recovery">
                  <div className="bars">
                    {trend.map((row) => (
                      <div className="bar" key={row.date}>
                        <span style={{ height: `${Math.max(8, row.recoveryScore)}%` }} />
                        <small>{row.date.slice(5)}</small>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Recommendations">
                  {data.recommendations.map((rec) => (
                    <div className="recommendation" key={rec.id}>
                      <Sparkles />
                      <div>
                        <strong>{rec.kind.replaceAll("_", " ")}</strong>
                        <small>{rec.message}</small>
                      </div>
                      <b className={rec.priority.toLowerCase()}>{rec.priority}</b>
                    </div>
                  ))}
                </Panel>
              </div>

              <Panel title="Latest recovery rollup">
                {latest ? (
                  <div className="rollup">
                    <span>
                      <strong>{latest.date}</strong>
                      <small>Score {latest.recoveryScore}</small>
                    </span>
                    <span>
                      <strong>{hours(latest.nightSleepMinutes)}</strong>
                      <small>Night sleep</small>
                    </span>
                    <span>
                      <strong>{hours(latest.napMinutes)}</strong>
                      <small>Naps</small>
                    </span>
                    <span>
                      <strong>{latest.consistencyScore}</strong>
                      <small>Consistency</small>
                    </span>
                  </div>
                ) : null}
              </Panel>
            </>
          ) : null}

          {view === "sessions" ? (
            <Panel title="Rebuilt sleep sessions">
              {data.sessions.map((session) => (
                <div className="session" key={session.id}>
                  <Moon />
                  <div>
                    <strong>{session.kind}</strong>
                    <small>
                      {date(session.startedAt)} {session.endedAt ? `to ${date(session.endedAt)}` : "in progress"}
                    </small>
                  </div>
                  <span>{session.status}</span>
                  <b>{session.endedAt ? hours(session.durationMinutes) : "--"}</b>
                  <i>{session.qualityScore}</i>
                </div>
              ))}
            </Panel>
          ) : null}

          {view === "events" ? (
            <Panel title="Wearable event stream">
              <div className="thead">
                <span>Device</span>
                <span>Event</span>
                <span>Quality</span>
                <span>Source</span>
                <span>Occurred</span>
              </div>
              {data.events.map((event) => (
                <div className="event" key={event.id}>
                  <strong>{data.devices.find((device) => device.id === event.deviceId)?.name}</strong>
                  <span>{event.type.replaceAll("_", " ")}</span>
                  <span>{event.quality}</span>
                  <span>{event.source}</span>
                  <span>{date(event.occurredAt)}</span>
                </div>
              ))}
            </Panel>
          ) : null}

          {view === "operations" ? (
            <>
              <div className="actions">
                {["RECOVERY_REBUILD", "ALERT_DISPATCH", "RETENTION", "RECOMMENDATION_REFRESH"].map((kind) => (
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

              <Panel title="Alert queue">
                {data.alerts.map((alert) => (
                  <div className="alert" key={alert.id}>
                    <AlertTriangle />
                    <strong>{alert.kind.replaceAll("_", " ")}</strong>
                    <span>{date(alert.createdAt)}</span>
                    <b className={alert.status.toLowerCase()}>{alert.status}</b>
                  </div>
                ))}
              </Panel>

              <Panel title="Job history">
                {data.jobs.map((job) => (
                  <div className="job" key={job.id}>
                    <strong>{job.kind.replaceAll("_", " ")}</strong>
                    <b className={job.status.toLowerCase()}>{job.status}</b>
                    <span>{job.attempts}/3</span>
                    <span>{job.lastError || date(job.queuedAt)}</span>
                  </div>
                ))}
              </Panel>

              <Panel title="Audit stream">
                {data.audit.slice(0, 8).map((entry) => (
                  <div className="audit" key={entry.id}>
                    <strong>{entry.action.replaceAll("_", " ")}</strong>
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
