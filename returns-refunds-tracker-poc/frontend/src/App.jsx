import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BadgeCheck,
  Banknote,
  Box,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Database,
  FileText,
  Inbox,
  Menu,
  PackageCheck,
  PackageOpen,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Truck,
  WalletCards,
  Webhook,
  X
} from "lucide-react";

const AS_OF = "2026-06-11";
const NAV = [
  { id: "returns", label: "Return queue", icon: Inbox },
  { id: "refunds", label: "Refund ledger", icon: WalletCards },
  { id: "events", label: "Event audit", icon: Activity }
];

const STATE_LABEL = {
  REQUESTED: "Requested",
  AUTHORIZED: "Authorized",
  LABEL_ISSUED: "Label issued",
  IN_TRANSIT: "In transit",
  RECEIVED: "Received",
  INSPECTING: "Inspecting",
  APPROVED: "Approved",
  REFUND_PENDING: "Refund pending",
  PARTIALLY_REFUNDED: "Partial refund",
  REFUNDED: "Refunded",
  REJECTED: "Rejected"
};

const money = (cents = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const day = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
      )
    : "Not set";

const timestamp = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Chicago"
      }).format(new Date(value))
    : "No activity";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function Status({ state }) {
  return <span className={`status status-${state.toLowerCase()}`}>{STATE_LABEL[state] || state.replaceAll("_", " ")}</span>;
}

function Sla({ sla }) {
  return <span className={`sla sla-${sla.toLowerCase()}`}>{sla.replaceAll("_", " ")}</span>;
}

