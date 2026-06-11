import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  CloudDownload,
  Database,
  Gauge,
  Home,
  Inbox,
  ListFilter,
  MapPin,
  Menu,
  PackageCheck,
  PackagePlus,
  Radio,
  RefreshCw,
  Route,
  Send,
  Settings2,
  ShieldAlert,
  Truck,
  Webhook,
  X
} from "lucide-react";

const NOW = "2026-06-10T14:00:00.000Z";
const CARRIER_STATUS = {
  UPS: { IN_TRANSIT: "I", OUT_FOR_DELIVERY: "O", DELIVERED: "D", EXCEPTION: "X" },
  FEDEX: { IN_TRANSIT: "IT", OUT_FOR_DELIVERY: "OD", DELIVERED: "DL", EXCEPTION: "DE" },
  USPS: { IN_TRANSIT: "IN TRANSIT", OUT_FOR_DELIVERY: "OUT FOR DELIVERY", DELIVERED: "DELIVERED", EXCEPTION: "ALERT" },
  AMAZON: { IN_TRANSIT: "SHIPPED", OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY", DELIVERED: "DELIVERED", EXCEPTION: "DELAYED" }
};

const NAV_ITEMS = [
  { id: "inbox", label: "Package inbox", icon: Inbox },
  { id: "events", label: "Event stream", icon: Activity },
  { id: "carriers", label: "Carrier health", icon: Gauge }
];

const STATE_META = {
  LABEL_CREATED: { label: "Label created", icon: Box },
  IN_TRANSIT: { label: "In transit", icon: Route },
  OUT_FOR_DELIVERY: { label: "Out for delivery", icon: Truck },
  DELIVERED: { label: "Delivered", icon: PackageCheck },
  EXCEPTION: { label: "Exception", icon: AlertTriangle }
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function formatDay(value) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}

function formatTime(value) {
  if (!value) return "No updates";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago"
  }).format(new Date(value));
}

function StatusPill({ state }) {
  const meta = STATE_META[state] || STATE_META.LABEL_CREATED;
  const Icon = meta.icon;
  return <span className={`status status-${state.toLowerCase()}`}><Icon size={12} />{meta.label}</span>;
}

