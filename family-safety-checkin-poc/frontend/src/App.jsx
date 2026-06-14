import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  History,
  House,
  LocateFixed,
  MapPin,
  Menu,
  MessageCircleMore,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  Send,
  ShieldCheck,
  ShieldQuestion,
  MapPinOff,
  TimerReset,
  UserRoundCheck,
  Users,
  Wifi,
  WifiOff,
  X
} from "lucide-react";

const ACTOR = "user-vedant";
const DEMO_NOW = "2026-06-14T23:45:00Z";
const NAV = [
  { id: "overview", label: "Overview", icon: House },
  { id: "checkins", label: "Check-ins", icon: CalendarClock },
  { id: "locations", label: "Live locations", icon: LocateFixed },
  { id: "operations", label: "Delivery operations", icon: Send },
  { id: "activity", label: "Activity", icon: Activity }
];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || "Request failed");
  return body;
}

const formatTime = (value) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago"
  }).format(new Date(value));

const formatDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Chicago"
      }).format(new Date(value))
    : "Pending";

const titleCase = (value) =>
  value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const centralToUtc = (value) => new Date(`${value}:00-05:00`).toISOString();

function Status({ value }) {
  return <span className={`status status-${value.toLowerCase()}`}>{titleCase(value)}</span>;
}

function Avatar({ member, size = "normal" }) {
  return <span className={`avatar avatar-${size}`} style={{ "--avatar": member.color }}>{member.initials}</span>;
}

