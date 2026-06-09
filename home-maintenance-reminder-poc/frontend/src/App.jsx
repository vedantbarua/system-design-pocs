import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Gauge,
  History,
  Home,
  LayoutDashboard,
  Menu,
  PackagePlus,
  Plus,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  Wrench,
  X
} from "lucide-react";

const TODAY = "2026-06-09";
const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tasks", label: "Tasks", icon: ClipboardCheck },
  { id: "assets", label: "Assets", icon: Wrench },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "history", label: "History", icon: History }
];

const money = (cents = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

const shortDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`)
      )
    : "Usage based";

const longDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`)
      )
    : "Not set";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function StatusPill({ status }) {
  return <span className={`status status-${status.toLowerCase()}`}>{status.replace("_", " ")}</span>;
}

function EmptyState({ icon: Icon, title, detail }) {
  return (
    <div className="empty-state">
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function TaskRow({ task, onComplete, onSkip }) {
  const dueLabel =
    task.scheduleType === "usage"
      ? `${task.currentUsage}/${task.nextDueUsage} ${task.usageUnit}`
      : longDate(task.nextDueDate);

  return (
    <div className="task-row">
      <div className={`task-marker marker-${task.status.toLowerCase()}`}>
        {task.status === "OVERDUE" ? <Clock3 size={17} /> : <Wrench size={17} />}
      </div>
      <div className="task-copy">
        <div className="task-title-line">
          <strong>{task.title}</strong>
          <StatusPill status={task.status} />
        </div>
        <span>
          {task.asset?.name || task.room?.name || task.category} · {dueLabel}
        </span>
      </div>
      <div className="task-owner">{task.assignedTo}</div>
      <div className="task-actions">
        <button className="icon-button subtle" title="Skip this cycle" onClick={() => onSkip(task)}>
          <SkipForward size={17} />
        </button>
        <button className="button button-small" onClick={() => onComplete(task)}>
          <Check size={16} />
          Complete
        </button>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon">
        <Icon size={19} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function Overview({ data, onComplete, onSkip, setTab }) {
  const attention = data.tasks.filter((task) => ["OVERDUE", "DUE"].includes(task.status));
  const nextTasks = data.tasks.filter((task) => task.status === "UPCOMING").slice(0, 3);

  return (
    <>
      <section className="metrics-grid">
        <Metric
          icon={Clock3}
          label="Overdue"
          value={data.metrics.statusCounts.OVERDUE || 0}
          detail="Needs attention now"
          tone="danger"
        />
        <Metric
          icon={CalendarDays}
          label="Due soon"
          value={data.metrics.statusCounts.DUE || 0}
          detail="Inside reminder window"
          tone="warning"
        />
        <Metric
          icon={ShieldCheck}
          label="Asset health"
          value={`${data.metrics.averageHealth}%`}
          detail={`${data.metrics.assetCount} tracked assets`}
          tone="success"
        />
        <Metric
          icon={CircleDollarSign}
          label="2026 spend"
          value={money(data.metrics.yearlySpendCents)}
          detail="Completed service"
          tone="neutral"
        />
      </section>

      <div className="overview-grid">
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Priority queue</p>
              <h2>Needs attention</h2>
            </div>
            <button className="text-button" onClick={() => setTab("tasks")}>
              View all
            </button>
          </div>
          <div className="task-list">
            {attention.length ? (
              attention.map((task) => <TaskRow key={task.id} task={task} onComplete={onComplete} onSkip={onSkip} />)
            ) : (
              <EmptyState icon={Check} title="All caught up" detail="There are no overdue or due tasks." />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Next up</p>
              <h2>Upcoming work</h2>
            </div>
            <CalendarDays size={19} />
          </div>
          <div className="upcoming-list">
            {nextTasks.map((task) => (
              <div className="upcoming-item" key={task.id}>
                <div className="date-tile">
                  <strong>{task.scheduleType === "date" ? new Date(`${task.nextDueDate}T00:00:00Z`).getUTCDate() : "—"}</strong>
                  <span>{task.scheduleType === "date" ? shortDate(task.nextDueDate).split(" ")[0] : "USE"}</span>
                </div>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.asset?.name || task.category}</span>
                </div>
              </div>
            ))}
          </div>
          {data.metrics.expiringDocumentCount > 0 && (
            <div className="expiry-callout">
              <ShieldCheck size={18} />
              <div>
                <strong>{data.metrics.expiringDocumentCount} warranty expiring</strong>
                <span>Water heater coverage ends July 2</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="panel asset-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Equipment</p>
            <h2>Asset health</h2>
          </div>
          <button className="text-button" onClick={() => setTab("assets")}>
            Open inventory
          </button>
        </div>
        <div className="asset-strip">
          {data.assets.map((asset) => (
            <div className="asset-compact" key={asset.id}>
              <div className="asset-symbol">
                <Gauge size={20} />
              </div>
              <div>
                <strong>{asset.name}</strong>
                <span>{asset.category}</span>
              </div>
              <div className={`health health-${asset.health.status.toLowerCase()}`}>{asset.health.score}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function TasksView({ data, onComplete, onSkip }) {
  const [filter, setFilter] = useState("ALL");
  const tasks = filter === "ALL" ? data.tasks : data.tasks.filter((task) => task.status === filter);
  return (
    <section className="panel page-panel">
      <div className="panel-heading toolbar-heading">
        <div>
          <p className="eyebrow">Recurring schedule</p>
          <h2>Maintenance tasks</h2>
        </div>
        <div className="segmented">
          {["ALL", "OVERDUE", "DUE", "UPCOMING"].map((value) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value === "ALL" ? "All" : value.charAt(0) + value.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="task-list expanded">
        {tasks.map((task) => <TaskRow key={task.id} task={task} onComplete={onComplete} onSkip={onSkip} />)}
      </div>
    </section>
  );
}

function AssetsView({ data, onAddAsset }) {
  return (
    <div className="asset-grid">
      {data.assets.map((asset) => (
        <article className="asset-card" key={asset.id}>
          <div className="asset-card-top">
            <div className="asset-symbol large">
              <Wrench size={22} />
            </div>
            <div className={`health health-${asset.health.status.toLowerCase()}`}>{asset.health.score}</div>
          </div>
          <p>{asset.category}</p>
          <h3>{asset.name}</h3>
          <span>{asset.model || "Model not recorded"}</span>
          <dl>
            <div>
              <dt>Installed</dt>
              <dd>{longDate(asset.installedOn)}</dd>
            </div>
            <div>
              <dt>Warranty</dt>
              <dd>{longDate(asset.warrantyEndsOn)}</dd>
            </div>
            <div>
              <dt>Serial</dt>
              <dd>{asset.serialNumber || "Not recorded"}</dd>
            </div>
          </dl>
          <div className="asset-card-footer">
            <span>{asset.documents.length} documents</span>
            <span>{asset.health.overdueTasks} overdue</span>
          </div>
        </article>
      ))}
      <button className="asset-add-card" onClick={onAddAsset}>
        <PackagePlus size={25} />
        <strong>Add an asset</strong>
        <span>Track equipment, warranties, and documents</span>
      </button>
    </div>
  );
}

function CalendarView({ data }) {
  const days = Array.from({ length: 30 }, (_, index) => index + 1);
  const byDay = Object.fromEntries(data.calendar.map((task) => [Number(task.nextDueDate.slice(-2)), task]));
  return (
    <section className="panel page-panel calendar-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Monthly schedule</p>
          <h2>June 2026</h2>
        </div>
        <div className="calendar-key">
          <span><i className="key-overdue" /> Overdue</span>
          <span><i className="key-due" /> Due</span>
        </div>
      </div>
      <div className="calendar-weekdays">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid">
        <div className="calendar-cell muted" />
        {days.map((day) => {
          const task = byDay[day];
          return (
            <div className={`calendar-cell ${day === 9 ? "today" : ""}`} key={day}>
              <span className="day-number">{day}</span>
              {task && <div className={`calendar-task calendar-${task.status.toLowerCase()}`}>{task.title}</div>}
            </div>
          );
        })}
        {Array.from({ length: 4 }, (_, index) => <div className="calendar-cell muted" key={`tail-${index}`} />)}
      </div>
    </section>
  );
}

function HistoryView({ data }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Service ledger</p>
          <h2>Maintenance history</h2>
        </div>
        <span className="total-spend">{money(data.metrics.yearlySpendCents)} this year</span>
      </div>
      <div className="history-table">
        <div className="history-head"><span>Service</span><span>Date</span><span>Vendor</span><span>Cost</span><span>Outcome</span></div>
        {data.serviceHistory.map((entry) => (
          <div className="history-row" key={entry.id}>
            <span><strong>{entry.title}</strong><small>{entry.notes}</small></span>
            <span>{shortDate(entry.completedOn)}</span>
            <span>{entry.vendor || "—"}</span>
            <span>{money(entry.costCents)}</span>
            <span><StatusPill status={entry.outcome} /></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" title="Close" onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CompletionModal({ task, onClose, onSave }) {
  const [form, setForm] = useState({
    completedOn: TODAY,
    cost: (task.estimatedCostCents / 100).toFixed(2),
    vendor: task.assignedTo || "DIY",
    notes: ""
  });
  return (
    <Modal title={`Complete ${task.title}`} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ ...form, costCents: Math.round(Number(form.cost) * 100) }); }}>
        <div className="form-grid">
          <label>Date completed<input type="date" value={form.completedOn} onChange={(e) => setForm({ ...form, completedOn: e.target.value })} /></label>
          <label>Cost<input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
        </div>
        <label>Vendor or person<input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></label>
        <label>Notes<textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Parts used, condition found, follow-up work..." /></label>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button" type="submit"><Check size={16} /> Mark complete</button>
        </div>
      </form>
    </Modal>
  );
}

function AddTaskModal({ data, onClose, onSave }) {
  const [form, setForm] = useState({
    title: "",
    category: "General",
    assetId: "",
    intervalDays: 90,
    nextDueDate: "2026-06-30",
    leadDays: 7,
    assignedTo: "Household",
    estimatedCost: "0"
  });
  return (
    <Modal title="Add maintenance task" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave({
        ...form,
        propertyId: data.property.id,
        scheduleType: "date",
        assetId: form.assetId || null,
        intervalDays: Number(form.intervalDays),
        leadDays: Number(form.leadDays),
        estimatedCostCents: Math.round(Number(form.estimatedCost) * 100)
      }); }}>
        <label>Task name<input required autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Clean dryer vent" /></label>
        <div className="form-grid">
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>General</option><option>Safety</option><option>Appliance</option><option>Exterior</option><option>Plumbing</option><option>Climate</option></select></label>
          <label>Asset<select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}><option value="">Whole property</option>{data.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        </div>
        <div className="form-grid three">
          <label>First due<input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} /></label>
          <label>Repeat every<input type="number" min="1" value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} /><small>days</small></label>
          <label>Remind before<input type="number" min="0" value={form.leadDays} onChange={(e) => setForm({ ...form, leadDays: e.target.value })} /><small>days</small></label>
        </div>
        <div className="form-grid">
          <label>Assigned to<input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} /></label>
          <label>Estimated cost<input type="number" min="0" step="0.01" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} /></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button" type="submit"><Plus size={16} /> Add task</button>
        </div>
      </form>
    </Modal>
  );
}

function AddAssetModal({ data, onClose, onSave }) {
  const [form, setForm] = useState({
    name: "",
    category: "Appliance",
    roomId: data.rooms[0]?.id || "",
    model: "",
    serialNumber: "",
    installedOn: "",
    warrantyEndsOn: ""
  });
  return (
    <Modal title="Add tracked asset" onClose={onClose}>
      <form onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...form,
          propertyId: data.property.id,
          roomId: form.roomId || null,
          installedOn: form.installedOn || null,
          warrantyEndsOn: form.warrantyEndsOn || null
        });
      }}>
        <label>Asset name<input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Samsung dryer" /></label>
        <div className="form-grid">
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Appliance</option><option>Climate</option><option>Plumbing</option><option>Electrical</option><option>Safety</option><option>Exterior</option><option>Other</option></select></label>
          <label>Location<select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}><option value="">Not assigned</option>{data.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>Model<input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
          <label>Serial number<input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></label>
        </div>
        <div className="form-grid">
          <label>Installed on<input type="date" value={form.installedOn} onChange={(e) => setForm({ ...form, installedOn: e.target.value })} /></label>
          <label>Warranty ends<input type="date" value={form.warrantyEndsOn} onChange={(e) => setForm({ ...form, warrantyEndsOn: e.target.value })} /></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button" type="submit"><PackagePlus size={16} /> Add asset</button>
        </div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [propertyId, setPropertyId] = useState("property-maple");
  const [tab, setTab] = useState("overview");
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async (selected = propertyId) => {
    setLoading(true);
    try {
      setData(await api(`/api/snapshot?propertyId=${selected}&asOf=${TODAY}`));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(propertyId); }, [propertyId]);

  const activeTab = useMemo(() => TABS.find((item) => item.id === tab), [tab]);

  const mutate = async (path, body, message) => {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      setModal(null);
      setNotice(message);
      await load();
      window.setTimeout(() => setNotice(""), 3200);
    } catch (error) {
      setNotice(error.message);
    }
  };

  const complete = (task, form) => mutate(`/api/tasks/${task.id}/complete`, form, `${task.title} completed and rescheduled.`);
  const skip = (task) => mutate(`/api/tasks/${task.id}/skip`, { skippedOn: TODAY }, `${task.title} skipped for this cycle.`);
  const runReminders = async () => {
    const result = await api("/api/reminders/run", {
      method: "POST",
      body: JSON.stringify({ propertyId, asOf: TODAY, warrantyWindowDays: 30 })
    });
    setNotice(result.reminders.length ? `${result.reminders.length} reminders queued.` : "No new reminders to queue.");
    await load();
    window.setTimeout(() => setNotice(""), 3200);
  };

  if (!data && loading) return <div className="loading-screen"><RefreshCw className="spin" size={24} /> Loading maintenance data</div>;
  if (!data) return <div className="loading-screen">Unable to load maintenance data.</div>;

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark"><Home size={20} /></div>
          <div><strong>Upkeep</strong><span>Home maintenance</span></div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X size={19} /></button>
        </div>
        <div className="property-picker">
          <span>Property</span>
          <label>
            <Home size={16} />
            <select value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setSidebarOpen(false); }}>
              {data.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <ChevronDown size={15} />
          </label>
          <small>{data.property.address}</small>
        </div>
        <nav>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setSidebarOpen(false); }}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="reminder-summary">
            <Bell size={18} />
            <div><strong>{data.metrics.pendingReminderCount} queued</strong><span>Reminder simulations</span></div>
          </div>
          <button className="sidebar-action" onClick={runReminders}><RefreshCw size={16} /> Run reminders</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main>
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div>
            <p>{data.property.name}</p>
            <h1>{activeTab.label}</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button notification-button" title="Notifications"><Bell size={19} /><span>{data.metrics.pendingReminderCount}</span></button>
            <button className="button" onClick={() => setModal({ type: "add" })}><Plus size={17} /> Add task</button>
          </div>
        </header>

        <div className={`content ${loading ? "content-loading" : ""}`}>
          {tab === "overview" && <Overview data={data} onComplete={(task) => setModal({ type: "complete", task })} onSkip={skip} setTab={setTab} />}
          {tab === "tasks" && <TasksView data={data} onComplete={(task) => setModal({ type: "complete", task })} onSkip={skip} />}
          {tab === "assets" && <AssetsView data={data} onAddAsset={() => setModal({ type: "asset" })} />}
          {tab === "calendar" && <CalendarView data={data} />}
          {tab === "history" && <HistoryView data={data} />}
        </div>
      </main>

      {notice && <div className="toast"><Activity size={17} />{notice}</div>}
      {modal?.type === "complete" && <CompletionModal task={modal.task} onClose={() => setModal(null)} onSave={(form) => complete(modal.task, form)} />}
      {modal?.type === "add" && <AddTaskModal data={data} onClose={() => setModal(null)} onSave={(form) => mutate("/api/tasks", form, `${form.title} added to the schedule.`)} />}
      {modal?.type === "asset" && <AddAssetModal data={data} onClose={() => setModal(null)} onSave={(form) => mutate("/api/assets", form, `${form.name} added to the inventory.`)} />}
    </div>
  );
}
