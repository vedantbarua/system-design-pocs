import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  CloudSun,
  Database,
  Fan,
  Gauge,
  History,
  Home,
  Menu,
  RefreshCw,
  RotateCcw,
  Server,
  Thermometer,
  Waves,
  Wind,
  X
} from "lucide-react";

type View = "overview" | "rooms" | "readings" | "operations";
type Room = { id: string; name: string; floor: string };
type Sensor = { id: string; roomId: string; name: string; kind: string; lastSeenAt: string };
type Reading = { id: string; roomId: string; sensorId: string; type: string; pm25: number; co2Ppm: number; vocIndex: number; humidityPct: number; temperatureF: number; observedAt: string; source: string };
type Rollup = { roomId: string; samples: number; averagePm25: number; averageCo2Ppm: number; averageVocIndex: number; averageHumidityPct: number; averageTemperatureF: number; airQualityScore: number; staleSensors: number };
type Incident = { id: string; roomId: string; kind: string; status: string; startedAt: string; resolvedAt: string | null; samples: number; peakValue: number };
type Recommendation = { id: string; roomId: string; priority: string; message: string };
type Alert = { id: string; kind: string; status: string; createdAt: string };
type Job = { id: string; kind: string; status: string; attempts: number; queuedAt: string; lastError: string | null };
type Audit = { id: string; action: string; at: string; details: Record<string, unknown> };
type Snapshot = {
  rooms: Room[];
  sensors: Sensor[];
  readings: Reading[];
  rollups: Rollup[];
  incidents: Incident[];
  alerts: Alert[];
  recommendations: Recommendation[];
  jobs: Job[];
  audit: Audit[];
  metrics: {
    homeScore: number;
    worstRoomId: string | null;
    openIncidents: number;
    staleSensors: number;
    averagePm25: number;
    averageCo2Ppm: number;
    queuedAlerts: number;
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
    load().catch(() => setToast("Start API on port 8194"));
  }, []);

  const roomName = (id: string) => data?.rooms.find((room) => room.id === id)?.name || id;
  const trend = useMemo(() => [...(data?.rollups || [])].sort((a, b) => a.airQualityScore - b.airQualityScore), [data]);

  if (!data) {
    return (
      <div className="loading">
        <RefreshCw />
        Loading air quality
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header>
          <span>
            <Wind />
          </span>
          <div>
            <strong>AirWatch</strong>
            <small>HOME AIR QUALITY</small>
          </div>
          <button onClick={() => setMenu(false)}>
            <X />
          </button>
        </header>

        <section>
          <small>Home score</small>
          <strong>{data.metrics.homeScore}/100</strong>
          <p>{data.metrics.openIncidents} active incidents</p>
        </section>

        <nav>
          {[
            ["overview", "Overview", Activity],
            ["rooms", "Rooms", Home],
            ["readings", "Readings", Gauge],
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
            <small>Indoor environment</small>
            <h1>{view[0].toUpperCase() + view.slice(1)}</h1>
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
                <Metric icon={CloudSun} label="Home score" value={`${data.metrics.homeScore}`} />
                <Metric icon={Waves} label="PM2.5 avg" value={`${data.metrics.averagePm25}`} />
                <Metric icon={Wind} label="CO2 avg" value={`${data.metrics.averageCo2Ppm}`} />
                <Metric icon={AlertTriangle} label="Stale sensors" value={`${data.metrics.staleSensors}`} />
              </div>

              <div className="grid">
                <Panel title="Room scores">
                  <div className="bars">
                    {trend.map((rollup) => (
                      <div className="bar" key={rollup.roomId}>
                        <span style={{ height: `${Math.max(8, rollup.airQualityScore)}%` }} />
                        <small>{roomName(rollup.roomId).split(" ")[0]}</small>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Recommendations">
                  {data.recommendations.slice(0, 6).map((rec) => (
                    <div className="recommendation" key={rec.id}>
                      <Fan />
                      <div>
                        <strong>{roomName(rec.roomId)}</strong>
                        <small>{rec.message}</small>
                      </div>
                      <b className={rec.priority.toLowerCase()}>{rec.priority}</b>
                    </div>
                  ))}
                </Panel>
              </div>

              <Panel title="Active incidents">
                {data.incidents.slice(0, 6).map((incident) => (
                  <div className="incident" key={incident.id}>
                    <AlertTriangle />
                    <div>
                      <strong>{roomName(incident.roomId)}</strong>
                      <small>
                        {label(incident.kind)} · {incident.samples} samples · peak {incident.peakValue}
                      </small>
                    </div>
                    <b className={incident.status.toLowerCase()}>{incident.status}</b>
                  </div>
                ))}
              </Panel>
            </>
          ) : null}

          {view === "rooms" ? (
            <Panel title="Room rollups">
              {data.rollups.map((rollup) => (
                <div className="room" key={rollup.roomId}>
                  <Home />
                  <div>
                    <strong>{roomName(rollup.roomId)}</strong>
                    <small>
                      {rollup.samples} samples · {rollup.staleSensors} stale sensors
                    </small>
                  </div>
                  <span>PM2.5 {rollup.averagePm25}</span>
                  <span>CO2 {rollup.averageCo2Ppm}</span>
                  <span>Humidity {rollup.averageHumidityPct}%</span>
                  <b>{rollup.airQualityScore}</b>
                </div>
              ))}
            </Panel>
          ) : null}

          {view === "readings" ? (
            <Panel title="Event-time reading stream">
              <div className="thead">
                <span>Room</span>
                <span>PM2.5</span>
                <span>CO2</span>
                <span>Humidity</span>
                <span>Observed</span>
              </div>
              {data.readings.slice(0, 80).map((reading) => (
                <div className="event" key={reading.id}>
                  <strong>{roomName(reading.roomId)}</strong>
                  <span>{reading.pm25}</span>
                  <span>{reading.co2Ppm}</span>
                  <span>{reading.humidityPct}%</span>
                  <span>{date(reading.observedAt)}</span>
                </div>
              ))}
            </Panel>
          ) : null}

          {view === "operations" ? (
            <>
              <div className="actions">
                {["ROLLUP_REBUILD", "INCIDENT_REBUILD", "ALERT_DISPATCH", "RETENTION"].map((kind) => (
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
                    <strong>{label(alert.kind)}</strong>
                    <span>{date(alert.createdAt)}</span>
                    <b className={alert.status.toLowerCase()}>{alert.status}</b>
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
