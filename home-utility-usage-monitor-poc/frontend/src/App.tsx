import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Droplets,
  Gauge,
  History,
  Menu,
  PlugZap,
  RadioTower,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  ShieldCheck,
  TriangleAlert,
  Waves,
  X,
  Zap,
  type LucideIcon
} from "lucide-react";

type UtilityKind = "electricity" | "water";
type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
type JobStatus = "READY" | "PROCESSING" | "RETRY" | "COMPLETED" | "DEAD";

type Reading = {
  id: string;
  eventId: string;
  meterId: string;
  measuredAt: string;
  receivedAt: string;
  value: number;
  unit: string;
  source: string;
  corrected: boolean;
};

type Rollup = {
  bucket: string;
  granularity: "hour" | "day";
  usage: number;
  costCents: number;
  baselineUsage: number;
  points: number;
};

type Alert = {
  id: string;
  meterId: string;
  type: string;
  status: AlertStatus;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  detectedAt: string;
  evidence: Record<string, unknown>;
};

type Meter = {
  id: string;
  householdId: string;
  kind: UtilityKind;
  label: string;
  location: string;
  unit: string;
  tariffCentsPerUnit: number;
  expectedIntervalMinutes: number;
  status: "ONLINE" | "STALE";
  latestReading: Reading | null;
  hourly: Rollup[];
  daily: Rollup[];
  alerts: Alert[];
};

type Snapshot = {
  household: { id: string; name: string; timezone: string; monthlyBudgetCents: number };
  meters: Meter[];
  readings: Reading[];
  alerts: Alert[];
  jobs: Array<{ id: string; alertId: string; status: JobStatus; attempts: number; maxAttempts: number; lastError: string | null; createdAt: string }>;
  deliveries: Array<{ id: string; alertId: string; recipient: string; channel: string; deliveredAt: string }>;
  audit: Array<{ id: string; action: string; actor: string; details: Record<string, unknown>; at: string }>;
  metrics: {
    meters: number;
    readings: number;
    openAlerts: number;
    spikeAlerts: number;
    leakAlerts: number;
    missingMeters: number;
    pendingJobs: number;
    monthToDateCostCents: number;
    todayElectricityKwh: number;
    todayWaterGallons: number;
  };
};

type Health = {
  status: string;
  persistence: string;
  kafka: string;
  postgres: string;
  redis: string;
  bufferedMessages: number;
};

const NAV = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "meters", label: "Meters", icon: RadioTower },
  { id: "stream", label: "Kafka stream", icon: Server },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "audit", label: "Audit", icon: Activity }
] as const;

type View = (typeof NAV)[number]["id"];

const api = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body as T;
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago"
  }).format(new Date(value));

const titleCase = (value: string) =>
  value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function Status({ value }: { value: string }) {
  return <span className={`status status-${value.toLowerCase()}`}>{titleCase(value)}</span>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon"><Icon size={19} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function MiniBars({ rollups, unit }: { rollups: Rollup[]; unit: string }) {
  const max = Math.max(...rollups.map((item) => item.usage), 1);
  return (
    <div className="bars">
      {rollups.slice(-24).map((rollup) => {
        const elevated = rollup.baselineUsage > 0 && rollup.usage > rollup.baselineUsage * 2;
        return (
          <span key={rollup.bucket} title={`${formatTime(rollup.bucket)}: ${rollup.usage} ${unit}`}>
            <i className={elevated ? "elevated" : ""} style={{ height: `${Math.max(8, (rollup.usage / max) * 100)}%` }} />
          </span>
        );
      })}
    </div>
  );
}

function MeterCard({ meter, onSelect }: { meter: Meter; onSelect: (meterId: string) => void }) {
  const usage = meter.daily[0]?.usage || 0;
  const Icon = meter.kind === "electricity" ? Zap : Droplets;
  return (
    <button className="meter-card" onClick={() => onSelect(meter.id)}>
      <div className={`meter-icon meter-${meter.kind}`}><Icon size={22} /></div>
      <div className="meter-card-copy">
        <div><strong>{meter.label}</strong><Status value={meter.status} /></div>
        <span>{meter.location} / latest {meter.latestReading ? formatTime(meter.latestReading.measuredAt) : "none"}</span>
      </div>
      <div className="meter-usage">
        <strong>{usage.toFixed(meter.kind === "water" ? 0 : 1)} {meter.unit}</strong>
        <span>{money(meter.daily[0]?.costCents || 0)} today</span>
      </div>
      <ChevronRight size={17} />
    </button>
  );
}

