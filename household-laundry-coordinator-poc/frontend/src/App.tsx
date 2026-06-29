import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  ClipboardList,
  Database,
  History,
  Menu,
  RefreshCw,
  RotateCcw,
  Server,
  Shirt,
  Timer,
  WashingMachine,
  Wind,
  X,
  Zap
} from "lucide-react";

type View = "overview" | "loads" | "events" | "operations";
type Machine = { id: string; name: string; kind: string; status: string; activeLoadId: string | null; lastSeenAt: string };
type Load = { id: string; householdMember: string; label: string; status: string; machineId: string | null; startedAt: string; updatedAt: string; dueAt: string; handoffTo: string | null };
type LaundryEvent = { id: string; loadId: string; machineId: string; type: string; actor: string; occurredAt: string; notes: string; source: string };
type Alert = { id: string; loadId: string; kind: string; status: string; createdAt: string };
type Reminder = { id: string; loadId: string; channel: string; status: string; scheduledFor: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = {
  machines: Machine[];
  loads: Load[];
  events: LaundryEvent[];
  alerts: Alert[];
  reminders: Reminder[];
  jobs: Job[];
  audit: Audit[];
  metrics: {
    availableMachines: number;
    runningMachines: number;
    activeLoads: number;
    staleLoads: number;
    completedLoads: number;
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
    load().catch(() => setToast("Start API on port 8197"));
  }, []);

  const loadLabel = (id: string) => data?.loads.find((load) => load.id === id)?.label || id;
  const machineName = (id: string) => data?.machines.find((machine) => machine.id === id)?.name || id;
  const activeLoads = useMemo(() => (data ? data.loads.filter((load) => load.status !== "COMPLETED") : []), [data]);

  if (!data) {
    return (
      <div className="loading">
        <RefreshCw />
        Loading laundry
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header>
          <span>
            <WashingMachine />
          </span>
          <div>
            <strong>LoadLoop</strong>
            <small>LAUNDRY</small>
          </div>
          <button onClick={() => setMenu(false)}>
            <X />
          </button>
        </header>

        <section>
          <small>Active loads</small>
          <strong>{data.metrics.activeLoads}</strong>
          <p>{data.metrics.staleLoads} stale loads</p>
        </section>

        <nav>
          {[
            ["overview", "Overview", Activity],
            ["loads", "Loads", Shirt],
            ["events", "Machine events", History],
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
            <small>Household laundry</small>
            <h1>{view === "events" ? "Machine Events" : view[0].toUpperCase() + view.slice(1)}</h1>
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
                <Metric icon={WashingMachine} label="Available" value={`${data.metrics.availableMachines}`} />
                <Metric icon={Zap} label="Running" value={`${data.metrics.runningMachines}`} />
                <Metric icon={Shirt} label="Active loads" value={`${data.metrics.activeLoads}`} />
                <Metric icon={AlertTriangle} label="Stale" value={`${data.metrics.staleLoads}`} />
              </div>

              <div className="grid">
                <Panel title="Machines">
                  {data.machines.map((machine) => (
                    <div className="room" key={machine.id}>
                      {machine.kind === "WASHER" ? <WashingMachine /> : <Wind />}
                      <div>
                        <strong>{machine.name}</strong>
                        <small>{machine.activeLoadId ? loadLabel(machine.activeLoadId) : "No active load"}</small>
                      </div>
                      <b className={machine.status.toLowerCase()}>{machine.status}</b>
                    </div>
                  ))}
                </Panel>

                <Panel title="Active loads">
                  {activeLoads.map((load) => (
                    <div className="recommendation" key={load.id}>
                      <Timer />
                      <div>
                        <strong>{load.label}</strong>
                        <small>
                          {load.householdMember} · due {date(load.dueAt)} {load.handoffTo ? `· handoff ${load.handoffTo}` : ""}
                        </small>
                      </div>
                      <b className={load.status.toLowerCase()}>{load.status}</b>
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
                      <small>{loadLabel(alert.loadId)} · {date(alert.createdAt)}</small>
                    </div>
                    <b className={alert.status.toLowerCase()}>{alert.status}</b>
                  </div>
                ))}
              </Panel>
            </>
          ) : null}

          {view === "loads" ? (
            <Panel title="Load board">
              {data.loads.map((load) => (
                <div className="room" key={load.id}>
                  <ClipboardList />
                  <div>
                    <strong>{load.label}</strong>
                    <small>
                      {load.householdMember} · {load.machineId ? machineName(load.machineId) : "No machine"} · due {date(load.dueAt)}
                    </small>
                  </div>
                  <span>{load.handoffTo || "No handoff"}</span>
                  <b className={load.status.toLowerCase()}>{load.status}</b>
                </div>
              ))}
            </Panel>
          ) : null}

          {view === "events" ? (
            <Panel title="Idempotent machine event stream">
              <div className="thead">
                <span>Load</span>
                <span>Machine</span>
                <span>Type</span>
                <span>Actor</span>
                <span>Occurred</span>
              </div>
              {data.events.map((event) => (
                <div className="event" key={event.id}>
                  <strong>{loadLabel(event.loadId)}</strong>
                  <span>{machineName(event.machineId)}</span>
                  <span>{label(event.type)}</span>
                  <span>{event.actor}</span>
                  <span>{date(event.occurredAt)}</span>
                </div>
              ))}
            </Panel>
          ) : null}

          {view === "operations" ? (
            <>
              <div className="actions">
                {["LOAD_SCAN", "REMINDER_DISPATCH", "ALERT_DISPATCH", "RETENTION"].map((kind) => (
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
                    <Timer />
                    <strong>{loadLabel(reminder.loadId)}</strong>
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
