import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Database,
  DoorOpen,
  Home,
  Lightbulb,
  Menu,
  Moon,
  Plug,
  Power,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Router,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Thermometer,
  ToggleLeft,
  ToggleRight,
  Waves,
  X,
  Zap,
  type LucideIcon
} from "lucide-react";

type Device = {
  id: string;
  label: string;
  room: string;
  type: "thermostat" | "valve" | "garage" | "light" | "outlet" | "notification";
  status: "ONLINE" | "OFFLINE";
  state: Record<string, string | number | boolean>;
  lastSeenAt: string;
};

type Rule = {
  id: string;
  name: string;
  description: string;
  status: "ENABLED" | "DISABLED";
  cooldownSeconds: number;
  lastTriggeredAt: string | null;
  fireCount: number;
  safetyLevel: "routine" | "guarded" | "critical";
  action: { deviceId: string; command: string; payload: Record<string, string | number | boolean> };
};

type HomeEvent = {
  id: string;
  eventId: string;
  type: string;
  deviceId: string | null;
  value: string | number | boolean;
  at: string;
  source: string;
};

type Command = {
  id: string;
  ruleId: string;
  sourceEventId: string;
  deviceId: string;
  command: string;
  payload: Record<string, string | number | boolean>;
  status: "QUEUED" | "SENT" | "RETRY" | "ACKED" | "DEAD" | "SUPPRESSED";
  attempts: number;
  maxAttempts: number;
  queuedAt: string;
  sentAt: string | null;
  ackedAt: string | null;
  lastError: string | null;
};

type Snapshot = {
  homeMode: "home" | "away" | "night";
  manualOverrideUntil: string | null;
  devices: Device[];
  rules: Rule[];
  events: HomeEvent[];
  commands: Command[];
  audit: Array<{ id: string; action: string; actor: string; details: Record<string, unknown>; at: string }>;
  metrics: {
    devices: number;
    onlineDevices: number;
    enabledRules: number;
    events: number;
    queuedCommands: number;
    ackedCommands: number;
    suppressedCommands: number;
    deadCommands: number;
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
  { id: "overview", label: "Overview", icon: Home },
  { id: "rules", label: "Rules", icon: SlidersHorizontal },
  { id: "events", label: "Event stream", icon: RadioTower },
  { id: "commands", label: "Commands", icon: Send },
  { id: "audit", label: "Audit", icon: Activity }
] as const;

type View = (typeof NAV)[number]["id"];

const api = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Request failed");
  return json as T;
};

const formatTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(value))
    : "never";

const titleCase = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());

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

function iconForDevice(type: Device["type"]): LucideIcon {
  if (type === "thermostat") return Thermometer;
  if (type === "valve") return Waves;
  if (type === "garage") return DoorOpen;
  if (type === "light") return Lightbulb;
  if (type === "outlet") return Plug;
  return Bell;
}

function DeviceRow({ device }: { device: Device }) {
  const Icon = iconForDevice(device.type);
  return (
    <div className="device-row">
      <div className={`device-icon device-${device.type}`}><Icon size={20} /></div>
      <div>
        <strong>{device.label}</strong>
        <span>{device.room} / {Object.entries(device.state).map(([key, value]) => `${key}: ${value}`).join(" / ")}</span>
      </div>
      <Status value={device.status} />
    </div>
  );
}