function Overview({ data, onSelectMeter, onAck }: { data: Snapshot; onSelectMeter: (meterId: string) => void; onAck: (alert: Alert) => void }) {
  return (
    <>
      <section className="metrics-grid">
        <Metric icon={Zap} label="Electricity today" value={`${data.metrics.todayElectricityKwh.toFixed(1)} kWh`} detail="Hourly rollup projection" tone="blue" />
        <Metric icon={Droplets} label="Water today" value={`${data.metrics.todayWaterGallons.toFixed(0)} gal`} detail="Daily rollup projection" tone="green" />
        <Metric icon={TriangleAlert} label="Open alerts" value={data.metrics.openAlerts} detail={`${data.metrics.leakAlerts} leak / ${data.metrics.spikeAlerts} spike`} tone="red" />
        <Metric icon={ReceiptText} label="Month cost" value={money(data.metrics.monthToDateCostCents)} detail={`Budget ${money(data.household.monthlyBudgetCents)}`} tone="amber" />
      </section>
      <div className="overview-grid">
        <section className="panel usage-panel">
          <div className="panel-heading"><div><p className="eyebrow">Time-series rollups</p><h2>Last 24 hours</h2></div><BarChart3 size={18} /></div>
          <div className="meter-chart-grid">
            {data.meters.map((meter) => (
              <div className="chart-row" key={meter.id}>
                <div><strong>{meter.label}</strong><span>{meter.unit} vs baseline</span></div>
                <MiniBars rollups={meter.hourly} unit={meter.unit} />
              </div>
            ))}
          </div>
        </section>
        <section className="panel alert-panel">
          <div className="panel-heading"><div><p className="eyebrow">Anomaly queue</p><h2>Needs review</h2></div><Bell size={18} /></div>
          {data.alerts.filter((alert) => alert.status === "OPEN").slice(0, 5).map((alert) => (
            <div className={`alert-row alert-${alert.severity}`} key={alert.id}>
              <AlertTriangle size={18} />
              <span><strong>{alert.title}</strong><small>{alert.message}</small></span>
              <button className="icon-button" title="Acknowledge alert" onClick={() => onAck(alert)}><Check size={16} /></button>
            </div>
          ))}
        </section>
      </div>
      <section className="panel meters-panel">
        <div className="panel-heading"><div><p className="eyebrow">Meter inventory</p><h2>Smart meters</h2></div><RadioTower size={18} /></div>
        {data.meters.map((meter) => <MeterCard key={meter.id} meter={meter} onSelect={onSelectMeter} />)}
      </section>
    </>
  );
}

function StreamView({ health, onPublishLate, onCorrection, onDrainKafka, onAnomaly }: { health: Health | null; onPublishLate: () => void; onCorrection: () => void; onDrainKafka: () => void; onAnomaly: () => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Kafka ingestion</p><h2>Meter event stream</h2></div>
        <div>
          <button className="button secondary" onClick={onPublishLate}><Clock3 size={16} /> Publish late reading</button>
          <button className="button secondary" onClick={onCorrection}><RefreshCw size={16} /> Publish correction</button>
          <button className="button secondary" onClick={onDrainKafka}><Server size={16} /> Drain memory Kafka</button>
          <button className="button" onClick={onAnomaly}><TriangleAlert size={16} /> Run detection</button>
        </div>
      </section>
      <section className="metrics-grid">
        <Metric icon={Server} label="Kafka mode" value={health?.kafka || "memory"} detail={`${health?.bufferedMessages || 0} buffered messages`} tone="blue" />
        <Metric icon={Database} label="Timescale mode" value={health?.postgres || "memory"} detail="Readings table and snapshots" tone="green" />
        <Metric icon={Activity} label="Redis mode" value={health?.redis || "memory"} detail="Job mirror and hot snapshot" tone="amber" />
        <Metric icon={ShieldCheck} label="Ordering key" value="meterId" detail="Per-meter event ordering" tone="red" />
      </section>
      <section className="panel explainer-panel">
        <div className="stream-diagram">
          <div><RadioTower size={22} /><strong>Smart meters</strong><span>electricity and water</span></div>
          <i />
          <div><Server size={22} /><strong>Kafka topic</strong><span>keyed by meter ID</span></div>
          <i />
          <div><Database size={22} /><strong>Rollup projector</strong><span>hourly and daily usage</span></div>
          <i />
          <div><Bell size={22} /><strong>Alert worker</strong><span>retryable notifications</span></div>
        </div>
      </section>
    </>
  );
}

