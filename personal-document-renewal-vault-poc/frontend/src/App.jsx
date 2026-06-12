import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  BadgeCheck,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  CloudUpload,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileClock,
  FileKey2,
  FileText,
  Fingerprint,
  FolderLock,
  History,
  Home,
  KeyRound,
  Menu,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserRoundCog,
  Users,
  X
} from "lucide-react";

const AS_OF = "2026-06-12";
const ACTOR = "user-vedant";
const NAV = [
  { id: "documents", label: "Documents", icon: FolderLock },
  { id: "processing", label: "Processing", icon: ScanSearch },
  { id: "audit", label: "Audit history", icon: Activity }
];

const STATE_LABELS = {
  UPLOADED: "Uploaded",
  SCANNING: "Scanning",
  READY: "Ready",
  EXPIRING: "Expiring",
  EXPIRED: "Expired",
  RENEWED: "Renewed",
  QUARANTINED: "Quarantined"
};

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
        new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
      )
    : "No expiry";

const formatTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Chicago"
      }).format(new Date(value))
    : "Pending";

const formatBytes = (bytes = 0) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) throw new Error(body.detail || body.error || "Request failed");
  return body;
}

function StatePill({ state }) {
  return <span className={`state state-${state.toLowerCase()}`}>{STATE_LABELS[state] || state}</span>;
}