function Metric({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon"><Icon size={19} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function CheckinRow({ checkin, selected, onSelect, onAcknowledge }) {
  const actionable = ["OPEN", "LATE", "ESCALATED"].includes(checkin.state);
  return (
    <div className={`checkin-row ${selected ? "selected" : ""}`}>
      <button className="checkin-main-button" onClick={() => onSelect(checkin.id)}>
        <Avatar member={checkin.member} />
        <div className="checkin-copy">
          <div><strong>{checkin.title}</strong><Status value={checkin.state} /></div>
          <span>{checkin.member.name} / {checkin.destination || "No destination"}</span>
        </div>
        <div className="checkin-window">
          <strong>{formatTime(checkin.due_at)}</strong>
          <span>{checkin.state === "ACKNOWLEDGED" ? `Confirmed ${formatTime(checkin.acknowledged_at)}` : `${checkin.grace_minutes} min grace`}</span>
        </div>
        <div className="checkin-location">
          <strong>{checkin.location?.label || "Not sharing"}</strong>
          <span>{checkin.location ? `${checkin.location.accuracy_meters} m accuracy` : "Location private"}</span>
        </div>
        <ChevronRight size={17} />
      </button>
      {actionable && <button className="safe-button" onClick={() => onAcknowledge(checkin)}><Check size={16} /> I'm safe</button>}
    </div>
  );
}

function MemberStatus({ member, onSelect }) {
  const memberState = member.status === "SAFE" ? "SAFE" : member.status;
  return (
    <button className="member-status" onClick={() => member.active_checkin_id && onSelect(member.active_checkin_id)}>
      <Avatar member={member} />
      <span><strong>{member.name}</strong><small>{member.location?.label || (member.status === "SAFE" ? "No active check-in" : "Location not shared")}</small></span>
      <Status value={memberState} />
    </button>
  );
}

function MiniMap({ data, onSelect }) {
  const positions = { "user-maya": [54, 45], "user-vedant": [71, 69], "user-parent": [31, 34] };
  return (
    <div className="map-shell">
      <img src="/assets/neighborhood-map.png" alt="Illustrated neighborhood map for live safety locations" />
      <div className="map-shade" />
      {data.members.map((member) => {
        const [left, top] = positions[member.user_id] || [50, 50];
        return (
          <button
            key={member.user_id}
            className={`map-marker marker-${member.status.toLowerCase()} ${member.location ? "live" : ""}`}
            style={{ left: `${left}%`, top: `${top}%`, "--avatar": member.color }}
            title={`${member.name}: ${titleCase(member.status)}`}
            onClick={() => member.active_checkin_id && onSelect(member.active_checkin_id)}
          >
            <Avatar member={member} size="small" />
            <span><strong>{member.name}</strong><small>{member.location?.label || titleCase(member.status)}</small></span>
          </button>
        );
      })}
      <div className="map-live"><Radio size={13} /> {data.metrics.active_locations} active share</div>
    </div>
  );
}

function OverviewView({ data, onSelect, onAcknowledge, onCreate }) {
  const attention = data.checkins.filter((item) => ["OPEN", "LATE", "ESCALATED"].includes(item.state));
  return (
    <>
      <section className="metrics-grid">
        <Metric icon={Users} label="Circle members" value={data.metrics.members} detail="Owner, member, trusted contact" tone="blue" />
        <Metric icon={CalendarClock} label="Open check-ins" value={data.metrics.open} detail={`${data.metrics.scheduled} upcoming`} tone="green" />
        <Metric icon={AlertCircle} label="Needs attention" value={data.metrics.late + data.metrics.escalated} detail={`${data.metrics.escalated} escalated`} tone="red" />
        <Metric icon={LocateFixed} label="Live locations" value={data.metrics.active_locations} detail="Temporary TTL sharing" tone="amber" />
      </section>

      <div className="overview-grid">
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Current safety windows</p><h2>Check-ins needing attention</h2></div>
            <button className="icon-button" title="Create check-in" onClick={onCreate}><Plus size={18} /></button>
          </div>
          <div className="compact-checkins">
            {attention.map((checkin) => (
              <div className={`compact-checkin compact-${checkin.state.toLowerCase()}`} key={checkin.id}>
                <button onClick={() => onSelect(checkin.id)}>
                  <Avatar member={checkin.member} />
                  <span><strong>{checkin.title}</strong><small>{checkin.member.name} / due {formatTime(checkin.due_at)}</small></span>
                  <Status value={checkin.state} />
                </button>
                <button className="icon-button" title="Confirm safe" onClick={() => onAcknowledge(checkin)}><Check size={17} /></button>
              </div>
            ))}
          </div>
        </section>
        <section className="panel circle-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Maple Street Circle</p><h2>Member status</h2></div>
            <UserRoundCheck size={19} />
          </div>
          <div className="member-list">{data.members.map((member) => <MemberStatus key={member.user_id} member={member} onSelect={onSelect} />)}</div>
        </section>
      </div>

      <section className="panel map-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Temporary sharing</p><h2>Live safety map</h2></div>
          <span className="connection-label"><Radio size={14} /> Realtime</span>
        </div>
        <MiniMap data={data} onSelect={onSelect} />
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Recent confirmations</p><h2>Resolved check-ins</h2></div>
          <History size={18} />
        </div>
        {data.checkins.filter((item) => item.state === "ACKNOWLEDGED").map((checkin) => (
          <button className="resolved-row" key={checkin.id} onClick={() => onSelect(checkin.id)}>
            <CheckCircle2 size={18} />
            <span><strong>{checkin.member.name} confirmed safe</strong><small>{checkin.title} / {checkin.acknowledged_message}</small></span>
            <time>{formatDateTime(checkin.acknowledged_at)}</time>
            <ChevronRight size={16} />
          </button>
        ))}
      </section>
    </>
  );
}

function CheckinsView({ data, selectedId, onSelect, onAcknowledge, onCreate }) {
  const [filter, setFilter] = useState("ACTIVE");
  const filtered = data.checkins.filter((item) => {
    if (filter === "ALL") return true;
    if (filter === "ATTENTION") return ["LATE", "ESCALATED"].includes(item.state);
    if (filter === "RESOLVED") return ["ACKNOWLEDGED", "CANCELED"].includes(item.state);
    return ACTIVE_STATES.includes(item.state);
  });
  return (
    <section className="panel page-panel">
      <div className="panel-heading checkins-heading">
        <div><p className="eyebrow">Safety windows</p><h2>Household check-ins</h2></div>
        <div className="heading-actions">
          <div className="segmented">
            {["ACTIVE", "ALL", "ATTENTION", "RESOLVED"].map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{titleCase(value)}</button>)}
          </div>
          <button className="button" onClick={onCreate}><Plus size={16} /> New check-in</button>
        </div>
      </div>
      <div className="checkin-columns"><span>Check-in</span><span>Due</span><span>Location</span><span /><span /></div>
      <div>{filtered.map((checkin) => <CheckinRow key={checkin.id} checkin={checkin} selected={selectedId === checkin.id} onSelect={onSelect} onAcknowledge={onAcknowledge} />)}</div>
    </section>
  );
}

const ACTIVE_STATES = ["SCHEDULED", "OPEN", "LATE", "ESCALATED"];

function LocationsView({ data, onSelect, onUpdateLocation }) {
  return (
    <div className="locations-layout">
      <section className="panel large-map-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">TTL-bound location sharing</p><h2>Household map</h2></div>
          <span className="connection-label"><Radio size={14} /> {data.metrics.active_locations} live</span>
        </div>
        <MiniMap data={data} onSelect={onSelect} />
      </section>
      <section className="panel location-roster">
        <div className="panel-heading"><div><p className="eyebrow">Location roster</p><h2>Sharing status</h2></div></div>
        {data.members.map((member) => (
          <div className="location-member" key={member.user_id}>
            <Avatar member={member} />
            <span><strong>{member.name}</strong><small>{member.location ? `Updated ${formatTime(member.location.captured_at)}` : "Not sharing"}</small></span>
            {member.location ? <><Status value="LIVE" />{member.user_id === "user-maya" && <button className="icon-button" title="Simulate newer location" onClick={() => onUpdateLocation(member)}><Navigation size={16} /></button>}</> : <Status value="PRIVATE" />}
          </div>
        ))}
        <div className="privacy-note"><ShieldCheck size={17} /><span>Locations are visible only while a check-in is active and are removed when their TTL expires or the member confirms safe.</span></div>
      </section>
    </div>
  );
}

function OperationsView({ data, onRunDue, onRunGrace, onFail, onDrain }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Scheduler and delivery workers</p><h2>Escalation operations</h2></div>
        <div>
          <button className="button secondary" onClick={onFail}><WifiOff size={16} /> Fail next</button>
          <button className="button secondary" onClick={onRunDue}><Clock3 size={16} /> Run due scan</button>
          <button className="button secondary" onClick={onRunGrace}><TimerReset size={16} /> Run grace scan</button>
          <button className="button" onClick={onDrain}><RefreshCw size={16} /> Drain workers</button>
        </div>
      </section>
      <section className="metrics-grid operations-metrics">
        <Metric icon={Bell} label="Pending jobs" value={data.metrics.pending_jobs} detail="Ready or retrying" tone="amber" />
        <Metric icon={Send} label="Deliveries" value={data.metrics.deliveries} detail="Recipient and channel dedupe" tone="green" />
        <Metric icon={RefreshCw} label="Retry attempts" value={data.jobs.filter((item) => item.attempts > 1 || item.status === "RETRY").length} detail="Provider recovery" tone="red" />
        <Metric icon={Radio} label="Realtime clients" value="Live" detail="WebSocket broadcast" tone="blue" />
      </section>
      <section className="panel page-panel jobs-panel">
        <div className="job-head"><span>Job</span><span>Check-in</span><span>Attempts</span><span>Created</span><span>Status</span></div>
        {data.jobs.slice().reverse().map((job) => {
          const checkin = data.checkins.find((item) => item.id === job.payload.checkin_id);
          return (
            <div className="job-row" key={job.id}>
              <span className="job-kind"><Bell size={16} /><span><strong>{titleCase(job.kind)}</strong><small>{job.id}</small></span></span>
              <span><strong>{checkin?.title || job.payload.checkin_id}</strong><small>{checkin?.member.name || job.payload.member_id}</small></span>
              <span>{job.attempts} / {job.max_attempts}</span>
              <span>{formatDateTime(job.created_at)}</span>
              <Status value={job.status} />
            </div>
          );
        })}
      </section>
    </>
  );
}

