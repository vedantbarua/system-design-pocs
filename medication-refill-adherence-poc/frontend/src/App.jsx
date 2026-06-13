import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Database,
  FileClock,
  HeartPulse,
  History,
  Menu,
  PackageCheck,
  PackagePlus,
  Pill,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  SkipForward,
  Stethoscope,
  TimerReset,
  UserRoundCheck,
  Users,
  Wifi,
  X
} from "lucide-react";

const LOCAL_DATE = "2026-06-13";
const ACTOR = "user-vedant";
const NAV = [
  { id: "today", label: "Today", icon: CalendarClock },
  { id: "medications", label: "Medications", icon: Pill },
  { id: "operations", label: "Delivery operations", icon: Send },
  { id: "audit", label: "Activity", icon: Activity }
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

function Status({ value }) {
  return <span className={`status status-${value.toLowerCase()}`}>{titleCase(value)}</span>;
}

function Metric({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon"><Icon size={19} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function DoseRow({ dose, onResolve }) {
  const actionable = ["SCHEDULED", "MISSED"].includes(dose.state);
  return (
    <div className={`dose-row dose-${dose.state.toLowerCase()}`}>
      <div className="dose-time">
        <strong>{formatTime(dose.scheduled_at)}</strong>
        <span>{dose.local_time}</span>
      </div>
      <div className="dose-line"><i /></div>
      <div className="dose-copy">
        <div><strong>{dose.medication.name}</strong><Status value={dose.state} /></div>
        <span>{dose.medication.strength} / {dose.state === "SCHEDULED" ? "Awaiting confirmation" : `Resolved ${dose.resolved_at ? formatDateTime(dose.resolved_at) : ""}`}</span>
      </div>
      <div className="dose-actions">
        {actionable ? (
          <>
            <button className="icon-button take" title="Mark taken" onClick={() => onResolve(dose, "TAKEN")}><Check size={17} /></button>
            <button className="icon-button" title="Mark skipped" onClick={() => onResolve(dose, "SKIPPED")}><SkipForward size={17} /></button>
          </>
        ) : (
          dose.state === "TAKEN" ? <CheckCircle2 className="resolved-icon" size={21} /> : <AlertCircle className="resolved-icon warning" size={21} />
        )}
      </div>
    </div>
  );
}

function AdherenceChart({ history }) {
  return (
    <div className="adherence-chart">
      {history.map((day) => (
        <div className="bar-column" key={day.date}>
          <div className="bar-track">
            <i style={{ height: `${Math.max(day.percent, 5)}%` }} className={day.percent < 80 ? "under" : ""} />
          </div>
          <strong>{day.percent}%</strong>
          <span>{new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day.date}T00:00:00Z`))}</span>
        </div>
      ))}
    </div>
  );
}

function SupplyRow({ medication, onSelect, onRefill }) {
  return (
    <div className="supply-row">
      <div className={`med-icon ${medication.low_supply ? "low" : ""}`}><Pill size={18} /></div>
      <button className="supply-name" onClick={() => onSelect(medication.id)}>
        <strong>{medication.name} <span>{medication.strength}</span></strong>
        <small>{medication.instructions}</small>
      </button>
      <div className="supply-count">
        <strong>{medication.quantity_on_hand}</strong>
        <span>{medication.form}s left</span>
      </div>
      <div className="supply-days">
        <strong>{medication.supply_days} days</strong>
        <span>{medication.low_supply ? "Refill window" : "Supply forecast"}</span>
      </div>
      <button className="icon-button" title="Request refill" onClick={() => onRefill(medication)}><PackagePlus size={17} /></button>
    </div>
  );
}

function RefillRow({ refill, medications, onAdvance }) {
  const medication = medications.find((item) => item.id === refill.medication_id);
  const next = { REQUESTED: "ORDERED", ORDERED: "READY", READY: "COMPLETED" }[refill.status];
  return (
    <div className="refill-row">
      <div className="refill-icon"><PackageCheck size={18} /></div>
      <div><strong>{medication?.name || refill.medication_id}</strong><span>{refill.quantity} units / requested {formatDateTime(refill.requested_at)}</span></div>
      <Status value={refill.status} />
      {next && <button className="small-button" onClick={() => onAdvance(refill, next)}>{next === "COMPLETED" ? "Receive" : titleCase(next)} <ChevronRight size={14} /></button>}
    </div>
  );
}

function TodayView({ data, onResolve, onSelect, onRefill, onAdvance }) {
  const openRefills = data.refills.filter((item) => !["COMPLETED", "CANCELED"].includes(item.status));
  return (
    <>
      <section className="metrics-grid">
        <Metric icon={CheckCircle2} label="Taken today" value={data.metrics.taken_today} detail={`${data.today_doses.length} scheduled doses`} tone="green" />
        <Metric icon={AlertCircle} label="Missed today" value={data.metrics.missed_today} detail="Caregiver escalation enabled" tone="red" />
        <Metric icon={PackagePlus} label="Low supply" value={data.metrics.low_supply} detail={`${data.metrics.open_refills} refill in progress`} tone="amber" />
        <Metric icon={HeartPulse} label="7-day adherence" value={`${data.metrics.adherence_percent}%`} detail="Resolved dose events" tone="blue" />
      </section>

      <div className="today-grid">
        <section className="panel schedule-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Saturday, June 13</p><h2>Today's dose timeline</h2></div>
            <span className="timezone"><Clock3 size={14} /> Central time</span>
          </div>
          <div className="dose-list">{data.today_doses.map((dose) => <DoseRow key={dose.id} dose={dose} onResolve={onResolve} />)}</div>
        </section>
        <section className="panel adherence-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Past seven days</p><h2>Adherence trend</h2></div>
            <span className="score">{data.metrics.adherence_percent}%</span>
          </div>
          <AdherenceChart history={data.adherence_history} />
          <div className="adherence-note"><ShieldCheck size={17} /><span>Calculated from resolved dose events. Scheduled future doses are excluded.</span></div>
        </section>
      </div>

      <section className="panel inventory-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Inventory forecast</p><h2>Medication supply</h2></div>
          <span className="panel-count">{data.medications.length} active</span>
        </div>
        <div className="supply-columns"><span>Medication</span><span>On hand</span><span>Forecast</span><span /></div>
        <div>{data.medications.map((medication) => <SupplyRow key={medication.id} medication={medication} onSelect={onSelect} onRefill={onRefill} />)}</div>
      </section>

      <section className="panel refill-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Pharmacy workflow</p><h2>Open refills</h2></div>
          <ClipboardList size={19} />
        </div>
        {openRefills.length ? openRefills.map((refill) => <RefillRow key={refill.id} refill={refill} medications={data.medications} onAdvance={onAdvance} />) : <Empty icon={PackageCheck} title="No open refills" copy="New refill requests will appear here." />}
      </section>
    </>
  );
}

function MedicationRow({ medication, onSelect, onRefill }) {
  const nextDose = medication.doses
    .filter((item) => item.state === "SCHEDULED")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  return (
    <div
      className="medication-row"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(medication.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(medication.id);
      }}
    >
      <div className={`med-icon ${medication.low_supply ? "low" : ""}`}><Pill size={18} /></div>
      <div className="medication-main"><strong>{medication.name} <span>{medication.strength}</span></strong><small>{medication.instructions}</small></div>
      <div><strong>{medication.schedule_times.join(" / ")}</strong><small>{medication.timezone}</small></div>
      <div><strong>{nextDose ? formatDateTime(nextDose.scheduled_at) : "Course ending"}</strong><small>Next scheduled dose</small></div>
      <div><strong>{medication.supply_days} days</strong><small>{medication.quantity_on_hand} on hand</small></div>
      <button className="icon-button nested-action" title="Request refill" onClick={(event) => { event.stopPropagation(); onRefill(medication); }}><PackagePlus size={16} /></button>
      <ChevronRight size={17} />
    </div>
  );
}

function MedicationsView({ data, onSelect, onRefill }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Active care plan</p><h2>Medication registry</h2></div>
        <span className="panel-count">{data.medications.length} medications</span>
      </div>
      <div className="medication-columns"><span>Medication</span><span>Schedule</span><span>Next dose</span><span>Supply</span><span /><span /></div>
      <div>{data.medications.map((medication) => <MedicationRow key={medication.id} medication={medication} onSelect={onSelect} onRefill={onRefill} />)}</div>
    </section>
  );
}

function OperationsView({ data, onScheduler, onDrain, onFail }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Redis worker simulation</p><h2>Reminder delivery pipeline</h2></div>
        <div>
          <button className="button secondary" onClick={onFail}><Wifi size={16} /> Fail next delivery</button>
          <button className="button secondary" onClick={onScheduler}><CalendarClock size={16} /> Run scheduler</button>
          <button className="button" onClick={onDrain}><RefreshCw size={16} /> Drain workers</button>
        </div>
      </section>
      <section className="metrics-grid operations-metrics">
        <Metric icon={ClipboardList} label="Pending jobs" value={data.metrics.pending_jobs} detail="Ready or retrying" tone="amber" />
        <Metric icon={Send} label="Deliveries" value={data.deliveries.length} detail="Deduplicated sends" tone="green" />
        <Metric icon={TimerReset} label="Retries" value={data.jobs.filter((item) => item.attempts > 1 || item.status === "RETRY").length} detail="Provider recovery" tone="red" />
        <Metric icon={Users} label="Care members" value={data.members.length} detail="Role-scoped access" tone="blue" />
      </section>
      <section className="panel page-panel jobs-panel">
        <div className="job-head"><span>Work item</span><span>Payload</span><span>Attempts</span><span>Created</span><span>Status</span></div>
        {data.jobs.length ? data.jobs.slice().reverse().map((job) => (
          <div className="job-row" key={job.id}>
            <span className="job-kind"><Bell size={16} /><span><strong>{titleCase(job.kind)}</strong><small>{job.id}</small></span></span>
            <span>{Object.entries(job.payload).map(([key, value]) => `${key}: ${value}`).join(" / ")}</span>
            <span>{job.attempts} / {job.max_attempts}</span>
            <span>{formatDateTime(job.created_at)}</span>
            <Status value={job.status} />
          </div>
        )) : <Empty icon={CheckCircle2} title="Queue is clear" copy="Run the scheduler to create reminder and refill work." />}
      </section>
    </>
  );
}

function AuditView({ data, onSelect }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Append-only workflow history</p><h2>Care activity</h2></div>
        <span className="panel-count">{data.audit.length} events</span>
      </div>
      <div className="audit-head"><span>Event</span><span>Medication</span><span>Actor</span><span>Time</span><span>Details</span></div>
      {data.audit.map((event) => {
        const medication = data.medications.find((item) => item.id === event.medication_id);
        return (
          <button className="audit-row" key={event.id} onClick={() => medication && onSelect(medication.id)}>
            <span className="audit-event"><Activity size={15} /><strong>{titleCase(event.action)}</strong></span>
            <span>{medication?.name || "Care plan"}</span>
            <span>{event.actor_id}</span>
            <span>{formatDateTime(event.at)}</span>
            <span>{Object.entries(event.details).map(([key, value]) => `${key}: ${value}`).join(" / ")}</span>
          </button>
        );
      })}
    </section>
  );
}

function Empty({ icon: Icon, title, copy }) {
  return <div className="empty"><Icon size={25} /><strong>{title}</strong><span>{copy}</span></div>;
}

function MedicationDrawer({ medication, onClose, onRefill, onInventory, onPrescription }) {
  return (
    <aside className="drawer">
      <div className="drawer-heading">
        <div><p>{medication.form} / {medication.status}</p><h2>{medication.name} {medication.strength}</h2></div>
        <button className="icon-button" title="Close medication details" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="drawer-summary">
        <div className="drawer-icon"><Pill size={22} /></div>
        <span><strong>{medication.quantity_on_hand} units</strong><small>{medication.supply_days} estimated supply days</small></span>
        <Status value={medication.low_supply ? "LOW_SUPPLY" : "ON_TRACK"} />
      </div>
      <div className="drawer-actions">
        <button className="button" onClick={() => onRefill(medication)}><PackagePlus size={16} /> Request refill</button>
        <button className="icon-button" title="Adjust inventory" onClick={() => onInventory(medication)}><PackageCheck size={17} /></button>
        <button className="icon-button" title="Add prescription version" onClick={() => onPrescription(medication)}><FileClock size={17} /></button>
      </div>
      <section className="drawer-section">
        <div className="section-title"><h3>Care instructions</h3><Stethoscope size={16} /></div>
        <p className="instructions">{medication.instructions}</p>
        <dl className="metadata">
          <div><dt>Schedule</dt><dd>{medication.schedule_times.join(", ")}</dd></div>
          <div><dt>Timezone</dt><dd>{medication.timezone}</dd></div>
          <div><dt>Prescriber</dt><dd>{medication.prescriber}</dd></div>
          <div><dt>Pharmacy</dt><dd>{medication.pharmacy}</dd></div>
        </dl>
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Prescription history</h3><History size={16} /></div>
        {medication.prescriptions.length ? medication.prescriptions.map((item) => (
          <div className="history-row" key={item.id}>
            <div><strong>Version {item.version} / {item.rx_number_masked}</strong><span>Expires {item.expires_on}</span></div>
            <div><strong>{item.remaining_refills}</strong><span>refills left</span></div>
          </div>
        )) : <p className="muted-copy">No prescription record for this household item.</p>}
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Inventory ledger</h3><PackageCheck size={16} /></div>
        {medication.inventory.length ? medication.inventory.slice(0, 8).map((item) => (
          <div className="history-row" key={item.id}>
            <div><strong>{titleCase(item.reason)}</strong><span>{formatDateTime(item.created_at)} / {item.actor_id}</span></div>
            <div className={item.delta < 0 ? "negative" : "positive"}><strong>{item.delta > 0 ? "+" : ""}{item.delta}</strong><span>balance {item.balance}</span></div>
          </div>
        )) : <p className="muted-copy">No inventory adjustments recorded yet.</p>}
      </section>
      <p className="safety-note">Workflow simulation only. Medication decisions should follow instructions from a qualified clinician or pharmacist.</p>
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

function RefillModal({ medication, onClose, onSubmit }) {
  const [quantity, setQuantity] = useState(medication.schedule_times.length === 1 ? 30 : 60);
  return (
    <Modal title="Request refill" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(quantity); }}>
        <div className="modal-context"><PackagePlus size={20} /><span><strong>{medication.name} {medication.strength}</strong><small>{medication.quantity_on_hand} units / {medication.supply_days} supply days</small></span></div>
        <label>Refill quantity<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
        <div className="modal-note"><ShieldCheck size={17} /><span>One open refill is allowed per medication. Replayed requests return the existing workflow.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button"><PackagePlus size={16} /> Request refill</button></div>
      </form>
    </Modal>
  );
}

function InventoryModal({ medication, onClose, onSubmit }) {
  const [delta, setDelta] = useState(30);
  const [reason, setReason] = useState("MANUAL_CORRECTION");
  return (
    <Modal title="Adjust inventory" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(delta, reason); }}>
        <div className="modal-context"><PackageCheck size={20} /><span><strong>{medication.name}</strong><small>Current balance {medication.quantity_on_hand}</small></span></div>
        <div className="form-grid">
          <label>Quantity change<input type="number" value={delta} onChange={(event) => setDelta(Number(event.target.value))} /></label>
          <label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}><option>MANUAL_CORRECTION</option><option>PHARMACY_PICKUP</option><option>LOST_OR_DAMAGED</option></select></label>
        </div>
        <div className="modal-note"><PackageCheck size={17} /><span>Inventory is updated through an immutable ledger entry with a unique external reference.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button">Record adjustment</button></div>
      </form>
    </Modal>
  );
}

function PrescriptionModal({ medication, onClose, onSubmit }) {
  const [form, setForm] = useState({ rx_number_masked: "RX-***204", authorized_refills: 3, remaining_refills: 3, expires_on: "2027-06-13" });
  return (
    <Modal title="Add prescription version" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
        <div className="modal-context"><FileClock size={20} /><span><strong>{medication.name}</strong><small>Existing versions are retained</small></span></div>
        <label>Masked prescription number<input value={form.rx_number_masked} onChange={(event) => setForm({ ...form, rx_number_masked: event.target.value })} /></label>
        <div className="form-grid">
          <label>Authorized refills<input type="number" min="0" value={form.authorized_refills} onChange={(event) => setForm({ ...form, authorized_refills: Number(event.target.value) })} /></label>
          <label>Remaining refills<input type="number" min="0" value={form.remaining_refills} onChange={(event) => setForm({ ...form, remaining_refills: Number(event.target.value) })} /></label>
        </div>
        <label>Expires on<input type="date" value={form.expires_on} onChange={(event) => setForm({ ...form, expires_on: event.target.value })} /></label>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button">Add version</button></div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [view, setView] = useState("today");
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const selected = useMemo(() => data?.medications.find((item) => item.id === selectedId), [data, selectedId]);

  const refresh = async () => {
    const [snapshot, status] = await Promise.all([
      api(`/api/snapshot?local_date=${LOCAL_DATE}&actor_id=${ACTOR}`),
      api("/api/health")
    ]);
    setData(snapshot);
    setHealth(status);
  };

  useEffect(() => {
    refresh().catch((error) => setToast(error.message));
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

  const resolveDose = (dose, state) => run(
    () => api(`/api/doses/${dose.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ actor_id: ACTOR, state, idempotency_key: `${dose.id}:${state}:${crypto.randomUUID()}` })
    }),
    `${dose.medication.name} marked ${state.toLowerCase()}`
  );

  const requestRefill = (medication, quantity) => run(
    () => api(`/api/medications/${medication.id}/refills`, {
      method: "POST",
      body: JSON.stringify({ actor_id: ACTOR, quantity, idempotency_key: `${medication.id}:refill:${crypto.randomUUID()}` })
    }),
    "Refill request recorded"
  ).then(() => setModal(null));

  if (!data) return <div className="loading"><RefreshCw className="spin" size={20} /> Loading care plan</div>;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><HeartPulse size={21} /></div>
          <div><strong>Dosewise</strong><span>Medication operations</span></div>
          <button className="icon-button sidebar-close" title="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <div className="care-circle">
          <span>Care circle</span>
          <div><UserRoundCheck size={16} /><strong>{data.household.name}</strong></div>
          <small>{data.members.length} members / {data.household.timezone}</small>
        </div>
        <nav>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSidebarOpen(false); }}>
              <Icon size={17} /> {label}
              {id === "operations" && data.metrics.pending_jobs > 0 && <span>{data.metrics.pending_jobs}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="infra"><Database size={17} /><span><strong>{health?.persistence === "memory" ? "Memory mode" : "PostgreSQL + Redis"}</strong><small>{health?.status === "ok" ? "API connected" : "Connecting"}</small></span><i className={health?.status === "ok" ? "online" : ""} /></div>
          <button className="reset-button" onClick={() => run(() => api("/api/reset", { method: "POST" }), "Demo state restored")}><RotateCcw size={15} /> Reset demo</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main>
        <header className="topbar">
          <button className="icon-button menu-button" title="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
          <div><p>Personal medication workflow</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div>
          <div className="top-status"><i /><span><strong>Scheduler healthy</strong><small>{data.metrics.pending_jobs} jobs pending</small></span></div>
        </header>
        <div className={`content ${busy ? "content-busy" : ""}`}>
          {view === "today" && <TodayView data={data} onResolve={resolveDose} onSelect={setSelectedId} onRefill={(medication) => setModal({ type: "refill", medication })} onAdvance={(refill, status) => run(() => api(`/api/refills/${refill.id}/status`, { method: "POST", body: JSON.stringify({ actor_id: ACTOR, status }) }), `Refill moved to ${status.toLowerCase()}`)} />}
          {view === "medications" && <MedicationsView data={data} onSelect={setSelectedId} onRefill={(medication) => setModal({ type: "refill", medication })} />}
          {view === "operations" && <OperationsView data={data} onScheduler={() => run(() => api("/api/scheduler/run", { method: "POST", body: JSON.stringify({ now: "2026-06-13T21:30:00Z" }) }), "Scheduler scan completed")} onDrain={() => run(() => api("/api/workers/drain?max_jobs=25", { method: "POST" }), "Notification workers drained")} onFail={() => run(() => api("/api/workers/fail-next", { method: "POST" }), "Next provider delivery will fail once")} />}
          {view === "audit" && <AuditView data={data} onSelect={setSelectedId} />}
        </div>
      </main>

      {selected && <><button className="drawer-scrim" aria-label="Close medication details" onClick={() => setSelectedId(null)} /><MedicationDrawer medication={selected} onClose={() => setSelectedId(null)} onRefill={(medication) => setModal({ type: "refill", medication })} onInventory={(medication) => setModal({ type: "inventory", medication })} onPrescription={(medication) => setModal({ type: "prescription", medication })} /></>}
      {modal?.type === "refill" && <RefillModal medication={modal.medication} onClose={() => setModal(null)} onSubmit={(quantity) => requestRefill(modal.medication, quantity)} />}
      {modal?.type === "inventory" && <InventoryModal medication={modal.medication} onClose={() => setModal(null)} onSubmit={(delta, reason) => run(() => api(`/api/medications/${modal.medication.id}/inventory`, { method: "POST", body: JSON.stringify({ actor_id: ACTOR, delta, reason, reference: `manual:${crypto.randomUUID()}` }) }), "Inventory ledger updated").then(() => setModal(null))} />}
      {modal?.type === "prescription" && <PrescriptionModal medication={modal.medication} onClose={() => setModal(null)} onSubmit={(form) => run(() => api(`/api/medications/${modal.medication.id}/prescriptions`, { method: "POST", body: JSON.stringify({ actor_id: ACTOR, ...form }) }), "Prescription version added").then(() => setModal(null))} />}
      {toast && <div className="toast"><CheckCircle2 size={17} /> {toast}</div>}
    </div>
  );
}