function AlertsView({ data, onAck, onFail, onDrain }: { data: Snapshot; onAck: (alert: Alert) => void; onFail: () => void; onDrain: () => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Retryable delivery</p><h2>Alerts and notifications</h2></div>
        <div><button className="button secondary" onClick={onFail}><PlugZap size={16} /> Fail next</button><button className="button" onClick={onDrain}><Send size={16} /> Drain workers</button></div>
      </section>
      <section className="panel page-panel">
        <div className="alert-head"><span>Alert</span><span>Meter</span><span>Detected</span><span>Status</span><span /></div>
        {data.alerts.map((alert) => {
          const meter = data.meters.find((item) => item.id === alert.meterId);
          return (
            <div className="alert-table-row" key={alert.id}>
              <span className="alert-title"><AlertTriangle size={17} /><span><strong>{alert.title}</strong><small>{alert.message}</small></span></span>
              <span>{meter?.label || alert.meterId}</span>
              <span>{formatTime(alert.detectedAt)}</span>
              <Status value={alert.status} />
              {alert.status === "OPEN" ? <button className="small-button" onClick={() => onAck(alert)}>Acknowledge</button> : <CheckCircle2 size={18} />}
            </div>
          );
        })}
      </section>
      <section className="panel jobs-panel">
        <div className="job-head"><span>Job</span><span>Alert</span><span>Attempts</span><span>Created</span><span>Status</span></div>
        {data.jobs.map((job) => {
          const alert = data.alerts.find((item) => item.id === job.alertId);
          return (
            <div className="job-row" key={job.id}>
              <span>{job.id}</span><span>{alert?.title || job.alertId}</span><span>{job.attempts} / {job.maxAttempts}</span><span>{formatTime(job.createdAt)}</span><Status value={job.status} />
            </div>
          );
        })}
      </section>
    </>
  );
}

function AuditView({ data }: { data: Snapshot }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading"><div><p className="eyebrow">Projection history</p><h2>Audit events</h2></div><History size={18} /></div>
      <div className="audit-head"><span>Action</span><span>Actor</span><span>Time</span><span>Details</span></div>
      {data.audit.map((event) => (
        <div className="audit-row" key={event.id}>
          <span><Activity size={15} /> {event.action.replaceAll("_", " ")}</span>
          <span>{event.actor}</span>
          <span>{formatTime(event.at)}</span>
          <span>{Object.entries(event.details).map(([key, value]) => `${key}: ${value}`).join(" / ")}</span>
        </div>
      ))}
    </section>
  );
}