function ActivityView({ data, onSelect }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Append-only incident history</p><h2>Safety activity</h2></div>
        <span className="panel-count">{data.events.length} events</span>
      </div>
      <div className="event-head"><span>Event</span><span>Check-in</span><span>Actor</span><span>Time</span><span>Details</span></div>
      {data.events.map((event) => {
        const checkin = data.checkins.find((item) => item.id === event.checkin_id);
        return (
          <button className="event-row" key={event.id} onClick={() => checkin && onSelect(checkin.id)}>
            <span className="event-kind"><Activity size={15} /><strong>{titleCase(event.kind)}</strong></span>
            <span>{checkin?.title || "Safety circle"}</span>
            <span>{event.actor_id}</span>
            <span>{formatDateTime(event.at)}</span>
            <span>{Object.entries(event.details).map(([key, value]) => `${key}: ${value}`).join(" / ") || "No details"}</span>
          </button>
        );
      })}
    </section>
  );
}

function CheckinDrawer({ checkin, onClose, onAcknowledge, onCancel }) {
  return (
    <aside className="drawer">
      <div className="drawer-heading">
        <div><p>{checkin.member.name} / due {formatTime(checkin.due_at)}</p><h2>{checkin.title}</h2></div>
        <button className="icon-button" title="Close check-in details" onClick={onClose}><X size={19} /></button>
      </div>
      <div className={`drawer-summary summary-${checkin.state.toLowerCase()}`}>
        <Avatar member={checkin.member} size="large" />
        <div><Status value={checkin.state} /><strong>{checkin.destination || "No destination"}</strong><span>{checkin.note || "No additional note"}</span></div>
      </div>
      {ACTIVE_STATES.includes(checkin.state) && (
        <div className="drawer-actions">
          <button className="button" onClick={() => onAcknowledge(checkin)}><Check size={16} /> Confirm safe</button>
          <button className="button secondary" onClick={() => onCancel(checkin)}><X size={16} /> Cancel</button>
        </div>
      )}
      <section className="drawer-section">
        <div className="section-title"><h3>Check-in window</h3><Clock3 size={16} /></div>
        <dl className="metadata">
          <div><dt>Opens</dt><dd>{formatDateTime(checkin.opens_at)}</dd></div>
          <div><dt>Due</dt><dd>{formatDateTime(checkin.due_at)}</dd></div>
          <div><dt>Grace period</dt><dd>{checkin.grace_minutes} minutes</dd></div>
          <div><dt>Created by</dt><dd>{checkin.created_by}</dd></div>
        </dl>
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Location share</h3><LocateFixed size={16} /></div>
        {checkin.location ? (
          <div className="location-card">
            <MapPin size={18} />
            <span><strong>{checkin.location.label}</strong><small>{checkin.location.accuracy_meters} m accuracy / sequence {checkin.location.sequence}</small></span>
            <Status value="LIVE" />
          </div>
        ) : <div className="empty-inline"><MapPinOff size={18} /><span>Location is not being shared.</span></div>}
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Incident timeline</h3><History size={16} /></div>
        {checkin.timeline.length ? checkin.timeline.map((event) => (
          <div className="timeline-row" key={event.id}>
            <i />
            <span><strong>{titleCase(event.kind)}</strong><small>{event.actor_id} / {formatDateTime(event.at)}</small></span>
          </div>
        )) : <div className="empty-inline"><CircleDot size={17} /><span>No lifecycle events yet.</span></div>}
      </section>
    </aside>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-heading"><h2>{title}</h2><button className="icon-button" title="Close" onClick={onClose}><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function CreateModal({ members, onClose, onSubmit }) {
  const [form, setForm] = useState({
    member_id: "user-vedant",
    title: "Evening walk",
    destination: "Home",
    opens_at: "2026-06-14T19:30",
    due_at: "2026-06-14T20:15",
    grace_minutes: 20,
    note: "Neighborhood loop"
  });
  return (
    <Modal title="Create safety check-in" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
        <div className="form-grid">
          <label>Member<select value={form.member_id} onChange={(event) => setForm({ ...form, member_id: event.target.value })}>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label>
          <label>Grace period<select value={form.grace_minutes} onChange={(event) => setForm({ ...form, grace_minutes: Number(event.target.value) })}><option value="10">10 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label>
        </div>
        <label>Check-in title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>Destination<input value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} /></label>
        <div className="form-grid">
          <label>Window opens<input type="datetime-local" value={form.opens_at} onChange={(event) => setForm({ ...form, opens_at: event.target.value })} /></label>
          <label>Due time<input type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} /></label>
        </div>
        <label>Note<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        <div className="modal-note"><ShieldCheck size={17} /><span>The scheduler opens the window, marks it late after the due time, then escalates to trusted contacts after the grace period.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button"><CalendarClock size={16} /> Create check-in</button></div>
      </form>
    </Modal>
  );
}