function RuleCard({ rule, device, onToggle }: { rule: Rule; device?: Device; onToggle: (rule: Rule) => void }) {
  return (
    <div className="rule-card">
      <div className="rule-copy">
        <div><Status value={rule.status} /><Status value={rule.safetyLevel} /></div>
        <h3>{rule.name}</h3>
        <p>{rule.description}</p>
      </div>
      <div className="rule-action">
        <span>{device?.label || rule.action.deviceId}</span>
        <strong>{rule.action.command.replaceAll("_", " ")}</strong>
        <small>{rule.fireCount} fires / cooldown {Math.round(rule.cooldownSeconds / 60)}m</small>
      </div>
      <button className="icon-button" title={rule.status === "ENABLED" ? "Disable rule" : "Enable rule"} onClick={() => onToggle(rule)}>
        {rule.status === "ENABLED" ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
      </button>
    </div>
  );
}

function EventPill({ event }: { event: HomeEvent }) {
  return (
    <div className="event-pill">
      <RadioTower size={15} />
      <span><strong>{event.type}</strong><small>{event.value.toString()} / {formatTime(event.at)}</small></span>
    </div>
  );
}

function CommandRow({ command, device, rule, onAck }: { command: Command; device?: Device; rule?: Rule; onAck: (command: Command) => void }) {
  return (
    <div className="command-row">
      <span><Power size={16} /><strong>{command.command.replaceAll("_", " ")}</strong></span>
      <span>{device?.label || command.deviceId}</span>
      <span>{rule?.name || command.ruleId}</span>
      <span>{command.attempts} / {command.maxAttempts}</span>
      <Status value={command.status} />
      {command.status === "SENT" ? <button className="small-button" onClick={() => onAck(command)}>Ack</button> : <ChevronRight size={16} />}
    </div>
  );
}

function Overview({ data, health, onToggle, onAck }: { data: Snapshot; health: Health | null; onToggle: (rule: Rule) => void; onAck: (command: Command) => void }) {
  const recentCommands = data.commands.slice(0, 5);
  return (
    <>
      <section className="metrics-grid">
        <Metric icon={Router} label="Devices online" value={`${data.metrics.onlineDevices}/${data.metrics.devices}`} detail={`${data.homeMode} mode`} tone="green" />
        <Metric icon={SlidersHorizontal} label="Rules enabled" value={data.metrics.enabledRules} detail={`${data.rules.length} total rules`} tone="blue" />
        <Metric icon={Send} label="Queued commands" value={data.metrics.queuedCommands} detail={`${data.metrics.ackedCommands} acknowledged`} tone="amber" />
        <Metric icon={RadioTower} label="Kafka mode" value={health?.kafka || "memory"} detail={`${health?.bufferedMessages || 0} buffered events`} tone="red" />
      </section>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Rule engine</p><h2>Active automations</h2></div><SlidersHorizontal size={18} /></div>
          <div className="rule-list compact">
            {data.rules.slice(0, 4).map((rule) => <RuleCard key={rule.id} rule={rule} device={data.devices.find((device) => device.id === rule.action.deviceId)} onToggle={onToggle} />)}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Command queue</p><h2>Recent dispatches</h2></div><Send size={18} /></div>
          {recentCommands.length ? recentCommands.map((command) => (
            <CommandRow key={command.id} command={command} device={data.devices.find((device) => device.id === command.deviceId)} rule={data.rules.find((rule) => rule.id === command.ruleId)} onAck={onAck} />
          )) : <div className="empty-state">No commands queued yet</div>}
        </section>
      </div>
      <section className="panel devices-panel">
        <div className="panel-heading"><div><p className="eyebrow">Device graph</p><h2>Connected devices</h2></div><Router size={18} /></div>
        <div className="devices-grid">{data.devices.map((device) => <DeviceRow key={device.id} device={device} />)}</div>
      </section>
    </>
  );
}

function EventsView({ health, onEvent, onDrain, onReplay }: { health: Health | null; onEvent: (kind: string) => void; onDrain: () => void; onReplay: () => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Kafka ingress</p><h2>Home event stream</h2></div>
        <div>
          <button className="button secondary" onClick={() => onEvent("energy")}><Zap size={16} /> Energy spike</button>
          <button className="button secondary" onClick={() => onEvent("leak")}><Waves size={16} /> Leak critical</button>
          <button className="button secondary" onClick={() => onEvent("presence")}><Moon size={16} /> Nobody home</button>
          <button className="button secondary" onClick={() => onEvent("garage")}><DoorOpen size={16} /> Garage late</button>
          <button className="button" onClick={onDrain}><RadioTower size={16} /> Drain Kafka</button>
          <button className="button" onClick={onReplay}><RefreshCw size={16} /> Replay</button>
        </div>
      </section>
      <section className="metrics-grid">
        <Metric icon={RadioTower} label="Kafka" value={health?.kafka || "memory"} detail={`${health?.bufferedMessages || 0} buffered messages`} tone="blue" />
        <Metric icon={Database} label="Postgres" value={health?.postgres || "memory"} detail="Snapshots and event log" tone="green" />
        <Metric icon={Activity} label="Redis" value={health?.redis || "memory"} detail="Command mirror" tone="amber" />
        <Metric icon={ShieldAlert} label="Event key" value="type:id" detail="Idempotent ingestion" tone="red" />
      </section>
      <section className="panel flow-panel">
        <div><RadioTower size={22} /><strong>Events</strong><span>presence, utility, doors</span></div>
        <i />
        <div><SlidersHorizontal size={22} /><strong>Rules</strong><span>conditions and cooldowns</span></div>
        <i />
        <div><Send size={22} /><strong>Commands</strong><span>dedupe and retries</span></div>
        <i />
        <div><Check size={22} /><strong>Acks</strong><span>device state updates</span></div>
      </section>
    </>
  );
}

function RulesView({ data, onToggle, onOverride, onMode }: { data: Snapshot; onToggle: (rule: Rule) => void; onOverride: (minutes: number) => void; onMode: (mode: Snapshot["homeMode"]) => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Safety controls</p><h2>Rule policy</h2></div>
        <div>
          <button className="button secondary" onClick={() => onMode(data.homeMode === "away" ? "home" : "away")}><Home size={16} /> Toggle mode</button>
          <button className="button secondary" onClick={() => onOverride(30)}><ShieldAlert size={16} /> Override 30m</button>
          <button className="button" onClick={() => onOverride(0)}><Check size={16} /> Clear override</button>
        </div>
      </section>
      <section className="rule-list">{data.rules.map((rule) => <RuleCard key={rule.id} rule={rule} device={data.devices.find((device) => device.id === rule.action.deviceId)} onToggle={onToggle} />)}</section>
    </>
  );
}

function CommandsView({ data, onFail, onDrain, onAck }: { data: Snapshot; onFail: () => void; onDrain: () => void; onAck: (command: Command) => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Device dispatch</p><h2>Command queue</h2></div>
        <div><button className="button secondary" onClick={onFail}><ShieldAlert size={16} /> Fail next</button><button className="button" onClick={onDrain}><Send size={16} /> Drain commands</button></div>
      </section>
      <section className="panel table-panel">
        <div className="command-head"><span>Command</span><span>Device</span><span>Rule</span><span>Attempts</span><span>Status</span><span /></div>
        {data.commands.map((command) => (
          <CommandRow key={command.id} command={command} device={data.devices.find((device) => device.id === command.deviceId)} rule={data.rules.find((rule) => rule.id === command.ruleId)} onAck={onAck} />
        ))}
      </section>
    </>
  );
}

function AuditView({ data }: { data: Snapshot }) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="eyebrow">Decision history</p><h2>Audit log</h2></div><Activity size={18} /></div>
      <div className="audit-head"><span>Action</span><span>Actor</span><span>Time</span><span>Details</span></div>
      {data.audit.map((event) => (
        <div className="audit-row" key={event.id}>
          <span>{event.action.replaceAll("_", " ")}</span>
          <span>{event.actor}</span>
          <span>{formatTime(event.at)}</span>
          <span>{Object.entries(event.details).map(([key, value]) => `${key}: ${value}`).join(" / ")}</span>
        </div>
      ))}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const recentEvents = useMemo(() => data?.events.slice(0, 4) || [], [data]);

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
      window.setTimeout(() => setToast(""), 3000);
    }
  };

  if (!data) return <div className="loading"><RefreshCw className="spin" size={20} /> Loading automation rules</div>;

  const publishEvent = (kind: string) => {
    const eventId = `${kind}-${crypto.randomUUID()}`;
    const body =
      kind === "energy" ? { eventId, type: "energy.spike", deviceId: "device-office-outlet", value: 4.2, at: "2026-06-16T23:15:00Z" } :
      kind === "leak" ? { eventId, type: "water.leak", deviceId: "device-water-valve", value: "critical", at: "2026-06-16T14:10:00Z" } :
      kind === "garage" ? { eventId, type: "garage.opened", deviceId: "device-garage-door", value: true, at: "2026-06-17T03:20:00Z" } :
      { eventId, type: "presence.empty", deviceId: "device-thermostat", value: true, at: "2026-06-16T14:20:00Z" };
    return run(() => api("/api/events/publish", { method: "POST", body: JSON.stringify(body) }), `${body.type} buffered`);
  };

  const toggleRule = (rule: Rule) => run(() => api(`/api/rules/${rule.id}/toggle`, { method: "POST", body: JSON.stringify({ enabled: rule.status !== "ENABLED" }) }), "Rule updated");
  const ackCommand = (command: Command) => run(() => api(`/api/commands/${command.id}/ack`, { method: "POST" }), "Command acknowledged");

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Home size={20} /></div><div><strong>RuleNest</strong><span>Smart home automation</span></div><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="home-card"><span>Mode</span><strong>{titleCase(data.homeMode)}</strong><small>{data.manualOverrideUntil ? `Override until ${formatTime(data.manualOverrideUntil)}` : "Safety override inactive"}</small></div>
        <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSidebarOpen(false); }}><Icon size={17} /> {label}{id === "commands" && data.metrics.queuedCommands > 0 && <span>{data.metrics.queuedCommands}</span>}</button>)}</nav>
        <div className="sidebar-bottom">
          {recentEvents.map((event) => <EventPill key={event.id} event={event} />)}
          <div className="infra"><Database size={17} /><span><strong>{health?.persistence || "memory"}</strong><small>Kafka {health?.kafka || "memory"}</small></span><i className={health?.status === "ok" ? "online" : ""} /></div>
          <button className="reset-button" onClick={() => run(() => api("/api/reset", { method: "POST" }), "Demo reset")}><RotateCcw size={15} /> Reset demo</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <main>
        <header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><p>Tuesday, June 16</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div><div className="top-status"><RadioTower size={15} /><span><strong>{health?.bufferedMessages || 0} buffered events</strong><small>{data.metrics.queuedCommands} commands waiting</small></span></div></header>
        <div className={`content ${busy ? "content-busy" : ""}`}>
          {view === "overview" && <Overview data={data} health={health} onToggle={toggleRule} onAck={ackCommand} />}
          {view === "rules" && <RulesView data={data} onToggle={toggleRule} onOverride={(minutes) => run(() => api("/api/manual-override", { method: "POST", body: JSON.stringify({ minutes }) }), minutes ? "Override enabled" : "Override cleared")} onMode={(mode) => run(() => api("/api/home-mode", { method: "POST", body: JSON.stringify({ mode }) }), "Mode changed")} />}
          {view === "events" && <EventsView health={health} onEvent={publishEvent} onDrain={() => run(() => api("/api/kafka/drain", { method: "POST" }), "Memory Kafka drained")} onReplay={() => run(() => api("/api/replay", { method: "POST", body: JSON.stringify({ from: "2026-06-16T00:00:00Z", to: "2026-06-17T23:59:00Z" }) }), "Events replayed")} />}
          {view === "commands" && <CommandsView data={data} onFail={() => run(() => api("/api/commands/fail-next", { method: "POST" }), "Next command will retry")} onDrain={() => run(() => api("/api/commands/drain?max=50", { method: "POST" }), "Commands drained")} onAck={ackCommand} />}
          {view === "audit" && <AuditView data={data} />}
        </div>
      </main>
      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
    </div>
  );
}