function MeterDrawer({ meter, onClose, onReprocess }: { meter: Meter; onClose: () => void; onReprocess: (meter: Meter) => void }) {
  return (
    <aside className="drawer">
      <div className="drawer-heading"><div><p>{meter.kind} / {meter.location}</p><h2>{meter.label}</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
      <div className="drawer-summary">
        <div className={`meter-icon meter-${meter.kind}`}>{meter.kind === "electricity" ? <Zap size={23} /> : <Droplets size={23} />}</div>
        <span><strong>{meter.daily[0]?.usage.toFixed(meter.kind === "water" ? 0 : 1)} {meter.unit}</strong><small>{money(meter.daily[0]?.costCents || 0)} today</small></span>
        <Status value={meter.status} />
      </div>
      <div className="drawer-actions"><button className="button" onClick={() => onReprocess(meter)}><RefreshCw size={16} /> Reprocess day</button></div>
      <section className="drawer-section">
        <div className="section-title"><h3>Hourly profile</h3><BarChart3 size={16} /></div>
        <MiniBars rollups={meter.hourly} unit={meter.unit} />
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Latest reading</h3><RadioTower size={16} /></div>
        {meter.latestReading ? <dl className="metadata"><div><dt>Measured</dt><dd>{formatTime(meter.latestReading.measuredAt)}</dd></div><div><dt>Value</dt><dd>{meter.latestReading.value} {meter.unit}</dd></div><div><dt>Source</dt><dd>{meter.latestReading.source}</dd></div><div><dt>Tariff</dt><dd>{meter.tariffCentsPerUnit}c / {meter.unit}</dd></div></dl> : <p>No reading</p>}
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Meter alerts</h3><Bell size={16} /></div>
        {meter.alerts.map((alert) => <div className="mini-alert" key={alert.id}><AlertTriangle size={16} /><span><strong>{alert.title}</strong><small>{alert.status} / {formatTime(alert.detectedAt)}</small></span></div>)}
      </section>
    </aside>
  );
}

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [view, setView] = useState<View>("overview");
  const [selectedMeter, setSelectedMeter] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const selected = useMemo(() => data?.meters.find((meter) => meter.id === selectedMeter) || null, [data, selectedMeter]);

  const refresh = async () => {
    const [snapshot, healthStatus] = await Promise.all([api<Snapshot>("/api/snapshot"), api<Health>("/api/health")]);
    setData(snapshot);
    setHealth(healthStatus);
  };

  useEffect(() => {
    refresh().catch((error) => setToast(error.message));
  }, []);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      setToast(message);
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(""), 3200);
    }
  };

  if (!data) return <div className="loading"><RefreshCw className="spin" size={20} /> Loading utility monitor</div>;

  const publishLate = () => run(() => api("/api/readings/publish", { method: "POST", body: JSON.stringify({ eventId: `late-${crypto.randomUUID()}`, meterId: "meter-electric-main", measuredAt: "2026-06-15T03:35:00Z", value: 0.6 }) }), "Late Kafka reading buffered");
  const publishCorrection = () => run(() => api("/api/readings/publish", { method: "POST", body: JSON.stringify({ eventId: `fix-${crypto.randomUUID()}`, meterId: "meter-water-main", measuredAt: "2026-06-15T02:00:00Z", value: 2.4, correctionOf: "seed-water-2" }) }), "Correction event buffered");
  const drainKafka = () => run(() => api("/api/kafka/drain", { method: "POST" }), "Memory Kafka drained");
  const runAnomaly = () => run(() => api("/api/anomalies/run", { method: "POST", body: JSON.stringify({ asOf: "2026-06-16T04:30:00.000Z" }) }), "Anomaly detection completed");
  const acknowledge = (alert: Alert) => run(() => api(`/api/alerts/${alert.id}/acknowledge`, { method: "POST", body: JSON.stringify({ actor: "user-vedant" }) }), "Alert acknowledged");

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Waves size={21} /></div><div><strong>Gridwise</strong><span>Home utility monitor</span></div><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="home-info"><span>Household</span><div><Gauge size={16} /><strong>{data.household.name}</strong></div><small>{data.household.timezone} / {money(data.household.monthlyBudgetCents)} budget</small></div>
        <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSidebarOpen(false); }}><Icon size={17} /> {label}{id === "alerts" && data.metrics.openAlerts > 0 && <span>{data.metrics.openAlerts}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="infra"><Database size={17} /><span><strong>{health?.persistence || "memory"}</strong><small>Kafka {health?.kafka || "memory"}</small></span><i className={health?.status === "ok" ? "online" : ""} /></div><button className="reset-button" onClick={() => run(() => api("/api/reset", { method: "POST" }), "Demo state restored")}><RotateCcw size={15} /> Reset demo</button></div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <main>
        <header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><p>Monday, June 15</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div><div className="top-status"><RadioTower size={15} /><span><strong>{health?.bufferedMessages || 0} buffered Kafka events</strong><small>{data.metrics.pendingJobs} notification jobs pending</small></span></div></header>
        <div className={`content ${busy ? "content-busy" : ""}`}>
          {view === "overview" && <Overview data={data} onSelectMeter={setSelectedMeter} onAck={acknowledge} />}
          {view === "meters" && <section className="panel page-panel">{data.meters.map((meter) => <MeterCard key={meter.id} meter={meter} onSelect={setSelectedMeter} />)}</section>}
          {view === "stream" && <StreamView health={health} onPublishLate={publishLate} onCorrection={publishCorrection} onDrainKafka={drainKafka} onAnomaly={runAnomaly} />}
          {view === "alerts" && <AlertsView data={data} onAck={acknowledge} onFail={() => run(() => api("/api/workers/fail-next", { method: "POST" }), "Next alert delivery will retry")} onDrain={() => run(() => api("/api/workers/drain?maxJobs=50", { method: "POST" }), "Alert workers drained")} />}
          {view === "audit" && <AuditView data={data} />}
        </div>
      </main>
      {selected && <><button className="drawer-scrim" onClick={() => setSelectedMeter(null)} /><MeterDrawer meter={selected} onClose={() => setSelectedMeter(null)} onReprocess={(meter) => run(() => api("/api/reprocess", { method: "POST", body: JSON.stringify({ meterId: meter.id, from: "2026-06-15T00:00:00Z", to: "2026-06-15T23:59:00Z" }) }), "Meter projections reprocessed")} /></>}
      {toast && <div className="toast"><CheckCircle2 size={17} /> {toast}</div>}
    </div>
  );
}