function AcknowledgeModal({ checkin, onClose, onSubmit }) {
  const [message, setMessage] = useState("Arrived safely");
  const [offline, setOffline] = useState(false);
  return (
    <Modal title="Confirm safety" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(message, offline); }}>
        <div className="modal-context"><Avatar member={checkin.member} /><span><strong>{checkin.title}</strong><small>{checkin.member.name} / currently {titleCase(checkin.state)}</small></span></div>
        <label>Confirmation message<input autoFocus value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={offline} onChange={(event) => setOffline(event.target.checked)} /><span>Simulate delayed offline acknowledgement</span></label>
        <div className="modal-note"><WifiOff size={17} /><span>Offline events carry a client event ID and original occurrence time. Replays return the existing result.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button"><Check size={16} /> Confirm safe</button></div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [view, setView] = useState("overview");
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [socketState, setSocketState] = useState("CONNECTING");
  const [connectedClients, setConnectedClients] = useState(0);
  const refreshRef = useRef(null);

  const selected = useMemo(() => data?.checkins.find((item) => item.id === selectedId), [data, selectedId]);

  const refresh = async () => {
    const [snapshot, status] = await Promise.all([
      api(`/api/snapshot?actor_id=${ACTOR}&now=${encodeURIComponent(DEMO_NOW)}`),
      api("/api/health")
    ]);
    setData(snapshot);
    setHealth(status);
  };
  refreshRef.current = refresh;

  useEffect(() => {
    refresh().catch((error) => setToast(error.message));
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/households/household-maple?actor_id=${ACTOR}`);
    socket.onopen = () => setSocketState("LIVE");
    socket.onclose = () => setSocketState("OFFLINE");
    socket.onerror = () => setSocketState("OFFLINE");
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "snapshot") {
        setData(message.data);
        setConnectedClients(message.connected_clients);
      } else if (message.type === "presence.updated") {
        setConnectedClients(message.connected_clients);
      } else if (message.type === "snapshot.updated") {
        refreshRef.current?.();
      }
    };
    const heartbeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
    }, 20000);
    return () => {
      window.clearInterval(heartbeat);
      socket.close();
    };
  }, []);

  const run = async (action, message) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      if (message) setToast(message);
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(""), 3200);
    }
  };

  const acknowledge = (checkin, message, offline) => {
    const eventId = crypto.randomUUID();
    const action = offline
      ? () => api("/api/offline/sync", {
          method: "POST",
          body: JSON.stringify({
            actor_id: checkin.member_id,
            events: [{
              client_event_id: eventId,
              kind: "CHECKIN_ACKNOWLEDGED",
              occurred_at: "2026-06-14T23:42:00Z",
              payload: { checkin_id: checkin.id, message }
            }]
          })
        })
      : () => api(`/api/checkins/${checkin.id}/acknowledge`, {
          method: "POST",
          body: JSON.stringify({
            actor_id: checkin.member_id,
            idempotency_key: `web:${eventId}`,
            message
          })
        });
    return run(action, offline ? "Offline confirmation synchronized" : "Safety confirmed").then(() => setModal(null));
  };

  if (!data) return <div className="loading"><RefreshCw className="spin" size={20} /> Loading safety circle</div>;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={21} /></div>
          <div><strong>Homebound</strong><span>Family safety check-ins</span></div>
          <button className="icon-button sidebar-close" title="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <div className="circle-info">
          <span>Safety circle</span>
          <div><Users size={16} /><strong>{data.household.name}</strong></div>
          <small>{data.members.length} members / {data.household.timezone}</small>
        </div>
        <nav>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSidebarOpen(false); }}>
              <Icon size={17} /> {label}
              {id === "overview" && data.metrics.escalated > 0 && <span>{data.metrics.escalated}</span>}
              {id === "operations" && data.metrics.pending_jobs > 0 && <span>{data.metrics.pending_jobs}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="infra"><Database size={17} /><span><strong>{health?.persistence === "memory" ? "Memory mode" : "PostgreSQL + Redis"}</strong><small>{socketState === "LIVE" ? `${connectedClients} realtime client${connectedClients === 1 ? "" : "s"}` : "Realtime disconnected"}</small></span><i className={socketState === "LIVE" ? "online" : ""} /></div>
          <button className="reset-button" onClick={() => run(() => api("/api/reset", { method: "POST" }), "Demo state restored")}><RotateCcw size={15} /> Reset demo</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main>
        <header className="topbar">
          <button className="icon-button menu-button" title="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
          <div><p>Sunday, June 14</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div>
          <div className={`realtime-status realtime-${socketState.toLowerCase()}`}>
            {socketState === "LIVE" ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span><strong>{socketState === "LIVE" ? "Realtime connected" : "Realtime offline"}</strong><small>{data.metrics.pending_jobs} delivery jobs pending</small></span>
          </div>
          <button className="button top-action" onClick={() => setModal({ type: "create" })}><Plus size={16} /> New check-in</button>
        </header>
        <div className={`content ${busy ? "content-busy" : ""}`}>
          {view === "overview" && <OverviewView data={data} onSelect={setSelectedId} onAcknowledge={(checkin) => setModal({ type: "acknowledge", checkin })} onCreate={() => setModal({ type: "create" })} />}
          {view === "checkins" && <CheckinsView data={data} selectedId={selectedId} onSelect={setSelectedId} onAcknowledge={(checkin) => setModal({ type: "acknowledge", checkin })} onCreate={() => setModal({ type: "create" })} />}
          {view === "locations" && <LocationsView data={data} onSelect={setSelectedId} onUpdateLocation={(member) => run(() => api(`/api/members/${member.user_id}/location`, { method: "PUT", body: JSON.stringify({ actor_id: member.user_id, sequence: member.location.sequence + 1, latitude: member.location.latitude + 0.0012, longitude: member.location.longitude + 0.001, accuracy_meters: 14, label: "Approaching home", captured_at: "2026-06-14T23:46:00Z" }) }), "Newer location event accepted")} />}
          {view === "operations" && <OperationsView data={data} onRunDue={() => run(() => api("/api/scheduler/run", { method: "POST", body: JSON.stringify({ now: "2026-06-15T00:10:00Z" }) }), "Due scan marked overdue check-ins late")} onRunGrace={() => run(() => api("/api/scheduler/run", { method: "POST", body: JSON.stringify({ now: "2026-06-15T00:21:00Z" }) }), "Grace scan escalated unresolved check-ins")} onFail={() => run(() => api("/api/workers/fail-next", { method: "POST" }), "Next provider delivery will retry")} onDrain={() => run(() => api("/api/workers/drain?max_jobs=30", { method: "POST" }), "Delivery workers drained")} />}
          {view === "activity" && <ActivityView data={data} onSelect={setSelectedId} />}
        </div>
      </main>

      {selected && <><button className="drawer-scrim" aria-label="Close details" onClick={() => setSelectedId(null)} /><CheckinDrawer checkin={selected} onClose={() => setSelectedId(null)} onAcknowledge={(checkin) => setModal({ type: "acknowledge", checkin })} onCancel={(checkin) => run(() => api(`/api/checkins/${checkin.id}/cancel`, { method: "POST", body: JSON.stringify({ actor_id: ACTOR, reason: "Canceled from dashboard" }) }), "Check-in canceled").then(() => setSelectedId(null))} /></>}
      {modal?.type === "create" && <CreateModal members={data.members} onClose={() => setModal(null)} onSubmit={(form) => run(() => api("/api/checkins", { method: "POST", body: JSON.stringify({ household_id: "household-maple", actor_id: ACTOR, ...form, opens_at: centralToUtc(form.opens_at), due_at: centralToUtc(form.due_at) }) }), "Check-in scheduled").then(() => setModal(null))} />}
      {modal?.type === "acknowledge" && <AcknowledgeModal checkin={modal.checkin} onClose={() => setModal(null)} onSubmit={(message, offline) => acknowledge(modal.checkin, message, offline)} />}
      {toast && <div className="toast"><CheckCircle2 size={17} /> {toast}</div>}
    </div>
  );
}