function Metric({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon"><Icon size={19} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function CarrierMark({ carrier }) {
  return <span className={`carrier-mark carrier-${carrier.toLowerCase()}`}>{carrier === "AMAZON" ? "A" : carrier.slice(0, 2)}</span>;
}

function PackageRow({ parcel, selected, onSelect }) {
  return (
    <button className={`package-row ${selected ? "selected" : ""}`} onClick={() => onSelect(parcel.id)}>
      <CarrierMark carrier={parcel.carrier} />
      <span className="package-main">
        <span className="package-title-line"><strong>{parcel.description}</strong><StatusPill state={parcel.state} /></span>
        <small>{parcel.merchant} · {parcel.recipient}</small>
      </span>
      <span className="package-location">
        <MapPin size={14} />
        <span><strong>{parcel.lastLocation || "Awaiting first scan"}</strong><small>Updated {formatTime(parcel.lastEventAt)}</small></span>
      </span>
      <span className="package-eta">
        <small>{parcel.state === "DELIVERED" ? "Delivered" : "Estimated"}</small>
        <strong>{formatDay(parcel.deliveredAt || parcel.eta)}</strong>
        {parcel.deliveryWindow && <small>{parcel.deliveryWindow}</small>}
      </span>
      <ChevronRight size={17} />
    </button>
  );
}

function PackageInbox({ data, selectedId, onSelect }) {
  const [filter, setFilter] = useState("ACTIVE");
  const packages = data.packages.filter((parcel) => {
    if (filter === "ACTIVE") return parcel.state !== "DELIVERED";
    if (filter === "ALL") return true;
    return parcel.state === filter;
  });

  return (
    <>
      <section className="metrics-grid">
        <Metric icon={Truck} label="Active packages" value={data.metrics.active} detail="Across four carriers" tone="blue" />
        <Metric icon={Clock3} label="Arriving today" value={data.metrics.arrivingToday} detail="One out for delivery" tone="green" />
        <Metric icon={ShieldAlert} label="Exceptions" value={data.metrics.exceptions} detail="Needs review" tone="red" />
        <Metric icon={PackageCheck} label="Delivered" value={data.metrics.deliveredRecently} detail="Last seven days" tone="purple" />
      </section>

      <section className="panel package-panel">
        <div className="panel-heading package-toolbar">
          <div><p className="eyebrow">Unified tracking</p><h2>Package inbox</h2></div>
          <div className="segmented">
            {["ACTIVE", "ALL", "EXCEPTION", "DELIVERED"].map((value) => (
              <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="package-columns">
          <span>Package</span><span>Last location</span><span>Delivery</span><span />
        </div>
        <div className="package-list">
          {packages.map((parcel) => (
            <PackageRow key={parcel.id} parcel={parcel} selected={selectedId === parcel.id} onSelect={onSelect} />
          ))}
        </div>
      </section>

      <div className="lower-grid">
        <section className="panel compact-panel">
          <div className="panel-heading"><div><p className="eyebrow">Attention</p><h2>Delivery exceptions</h2></div><AlertTriangle size={19} /></div>
          <div className="exception-list">
            {data.packages.filter((item) => item.state === "EXCEPTION").map((parcel) => (
              <button key={parcel.id} onClick={() => onSelect(parcel.id)}>
                <CarrierMark carrier={parcel.carrier} />
                <span><strong>{parcel.description}</strong><small>{parcel.exceptionReason} · New ETA {formatDay(parcel.eta)}</small></span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel compact-panel">
          <div className="panel-heading"><div><p className="eyebrow">Processing</p><h2>Ingestion health</h2></div><Radio size={19} /></div>
          <div className="ingestion-grid">
            <div><span>Accepted events</span><strong>{data.events.filter((event) => event.projectionApplied).length}</strong></div>
            <div><span>Ignored safely</span><strong>{data.metrics.ignoredEvents}</strong></div>
            <div><span>Notifications</span><strong>{data.metrics.notificationsQueued}</strong></div>
            <div><span>Last poll</span><strong>{data.pollRuns[0] ? formatTime(data.pollRuns[0].startedAt) : "Not run"}</strong></div>
          </div>
        </section>
      </div>
    </>
  );
}

function EventStream({ data, onSelect }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Append-only audit</p><h2>Carrier event stream</h2></div>
        <span className="stream-live"><CircleDot size={14} /> Live projection</span>
      </div>
      <div className="event-head"><span>Event</span><span>Package</span><span>Occurred</span><span>Projection</span></div>
      <div className="event-list">
        {data.events.map((event) => {
          const parcel = data.packages.find((item) => item.id === event.packageId);
          return (
            <button key={event.id} className="event-row" onClick={() => onSelect(event.packageId)}>
              <span className="event-description">
                <span className={`event-dot event-dot-${event.normalizedStatus.toLowerCase()}`} />
                <span><strong>{event.message}</strong><small>{event.carrier} · {event.location || "Location unavailable"}</small></span>
              </span>
              <span><strong>{parcel?.description}</strong><small>{event.trackingNumber.slice(-8)}</small></span>
              <span>{formatTime(event.occurredAt)}</span>
              <span>
                {event.projectionApplied
                  ? <span className="projection applied"><Check size={13} />Applied</span>
                  : <span className="projection ignored"><ShieldAlert size={13} />{event.ignoredReason.replaceAll("_", " ")}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CarrierHealth({ data }) {
  return (
    <div className="carrier-grid">
      {data.carrierMetrics.map((carrier) => (
        <article className="carrier-card" key={carrier.carrier}>
          <div className="carrier-card-top"><CarrierMark carrier={carrier.carrier} /><span className={carrier.exceptions ? "carrier-alert" : "carrier-ok"}>{carrier.exceptions ? "Review" : "Healthy"}</span></div>
          <h2>{carrier.carrier === "FEDEX" ? "FedEx" : carrier.carrier.charAt(0) + carrier.carrier.slice(1).toLowerCase()}</h2>
          <p>Normalized carrier integration</p>
          <div className="score-ring" style={{ "--score": `${carrier.onTimeRate * 3.6}deg` }}><strong>{carrier.onTimeRate}%</strong><span>on time</span></div>
          <dl>
            <div><dt>Active</dt><dd>{carrier.active}</dd></div>
            <div><dt>Delivered</dt><dd>{carrier.delivered}</dd></div>
            <div><dt>Exceptions</dt><dd>{carrier.exceptions}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function Drawer({ parcel, onClose, onSimulate }) {
  const [preferences, setPreferences] = useState(parcel.notificationPreferences);
  useEffect(() => setPreferences(parcel.notificationPreferences), [parcel.id, parcel.notificationPreferences]);

  const savePreferences = async (key) => {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    await api(`/api/packages/${parcel.id}/preferences`, { method: "POST", body: JSON.stringify(next) });
  };

  return (
    <div className="drawer">
      <div className="drawer-heading">
        <div><p>{parcel.carrier} · {parcel.trackingNumber}</p><h2>{parcel.description}</h2></div>
        <button className="icon-button" title="Close details" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="drawer-status">
        <StatusPill state={parcel.state} />
        <strong>{parcel.state === "DELIVERED" ? `Delivered ${formatDay(parcel.deliveredAt)}` : `Expected ${formatDay(parcel.eta)}`}</strong>
        <span>{parcel.lastLocation || "Awaiting carrier scan"}{parcel.deliveryWindow ? ` · ${parcel.deliveryWindow}` : ""}</span>
      </div>
      <div className="drawer-section">
        <div className="section-title"><h3>Tracking timeline</h3><span>{parcel.events.length} events</span></div>
        <div className="timeline">
          {parcel.events.map((event, index) => (
            <div className={`timeline-item ${event.projectionApplied ? "" : "timeline-ignored"}`} key={event.id}>
              <div className="timeline-line"><span />{index < parcel.events.length - 1 && <i />}</div>
              <div><strong>{event.message}</strong><span>{event.location || "Location unavailable"}</span><small>{formatTime(event.occurredAt)}{!event.projectionApplied ? ` · ${event.ignoredReason.replaceAll("_", " ").toLowerCase()}` : ""}</small></div>
            </div>
          ))}
        </div>
      </div>
      <div className="drawer-section">
        <div className="section-title"><h3>Notifications</h3><Bell size={16} /></div>
        <div className="preference-list">
          {[["outForDelivery", "Out for delivery"], ["delivered", "Delivered"], ["exception", "Delivery exception"]].map(([key, label]) => (
            <label key={key}><span>{label}</span><input type="checkbox" checked={preferences[key]} onChange={() => savePreferences(key)} /></label>
          ))}
        </div>
      </div>
      {parcel.state !== "DELIVERED" && (
        <button className="button drawer-action" onClick={() => onSimulate(parcel)}><Webhook size={16} /> Simulate carrier event</button>
      )}
    </div>
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

function AddPackageModal({ data, onClose, onSave }) {
  const [form, setForm] = useState({ trackingNumber: "", carrier: "UPS", merchant: "", description: "", recipient: "Vedant", eta: "2026-06-14" });
  return (
    <Modal title="Track a package" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ ...form, householdId: data.household.id }); }}>
        <div className="form-grid">
          <label>Carrier<select value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })}><option>UPS</option><option>FEDEX</option><option>USPS</option><option>AMAZON</option></select></label>
          <label>Tracking number<input required autoFocus value={form.trackingNumber} onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })} placeholder="Enter carrier tracking ID" /></label>
        </div>
        <div className="form-grid">
          <label>Merchant<input required value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} placeholder="Merchant name" /></label>
          <label>Recipient<select value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })}>{data.household.members.map((member) => <option key={member}>{member}</option>)}</select></label>
        </div>
        <label>Package description<input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is being delivered?" /></label>
        <label>Initial ETA<input type="date" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} /></label>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button" type="submit"><PackagePlus size={16} /> Track package</button></div>
      </form>
    </Modal>
  );
}

function EventModal({ parcel, onClose, onSave }) {
  const [form, setForm] = useState({ normalizedStatus: parcel.state === "EXCEPTION" ? "IN_TRANSIT" : "DELIVERED", occurredAt: "2026-06-10T15:15", location: "Chicago, IL", message: "", eventId: `demo-${Date.now()}` });
  const carrierStatus = CARRIER_STATUS[parcel.carrier][form.normalizedStatus];
  return (
    <Modal title="Simulate carrier webhook" onClose={onClose}>
      <form onSubmit={(event) => {
        event.preventDefault();
        onSave({
          eventId: form.eventId,
          carrier: parcel.carrier,
          trackingNumber: parcel.trackingNumber,
          carrierStatus,
          occurredAt: new Date(`${form.occurredAt}:00Z`).toISOString(),
          location: form.location,
          message: form.message || STATE_META[form.normalizedStatus].label
        });
      }}>
        <div className="event-context"><CarrierMark carrier={parcel.carrier} /><span><strong>{parcel.description}</strong><small>{parcel.trackingNumber}</small></span></div>
        <label>Normalized outcome<select value={form.normalizedStatus} onChange={(e) => setForm({ ...form, normalizedStatus: e.target.value })}>{["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"].map((state) => <option key={state} value={state}>{STATE_META[state].label}</option>)}</select></label>
        <div className="form-grid">
          <label>Occurred at<input type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} /></label>
          <label>Carrier code<input disabled value={carrierStatus} /></label>
        </div>
        <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
        <label>Message<input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Optional carrier detail" /></label>
        <label>Event ID<input value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })} /><small>Reuse this ID to demonstrate deduplication.</small></label>
        <div className="modal-note"><ShieldAlert size={17} /><span>Set an occurred time before the latest scan to demonstrate out-of-order protection.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button" type="submit"><Send size={16} /> Send webhook</button></div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [view, setView] = useState("inbox");
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [snapshot, status] = await Promise.all([
        api(`/api/snapshot?householdId=household-maple&asOf=${encodeURIComponent(NOW)}`),
        api("/api/health")
      ]);
      setData(snapshot);
      setHealth(status);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  const selected = useMemo(() => data?.packages.find((item) => item.id === selectedId), [data, selectedId]);

  const mutate = async (path, body, message) => {
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify(body) });
      setModal(null);
      setNotice(typeof message === "function" ? message(result) : message);
      await load();
      window.setTimeout(() => setNotice(""), 3500);
      return result;
    } catch (error) {
      setNotice(error.message);
    }
  };

  const runPoll = () => mutate("/api/poll/run", { householdId: "household-maple", asOf: NOW }, (result) => `${result.run.packagesChecked} packages checked; ${result.events.length} updates ingested.`);
  const sendEvent = (payload) => mutate("/api/events/webhook", payload, (result) => result.duplicate ? "Duplicate event suppressed." : result.event.projectionApplied ? "Carrier event applied to package state." : `Event audited but ignored: ${result.event.ignoredReason.replaceAll("_", " ").toLowerCase()}.`);

  if (!data && loading) return <div className="loading-screen"><RefreshCw className="spin" size={23} /> Loading delivery network</div>;
  if (!data) return <div className="loading-screen">Unable to load package data.</div>;

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div className="brand"><div className="brand-mark"><Box size={20} /></div><div><strong>Parcelboard</strong><span>Delivery operations</span></div><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <div className="household">
          <span>Household</span>
          <div><Home size={16} /><strong>{data.household.name}</strong><ChevronDown size={15} /></div>
          <small>{data.household.address}</small>
        </div>
        <nav>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSidebarOpen(false); }}><Icon size={18} />{label}{id === "events" && data.metrics.ignoredEvents > 0 && <span>{data.metrics.ignoredEvents}</span>}</button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-status"><Database size={18} /><div><strong>{health?.persistence === "redis" ? "Redis connected" : "Memory fallback"}</strong><span>Snapshot + dedupe + stream</span></div><i className={health?.persistence === "redis" ? "online" : ""} /></div>
          <button className="sidebar-action" onClick={runPoll}><CloudDownload size={16} /> Poll all carriers</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main>
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div><p>{data.household.name} · Wednesday, June 10</p><h1>{NAV_ITEMS.find((item) => item.id === view)?.label}</h1></div>
          <div className="topbar-actions">
            <button className="button secondary poll-button" onClick={runPoll}><RefreshCw size={16} /> Poll carriers</button>
            <button className="button" onClick={() => setModal({ type: "package" })}><PackagePlus size={16} /> Track package</button>
          </div>
        </header>

        <div className={`content ${loading ? "content-loading" : ""}`}>
          {view === "inbox" && <PackageInbox data={data} selectedId={selectedId} onSelect={setSelectedId} />}
          {view === "events" && <EventStream data={data} onSelect={setSelectedId} />}
          {view === "carriers" && <CarrierHealth data={data} />}
        </div>
      </main>

      {selected && <><button className="drawer-scrim" aria-label="Close package details" onClick={() => setSelectedId(null)} /><Drawer parcel={selected} onClose={() => setSelectedId(null)} onSimulate={(parcel) => setModal({ type: "event", parcel })} /></>}
      {modal?.type === "package" && <AddPackageModal data={data} onClose={() => setModal(null)} onSave={(form) => mutate("/api/packages", form, `${form.description} added to the package inbox.`)} />}
      {modal?.type === "event" && <EventModal parcel={modal.parcel} onClose={() => setModal(null)} onSave={sendEvent} />}
      {notice && <div className="toast"><Activity size={17} />{notice}</div>}
    </div>
  );
}