function Metric({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon"><Icon size={19} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function ReturnRow({ item, selected, onSelect }) {
  const primaryItem = item.items[0]?.purchaseItem;
  return (
    <button className={`return-row ${selected ? "selected" : ""}`} onClick={() => onSelect(item.id)}>
      <div className="merchant-mark">{item.purchase.merchant.slice(0, 2).toUpperCase()}</div>
      <div className="return-main">
        <div><strong>{primaryItem?.name}</strong><Status state={item.state} /></div>
        <span>{item.purchase.merchant} · {item.rma}</span>
      </div>
      <div className="return-stage">
        <span>{item.lastLocation || "Awaiting merchant update"}</span>
        <small>Updated {timestamp(item.lastEventAt)}</small>
      </div>
      <div className="return-value">
        <strong>{money(item.expectedRefundCents)}</strong>
        <small>{item.refundedCents ? `${money(item.refundedCents)} received` : "Expected refund"}</small>
      </div>
      <Sla sla={item.sla} />
      <ChevronRight size={17} />
    </button>
  );
}

function ReturnQueue({ data, selectedId, onSelect }) {
  const [filter, setFilter] = useState("OPEN");
  const [query, setQuery] = useState("");
  const items = data.returns.filter((item) => {
    const matchesFilter =
      filter === "ALL" ||
      (filter === "OPEN" && !["REFUNDED", "REJECTED"].includes(item.state)) ||
      (filter === "RISK" && ["AT_RISK", "BREACHED"].includes(item.sla)) ||
      (filter === "CLOSED" && ["REFUNDED", "REJECTED"].includes(item.state));
    const haystack = `${item.purchase.merchant} ${item.rma} ${item.purchase.orderNumber} ${item.items.map((line) => line.purchaseItem.name).join(" ")}`.toLowerCase();
    return matchesFilter && haystack.includes(query.toLowerCase());
  });

  return (
    <>
      <section className="metrics-grid">
        <Metric icon={RotateCcw} label="Open returns" value={data.metrics.openReturns} detail="Across four merchants" tone="blue" />
        <Metric icon={Clock3} label="Awaiting refund" value={data.metrics.awaitingRefund} detail="Approved or partially paid" tone="amber" />
        <Metric icon={ShieldAlert} label="SLA attention" value={data.metrics.atRisk} detail="At risk or breached" tone="red" />
        <Metric icon={CircleDollarSign} label="Outstanding" value={money(data.metrics.outstandingCents)} detail="Expected back to cards" tone="green" />
      </section>

      <section className="panel queue-panel">
        <div className="panel-heading queue-heading">
          <div><p className="eyebrow">Lifecycle operations</p><h2>Returns and refunds</h2></div>
          <div className="queue-controls">
            <label className="search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search returns" /></label>
            <div className="segmented">
              {["OPEN", "ALL", "RISK", "CLOSED"].map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value.charAt(0) + value.slice(1).toLowerCase()}</button>)}
            </div>
          </div>
        </div>
        <div className="return-columns"><span>Return</span><span>Current stage</span><span>Value</span><span>SLA</span><span /></div>
        <div>{items.map((item) => <ReturnRow key={item.id} item={item} selected={selectedId === item.id} onSelect={onSelect} />)}</div>
      </section>

      <div className="lower-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Escalation</p><h2>Deadline alerts</h2></div><AlertTriangle size={19} /></div>
          <div className="alert-list">
            {data.alerts.map((alert) => {
              const item = data.returns.find((entry) => entry.id === alert.returnId);
              return (
                <button key={alert.id} onClick={() => onSelect(alert.returnId)}>
                  <div className={`alert-icon alert-${alert.severity.toLowerCase()}`}><ShieldAlert size={17} /></div>
                  <span><strong>{alert.title}</strong><small>{item?.purchase.orderNumber} · {money(item?.outstandingCents)}</small></span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Reconciliation</p><h2>Refund exposure</h2></div><Banknote size={19} /></div>
          <div className="exposure">
            <div><span>Expected</span><strong>{money(data.returns.reduce((sum, item) => sum + item.expectedRefundCents, 0))}</strong></div>
            <div><span>Posted</span><strong>{money(data.metrics.refundedCents)}</strong></div>
            <div><span>Still due</span><strong>{money(data.metrics.outstandingCents)}</strong></div>
          </div>
          <div className="progress-track"><i style={{ width: `${Math.round(data.metrics.refundedCents / data.returns.reduce((sum, item) => sum + item.expectedRefundCents, 0) * 100)}%` }} /></div>
        </section>
      </div>
    </>
  );
}

function RefundLedger({ data, onSelect }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Payment reconciliation</p><h2>Refund ledger</h2></div>
        <strong className="ledger-total">{money(data.metrics.refundedCents)} posted</strong>
      </div>
      <div className="ledger-head"><span>Refund</span><span>Return</span><span>Provider</span><span>Posted</span><span>Amount</span><span>Status</span></div>
      <div className="ledger-list">
        {data.refunds.map((refund) => {
          const item = data.returns.find((entry) => entry.id === refund.returnId);
          return (
            <button key={refund.id} className="ledger-row" onClick={() => onSelect(refund.returnId)}>
              <span><strong>{refund.providerRefundId}</strong><small>{refund.id}</small></span>
              <span><strong>{item?.purchase.merchant}</strong><small>{item?.rma}</small></span>
              <span>{refund.provider}</span>
              <span>{timestamp(refund.postedAt)}</span>
              <span><strong>{money(refund.amountCents)}</strong></span>
              <span className="posted"><Check size={13} />Posted</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function EventAudit({ data, onSelect }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Provider ingestion</p><h2>Event audit</h2></div>
        <span className="audit-count">{data.metrics.ignoredEvents} ignored safely</span>
      </div>
      <div className="event-head"><span>Event</span><span>Return</span><span>Source</span><span>Occurred</span><span>Projection</span></div>
      <div className="event-list">
        {data.events.map((event) => {
          const item = data.returns.find((entry) => entry.id === event.returnId);
          return (
            <button key={event.id} className="event-row" onClick={() => onSelect(event.returnId)}>
              <span className="event-name"><i className={`event-dot event-${event.type.toLowerCase()}`} /><span><strong>{event.message}</strong><small>{event.type.replaceAll("_", " ")}</small></span></span>
              <span><strong>{item?.purchase.merchant}</strong><small>{item?.rma}</small></span>
              <span>{event.source}</span>
              <span>{timestamp(event.occurredAt)}</span>
              <span className={event.applied ? "projection applied" : "projection ignored"}>{event.applied ? <><Check size={13} />Applied</> : <><ShieldAlert size={13} />{event.ignoredReason?.replaceAll("_", " ")}</>}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Drawer({ item, onClose, onSimulate }) {
  const progress = item.expectedRefundCents ? Math.round(item.refundedCents / item.expectedRefundCents * 100) : 0;
  return (
    <aside className="drawer">
      <div className="drawer-heading">
        <div><p>{item.purchase.merchant} · {item.rma}</p><h2>{item.items[0]?.purchaseItem.name}</h2></div>
        <button className="icon-button" title="Close details" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="drawer-summary">
        <div><Status state={item.state} /><Sla sla={item.sla} /></div>
        <strong>{money(item.outstandingCents)} outstanding</strong>
        <span>{item.purchase.paymentMethod} · Order {item.purchase.orderNumber}</span>
        <div className="refund-progress"><i style={{ width: `${progress}%` }} /></div>
        <small>{money(item.refundedCents)} of {money(item.expectedRefundCents)} refunded</small>
      </div>
      <section className="drawer-section">
        <div className="section-title"><h3>Return items</h3><ReceiptText size={16} /></div>
        {item.items.map((line) => (
          <div className="line-item" key={line.itemId}>
            <div className="item-thumb"><Box size={18} /></div>
            <span><strong>{line.purchaseItem.name}</strong><small>{line.purchaseItem.sku} · Qty {line.quantity}</small></span>
            <strong>{money(line.expectedCents)}</strong>
          </div>
        ))}
        <div className="receipt-row"><FileText size={15} /><span>Receipt {item.purchase.orderNumber}</span><BadgeCheck size={15} /></div>
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Important dates</h3><Clock3 size={16} /></div>
        <dl className="dates">
          <div><dt>Purchased</dt><dd>{day(item.purchase.purchasedOn)}</dd></div>
          <div><dt>Return window</dt><dd>{day(item.returnWindowEndsOn)}</dd></div>
          <div><dt>Ship by</dt><dd>{day(item.shipBy)}</dd></div>
          <div><dt>Refund due</dt><dd>{day(item.refundDueOn)}</dd></div>
        </dl>
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Case timeline</h3><span>{item.events.length} events</span></div>
        <div className="timeline">
          {item.events.map((event, index) => (
            <div className={`timeline-item ${event.applied ? "" : "timeline-ignored"}`} key={event.id}>
              <div><i />{index < item.events.length - 1 && <span />}</div>
              <section><strong>{event.message}</strong><small>{timestamp(event.occurredAt)} · {event.source}{!event.applied ? ` · ${event.ignoredReason.toLowerCase().replaceAll("_", " ")}` : ""}</small></section>
            </div>
          ))}
        </div>
      </section>
      {!["REFUNDED", "REJECTED"].includes(item.state) && <button className="button drawer-action" onClick={() => onSimulate(item)}><Webhook size={16} /> Simulate provider event</button>}
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

function AddReturnModal({ data, onClose, onSave }) {
  const available = data.purchases.filter((purchase) => !data.returns.some((item) => item.purchaseId === purchase.id));
  const [purchaseId, setPurchaseId] = useState(available[0]?.id || data.purchases[0].id);
  const [reason, setReason] = useState("No longer needed");
  const purchase = data.purchases.find((item) => item.id === purchaseId);
  return (
    <Modal title="Start a return" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ purchaseId, reason, requestedAt: "2026-06-11T15:00:00Z", items: purchase.items.map((item) => ({ itemId: item.id, quantity: 1 })) }); }}>
        <label>Purchase<select value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)}>{available.map((item) => <option key={item.id} value={item.id}>{item.merchant} · {item.orderNumber}</option>)}</select></label>
        <div className="purchase-preview"><div className="merchant-mark">{purchase.merchant.slice(0, 2).toUpperCase()}</div><span><strong>{purchase.items.map((item) => item.name).join(", ")}</strong><small>{day(purchase.purchasedOn)} · {money(purchase.totalCents)}</small></span></div>
        <label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}><option>No longer needed</option><option>Wrong size</option><option>Damaged item</option><option>Not as described</option></select></label>
        <div className="modal-note"><ReceiptText size={17} /><span>All items in this purchase will be included in the demo return request.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button" type="submit"><RotateCcw size={16} /> Start return</button></div>
      </form>
    </Modal>
  );
}

function EventModal({ item, onClose, onSubmit }) {
  const refundReady = ["APPROVED", "REFUND_PENDING", "PARTIALLY_REFUNDED"].includes(item.state);
  const [source, setSource] = useState(refundReady ? "refund" : "merchant");
  const [status, setStatus] = useState(refundReady ? "REFUND_POSTED" : item.state === "IN_TRANSIT" ? "received" : "authorized");
  const [amount, setAmount] = useState((item.outstandingCents / 100).toFixed(2));
  const [occurredAt, setOccurredAt] = useState("2026-06-11T16:00");
  const [eventId, setEventId] = useState(`demo-${Date.now()}`);

  const submit = (event) => {
    event.preventDefault();
    const common = { eventId, returnId: item.id, occurredAt: new Date(`${occurredAt}:00Z`).toISOString() };
    if (source === "refund") {
      onSubmit("/api/webhooks/refund", { ...common, provider: "stripe", providerRefundId: `re_${eventId}`, amountCents: Math.round(Number(amount) * 100) });
    } else if (source === "carrier") {
      onSubmit("/api/webhooks/carrier", { ...common, carrier: item.carrier || "UPS", status, message: `Carrier reported ${status.toLowerCase().replaceAll("_", " ")}` });
    } else {
      onSubmit("/api/webhooks/merchant", { ...common, provider: item.purchase.merchant.toLowerCase().replaceAll(" ", "-"), status, message: `Merchant reported ${status.toLowerCase().replaceAll("_", " ")}` });
    }
  };

  return (
    <Modal title="Simulate provider event" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="purchase-preview"><div className="merchant-mark">{item.purchase.merchant.slice(0, 2).toUpperCase()}</div><span><strong>{item.items[0].purchaseItem.name}</strong><small>{item.rma} · {STATE_LABEL[item.state]}</small></span></div>
        <label>Event source<select value={source} onChange={(event) => { setSource(event.target.value); setStatus(event.target.value === "refund" ? "REFUND_POSTED" : event.target.value === "carrier" ? "DELIVERED" : "received"); }}><option value="merchant">Merchant</option><option value="carrier">Return carrier</option>{refundReady && <option value="refund">Payment provider</option>}</select></label>
        {source === "refund" ? (
          <label>Refund amount<input type="number" min="0.01" max={(item.outstandingCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        ) : source === "carrier" ? (
          <label>Carrier status<select value={status} onChange={(event) => setStatus(event.target.value)}><option>LABEL_CREATED</option><option>IN_TRANSIT</option><option>DELIVERED</option></select></label>
        ) : (
          <label>Merchant status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="authorized">Authorized</option><option value="label_issued">Label issued</option><option value="received">Received</option><option value="inspecting">Inspecting</option><option value="approved">Approved</option><option value="refund_pending">Refund pending</option><option value="rejected">Rejected</option></select></label>
        )}
        <div className="form-grid">
          <label>Occurred at<input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>
          <label>Event ID<input value={eventId} onChange={(event) => setEventId(event.target.value)} /></label>
        </div>
        <div className="modal-note"><ShieldAlert size={17} /><span>Reuse the event ID for deduplication, or set an earlier occurrence time to test stale-event protection.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button" type="submit"><Send size={16} /> Send event</button></div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [view, setView] = useState("returns");
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [snapshot, status] = await Promise.all([api(`/api/snapshot?asOf=${AS_OF}`), api("/api/health")]);
      setData(snapshot);
      setHealth(status);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  const selected = useMemo(() => data?.returns.find((item) => item.id === selectedId), [data, selectedId]);

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

  const simulate = (path, body) => mutate(path, body, (result) => result.duplicate ? "Duplicate provider event suppressed." : result.event?.applied === false ? `Event audited but ignored: ${result.event.ignoredReason.toLowerCase().replaceAll("_", " ")}.` : "Provider event applied and balances reconciled.");

  if (!data && loading) return <div className="loading-screen"><RefreshCw className="spin" size={23} /> Loading return operations</div>;
  if (!data) return <div className="loading-screen">Unable to load return data.</div>;

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div className="brand"><div className="brand-mark"><RotateCcw size={20} /></div><div><strong>ReturnDesk</strong><span>Returns and refunds</span></div><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <div className="workspace"><span>Workspace</span><div><Box size={16} /><strong>Personal purchases</strong></div><small>Receipts, returns, and payment reconciliation</small></div>
        <nav>
          {NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSidebarOpen(false); }}><Icon size={18} />{label}{id === "returns" && data.metrics.atRisk > 0 && <span>{data.metrics.atRisk}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-status"><Database size={18} /><div><strong>{health?.persistence === "postgres+redis" ? "Postgres + Redis" : "Memory fallback"}</strong><span>Ledger + dedupe + projections</span></div><i className={health?.persistence === "postgres+redis" ? "online" : ""} /></div>
          <button className="sidebar-action" onClick={() => mutate("/api/alerts/refresh", { asOf: AS_OF }, "SLA alerts recalculated.")}><RefreshCw size={16} /> Refresh deadlines</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main>
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div><p>Thursday, June 11 · Personal purchases</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div>
          <button className="button top-action" onClick={() => setModal({ type: "return" })}><Plus size={16} /> Start return</button>
        </header>
        <div className={`content ${loading ? "content-loading" : ""}`}>
          {view === "returns" && <ReturnQueue data={data} selectedId={selectedId} onSelect={setSelectedId} />}
          {view === "refunds" && <RefundLedger data={data} onSelect={setSelectedId} />}
          {view === "events" && <EventAudit data={data} onSelect={setSelectedId} />}
        </div>
      </main>

      {selected && <><button className="drawer-scrim" aria-label="Close return details" onClick={() => setSelectedId(null)} /><Drawer item={selected} onClose={() => setSelectedId(null)} onSimulate={(item) => setModal({ type: "event", item })} /></>}
      {modal?.type === "return" && <AddReturnModal data={data} onClose={() => setModal(null)} onSave={(form) => mutate("/api/returns", form, "Return request created and added to the queue.")} />}
      {modal?.type === "event" && <EventModal item={modal.item} onClose={() => setModal(null)} onSubmit={simulate} />}
      {notice && <div className="toast"><Activity size={17} />{notice}</div>}
    </div>
  );
}