function Metric({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-icon"><Icon size={19} /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function DocumentRow({ document, selected, onSelect }) {
  const current = document.versions[0];
  return (
    <button className={`document-row ${selected ? "selected" : ""}`} onClick={() => onSelect(document.id)}>
      <div className={`file-icon file-${document.category.toLowerCase()}`}><FileText size={19} /></div>
      <div className="document-main">
        <div><strong>{document.title}</strong><StatePill state={document.state} /></div>
        <span>{document.issuer || document.category} · {document.document_number_masked || "Number not recorded"}</span>
      </div>
      <div className="document-owner">
        <strong>{document.owner.name}</strong>
        <span>{document.category}</span>
      </div>
      <div className="document-expiry">
        <strong>{formatDate(document.expires_on)}</strong>
        <span>
          {document.days_until_expiry === null
            ? "No renewal required"
            : document.days_until_expiry < 0
              ? `${Math.abs(document.days_until_expiry)} days overdue`
              : `${document.days_until_expiry} days remaining`}
        </span>
      </div>
      <div className="document-version">
        <strong>v{current?.version || 0}</strong>
        <span>{current?.scan_status || "Pending"}</span>
      </div>
      <ChevronRight size={17} />
    </button>
  );
}

function DocumentsView({ data, selectedId, onSelect }) {
  const [filter, setFilter] = useState("ACTIVE");
  const documents = data.documents.filter((document) => {
    if (filter === "ALL") return true;
    if (filter === "ATTENTION") return ["EXPIRING", "EXPIRED", "QUARANTINED"].includes(document.state);
    if (filter === "READY") return document.state === "READY";
    return document.state !== "RENEWED";
  });

  return (
    <>
      <section className="metrics-grid">
        <Metric icon={FileKey2} label="Documents" value={data.metrics.documents} detail="Across five categories" tone="blue" />
        <Metric icon={FileClock} label="Expiring soon" value={data.metrics.expiring} detail="Inside renewal window" tone="amber" />
        <Metric icon={AlertTriangle} label="Expired" value={data.metrics.expired} detail="Renewal required" tone="red" />
        <Metric icon={Bell} label="Reminders" value={data.metrics.pending_reminders} detail="Queued for delivery" tone="green" />
      </section>

      <section className="panel inventory-panel">
        <div className="panel-heading inventory-heading">
          <div><p className="eyebrow">Encrypted inventory</p><h2>Household documents</h2></div>
          <div className="segmented">
            {["ACTIVE", "ALL", "ATTENTION", "READY"].map((value) => (
              <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="document-columns"><span>Document</span><span>Owner</span><span>Expiration</span><span>Version</span><span /></div>
        <div>{documents.map((document) => <DocumentRow key={document.id} document={document} selected={selectedId === document.id} onSelect={onSelect} />)}</div>
      </section>

      <div className="lower-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Renewal queue</p><h2>Needs attention</h2></div><Clock3 size={19} /></div>
          <div className="attention-list">
            {data.documents.filter((item) => ["EXPIRING", "EXPIRED"].includes(item.state)).map((document) => (
              <button key={document.id} onClick={() => onSelect(document.id)}>
                <div className={`attention-icon attention-${document.state.toLowerCase()}`}><FileClock size={17} /></div>
                <span><strong>{document.title}</strong><small>{document.state === "EXPIRED" ? "Expired" : "Expires"} {formatDate(document.expires_on)}</small></span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Security posture</p><h2>Vault operations</h2></div><ShieldCheck size={19} /></div>
          <div className="security-grid">
            <div><span>Clean versions</span><strong>{data.documents.flatMap((item) => item.versions).filter((item) => item.scan_status === "CLEAN").length}</strong></div>
            <div><span>Pending jobs</span><strong>{data.metrics.pending_jobs}</strong></div>
            <div><span>Downloads</span><strong>{data.metrics.downloads}</strong></div>
            <div><span>Quarantined</span><strong>{data.metrics.quarantined}</strong></div>
          </div>
        </section>
      </div>
    </>
  );
}

function ProcessingView({ data, onRunWorkers }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Asynchronous pipeline</p><h2>Scan and OCR jobs</h2></div>
        <button className="button secondary" onClick={onRunWorkers}><RefreshCw size={16} /> Drain workers</button>
      </div>
      <div className="job-head"><span>Job</span><span>Document</span><span>Attempts</span><span>Created</span><span>Status</span></div>
      <div className="job-list">
        {data.jobs.length ? data.jobs.map((job) => {
          const document = data.documents.find((item) => item.id === job.document_id);
          return (
            <div className="job-row" key={job.id}>
              <span className="job-name">{job.kind === "VIRUS_SCAN" ? <ShieldCheck size={17} /> : <ScanSearch size={17} />}<span><strong>{job.kind.replaceAll("_", " ")}</strong><small>{job.id}</small></span></span>
              <span><strong>{document?.title || job.document_id}</strong><small>{job.version_id}</small></span>
              <span>{job.attempts}</span>
              <span>{formatTime(job.created_at)}</span>
              <span className={`job-status job-${job.status.toLowerCase()}`}>{job.status}</span>
            </div>
          );
        }) : <div className="empty-state"><BadgeCheck size={24} /><strong>No processing jobs</strong><span>Uploads will create virus scan and OCR work.</span></div>}
      </div>
    </section>
  );
}

function AuditView({ data, onSelect }) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Immutable activity</p><h2>Access and lifecycle audit</h2></div>
        <span className="audit-total">{data.audit.length} recent events</span>
      </div>
      <div className="audit-head"><span>Action</span><span>Document</span><span>Actor</span><span>Time</span><span>Details</span></div>
      <div className="audit-list">
        {data.audit.map((event) => {
          const document = data.documents.find((item) => item.id === event.document_id);
          return (
            <button className="audit-row" key={event.id} onClick={() => document && onSelect(document.id)}>
              <span className="audit-action"><Activity size={16} /><strong>{event.action.replaceAll("_", " ")}</strong></span>
              <span>{document?.title || "Vault-wide event"}</span>
              <span>{event.actor_id}</span>
              <span>{formatTime(event.at)}</span>
              <span>{Object.entries(event.details || {}).map(([key, value]) => `${key}: ${value}`).join(" · ") || "—"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Drawer({ document, members, onClose, onDownload, onRenew, onUploadVersion, onShare }) {
  return (
    <aside className="drawer">
      <div className="drawer-heading">
        <div><p>{document.category} · {document.document_number_masked}</p><h2>{document.title}</h2></div>
        <button className="icon-button" title="Close details" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="drawer-summary">
        <div><StatePill state={document.state} /><span className="owner-pill">{document.owner.name}</span></div>
        <strong>{formatDate(document.expires_on)}</strong>
        <span>{document.issuer || "Issuer not recorded"} · {document.days_until_expiry === null ? "No expiry" : `${document.days_until_expiry} days remaining`}</span>
        <div className="drawer-actions">
          <button className="button" disabled={document.state === "QUARANTINED"} onClick={() => onDownload(document)}><Download size={16} /> Download</button>
          <button className="icon-button" title="Upload new version" onClick={() => onUploadVersion(document)}><Upload size={17} /></button>
          <button className="icon-button" title="Manage access" onClick={() => onShare(document)}><UserRoundCog size={17} /></button>
        </div>
      </div>
      <section className="drawer-section">
        <div className="section-title"><h3>Version history</h3><History size={16} /></div>
        <div className="version-list">
          {document.versions.map((version) => (
            <div className="version-row" key={version.id}>
              <div className={`version-icon scan-${version.scan_status.toLowerCase()}`}>{version.scan_status === "CLEAN" ? <FileCheck2 size={17} /> : <ShieldAlert size={17} />}</div>
              <span><strong>Version {version.version} · {version.filename}</strong><small>{formatBytes(version.size_bytes)} · {formatTime(version.created_at)}</small></span>
              <span><strong>{version.scan_status}</strong><small>OCR {version.ocr_status}</small></span>
            </div>
          ))}
        </div>
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Document metadata</h3><Fingerprint size={16} /></div>
        <dl className="metadata">
          <div><dt>Owner</dt><dd>{document.owner.name}</dd></div>
          <div><dt>Issued</dt><dd>{formatDate(document.issued_on)}</dd></div>
          <div><dt>Reminder</dt><dd>{document.reminder_days} days before</dd></div>
          <div><dt>Tags</dt><dd>{document.tags.join(", ") || "None"}</dd></div>
        </dl>
      </section>
      <section className="drawer-section">
        <div className="section-title"><h3>Recent document activity</h3><Activity size={16} /></div>
        <div className="mini-audit">
          {document.audit.slice(0, 5).map((event) => (
            <div key={event.id}><i /><span><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.actor_id} · {formatTime(event.at)}</small></span></div>
          ))}
        </div>
      </section>
      {["EXPIRING", "EXPIRED"].includes(document.state) && <button className="button drawer-renew" onClick={() => onRenew(document)}><RotateCcw size={16} /> Start renewal</button>}
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

function UploadModal({ document, onClose, onUpload }) {
  const [form, setForm] = useState({
    title: document?.title || "",
    category: document?.category || "Identity",
    issuer: document?.issuer || "",
    document_number_masked: document?.document_number_masked || "",
    expires_on: document?.expires_on || "2027-06-12",
    filename: document ? `${document.title.toLowerCase().replaceAll(" ", "-")}-new.pdf` : "new-document.pdf",
    content: "Protected demo document content",
    simulate_malware: false
  });
  return (
    <Modal title={document ? "Upload new version" : "Add document"} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onUpload(form, document?.id); }}>
        {!document && <div className="form-grid"><label>Title<input required autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Identity</option><option>Insurance</option><option>Housing</option><option>Certificate</option><option>Medical</option><option>Other</option></select></label></div>}
        <div className="form-grid"><label>Issuer<input value={form.issuer} onChange={(event) => setForm({ ...form, issuer: event.target.value })} /></label><label>Masked number<input value={form.document_number_masked} onChange={(event) => setForm({ ...form, document_number_masked: event.target.value })} placeholder="•••• 1234" /></label></div>
        <div className="form-grid"><label>Expiration date<input type="date" value={form.expires_on} onChange={(event) => setForm({ ...form, expires_on: event.target.value })} /></label><label>Filename<input required value={form.filename} onChange={(event) => setForm({ ...form, filename: event.target.value })} /></label></div>
        <label>Demo file content<input required value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label>
        <label className="checkbox-row"><input type="checkbox" checked={form.simulate_malware} onChange={(event) => setForm({ ...form, simulate_malware: event.target.checked })} /><span>Simulate malware detection</span></label>
        <div className="modal-note"><ShieldCheck size={17} /><span>The API creates a ten-minute upload grant, stores a new immutable version, then queues virus scan and OCR jobs.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button" type="submit"><CloudUpload size={16} /> Upload document</button></div>
      </form>
    </Modal>
  );
}

function RenewModal({ document, onClose, onRenew }) {
  const [expiresOn, setExpiresOn] = useState("2030-07-03");
  return (
    <Modal title={`Renew ${document.title}`} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onRenew({ expires_on: expiresOn, filename: `${document.title.toLowerCase().replaceAll(" ", "-")}-renewed.pdf` }); }}>
        <div className="renew-context"><div className="file-icon"><FileText size={19} /></div><span><strong>{document.title}</strong><small>Current expiry {formatDate(document.expires_on)}</small></span></div>
        <label>Replacement expiration date<input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
        <div className="modal-note"><RotateCcw size={17} /><span>The original record will remain in history as renewed and link to a new replacement document.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button" type="submit"><RotateCcw size={16} /> Create renewal</button></div>
      </form>
    </Modal>
  );
}

function ShareModal({ document, members, onClose, onShare }) {
  const candidates = members.filter((member) => member.user_id !== ACTOR);
  const [userId, setUserId] = useState(candidates[0]?.user_id || "");
  const [role, setRole] = useState("VIEWER");
  return (
    <Modal title="Manage household access" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onShare({ user_id: userId, role }); }}>
        <div className="renew-context"><Users size={21} /><span><strong>{document.title}</strong><small>Household access policy</small></span></div>
        <div className="form-grid"><label>Member<select value={userId} onChange={(event) => setUserId(event.target.value)}>{candidates.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value)}><option>VIEWER</option><option>EDITOR</option></select></label></div>
        <div className="modal-note"><KeyRound size={17} /><span>Viewers can request audited downloads. Editors can also upload document versions.</span></div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button" type="submit"><UserRoundCog size={16} /> Update access</button></div>
      </form>
    </Modal>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [view, setView] = useState("documents");
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [snapshot, status] = await Promise.all([
        api(`/api/snapshot?household_id=household-maple&actor_id=${ACTOR}&as_of=${AS_OF}`),
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
  const selected = useMemo(() => data?.documents.find((item) => item.id === selectedId), [data, selectedId]);

  const announce = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3600);
  };

  const upload = async (form, documentId) => {
    try {
      const grant = await api("/api/uploads/request", {
        method: "POST",
        body: JSON.stringify({
          actor_id: ACTOR,
          household_id: "household-maple",
          title: form.title,
          category: form.category,
          filename: form.filename,
          content_type: "application/pdf",
          expires_on: form.expires_on || null,
          issuer: form.issuer,
          document_number_masked: form.document_number_masked,
          document_id: documentId || null
        })
      });
      await api(grant.upload_url, {
        method: "PUT",
        body: JSON.stringify({ content: form.content, simulate_malware: form.simulate_malware })
      });
      setModal(null);
      announce("Upload completed; scan and OCR jobs queued.");
      await load();
    } catch (error) {
      announce(error.message);
    }
  };

  const download = async (document) => {
    try {
      const grant = await api(`/api/documents/${document.id}/downloads`, {
        method: "POST",
        body: JSON.stringify({ actor_id: ACTOR })
      });
      const blob = await api(grant.download_url);
      announce(`Audited download ready: ${formatBytes(blob.size)}.`);
      await load();
    } catch (error) {
      announce(error.message);
    }
  };

  const runWorkers = async () => {
    const result = await api("/api/workers/drain?max_jobs=20", { method: "POST", body: "{}" });
    announce(`${result.processed} scan/OCR jobs processed.`);
    await load();
  };

  const renew = async (document, form) => {
    const grant = await api(`/api/documents/${document.id}/renew`, {
      method: "POST",
      body: JSON.stringify({ actor_id: ACTOR, title: document.title, ...form })
    });
    await api(grant.upload_url, {
      method: "PUT",
      body: JSON.stringify({ content: "Renewed protected document content", simulate_malware: false })
    });
    setModal(null);
    announce("Renewal record created; replacement is scanning.");
    await load();
  };

  const share = async (document, form) => {
    await api(`/api/documents/${document.id}/share`, {
      method: "POST",
      body: JSON.stringify({ actor_id: ACTOR, ...form })
    });
    setModal(null);
    announce("Household access updated and audited.");
    await load();
  };

  if (!data && loading) return <div className="loading-screen"><RefreshCw className="spin" size={23} /> Opening secure vault</div>;
  if (!data) return <div className="loading-screen">Unable to load document vault.</div>;

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div className="brand"><div className="brand-mark"><FolderLock size={20} /></div><div><strong>Vaultline</strong><span>Personal documents</span></div><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <div className="household"><span>Household</span><div><Home size={16} /><strong>{data.household.name}</strong></div><small>{data.members.length} members · Role-based access</small></div>
        <nav>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSidebarOpen(false); }}>
              <Icon size={18} />{label}{id === "processing" && data.metrics.pending_jobs > 0 && <span>{data.metrics.pending_jobs}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-status"><Database size={18} /><div><strong>{health?.persistence === "postgres+redis+minio" ? "Infrastructure connected" : "Memory fallback"}</strong><span>Metadata + queue + objects</span></div><i className={health?.persistence === "postgres+redis+minio" ? "online" : ""} /></div>
          <button className="sidebar-action" onClick={runWorkers}><ScanSearch size={16} /> Run processing</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main>
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div><p>{data.household.name} · Friday, June 12</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div>
          <button className="button top-action" onClick={() => setModal({ type: "upload" })}><CloudUpload size={16} /> Add document</button>
        </header>
        <div className={`content ${loading ? "content-loading" : ""}`}>
          {view === "documents" && <DocumentsView data={data} selectedId={selectedId} onSelect={setSelectedId} />}
          {view === "processing" && <ProcessingView data={data} onRunWorkers={runWorkers} />}
          {view === "audit" && <AuditView data={data} onSelect={setSelectedId} />}
        </div>
      </main>

      {selected && <><button className="drawer-scrim" aria-label="Close document details" onClick={() => setSelectedId(null)} /><Drawer document={selected} members={data.members} onClose={() => setSelectedId(null)} onDownload={download} onRenew={(document) => setModal({ type: "renew", document })} onUploadVersion={(document) => setModal({ type: "upload", document })} onShare={(document) => setModal({ type: "share", document })} /></>}
      {modal?.type === "upload" && <UploadModal document={modal.document} onClose={() => setModal(null)} onUpload={upload} />}
      {modal?.type === "renew" && <RenewModal document={modal.document} onClose={() => setModal(null)} onRenew={(form) => renew(modal.document, form)} />}
      {modal?.type === "share" && <ShareModal document={modal.document} members={data.members} onClose={() => setModal(null)} onShare={(form) => share(modal.document, form)} />}
      {notice && <div className="toast"><Activity size={17} />{notice}</div>}
    </div>
  );
}
