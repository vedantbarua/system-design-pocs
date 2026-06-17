import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  Check,
  ChevronRight,
  Cloud,
  Database,
  FileClock,
  FileText,
  FolderSync,
  HardDrive,
  History,
  Laptop,
  Menu,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
  type LucideIcon
} from "lucide-react";

type Device = { id: string; label: string; platform: string; status: "ONLINE" | "OFFLINE"; lastSeenAt: string };
type FileVersion = { id: string; deviceId: string; path: string; version: number; operation: "UPSERT" | "DELETE"; contentHash: string; sizeBytes: number; chunkHashes: string[]; modifiedAt: string; createdAt: string; supersededBy: string | null };
type Snapshot = { id: string; deviceId: string; label: string; fileVersionIds: string[]; totalBytes: number; uniqueBytes: number; createdAt: string };
type SyncJob = { id: string; kind: "UPLOAD_CHUNKS" | "RESTORE_SNAPSHOT" | "RETENTION_PRUNE"; status: "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD"; attempts: number; maxAttempts: number; payload: Record<string, unknown>; queuedAt: string; completedAt: string | null; lastError: string | null };
type Conflict = { id: string; path: string; leftVersionId: string; rightVersionId: string; status: "OPEN" | "RESOLVED"; detectedAt: string; resolution: string | null };
type Audit = { id: string; action: string; actor: string; details: Record<string, unknown>; at: string };

type BackupState = {
  quotaBytes: number;
  devices: Device[];
  chunks: Array<{ hash: string; sizeBytes: number; refCount: number; firstSeenAt: string }>;
  versions: FileVersion[];
  activeVersions: FileVersion[];
  snapshots: Snapshot[];
  jobs: SyncJob[];
  conflicts: Conflict[];
  audit: Audit[];
  metrics: {
    devices: number;
    onlineDevices: number;
    files: number;
    versions: number;
    chunks: number;
    usedBytes: number;
    quotaBytes: number;
    dedupeSavingsBytes: number;
    queuedJobs: number;
    openConflicts: number;
    snapshots: number;
  };
};

type Health = { status: string; persistence: string; kafka: string; postgres: string; redis: string; bufferedMessages: number };

const NAV = [
  { id: "overview", label: "Overview", icon: Cloud },
  { id: "files", label: "Files", icon: FileText },
  { id: "sync", label: "Sync queue", icon: FolderSync },
  { id: "snapshots", label: "Snapshots", icon: Save },
  { id: "audit", label: "Audit", icon: Activity }
] as const;

type View = (typeof NAV)[number]["id"];

const api = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Request failed");
  return json as T;
};

const bytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const formatTime = (value: string | null) =>
  value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(value)) : "never";

const titleCase = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());

function Status({ value }: { value: string }) {
  return <span className={`status status-${value.toLowerCase()}`}>{titleCase(value)}</span>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone: string }) {
  return <div className={`metric metric-${tone}`}><div className="metric-icon"><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function DeviceIcon({ platform }: { platform: string }) {
  const Icon = platform === "iOS" ? Smartphone : Laptop;
  return <Icon size={18} />;
}

function DeviceRow({ device }: { device: Device }) {
  return (
    <div className="device-row">
      <div className="device-icon"><DeviceIcon platform={device.platform} /></div>
      <div><strong>{device.label}</strong><span>{device.platform} / last seen {formatTime(device.lastSeenAt)}</span></div>
      <Status value={device.status} />
    </div>
  );
}

function FileRow({ version, device }: { version: FileVersion; device?: Device }) {
  return (
    <div className="file-row">
      <span><FileText size={16} /><strong>{version.path}</strong></span>
      <span>{device?.label || version.deviceId}</span>
      <span>v{version.version}</span>
      <span>{bytes(version.sizeBytes)}</span>
      <span>{version.chunkHashes.length} chunks</span>
      <span>{formatTime(version.modifiedAt)}</span>
    </div>
  );
}

function JobRow({ job }: { job: SyncJob }) {
  return (
    <div className="job-row">
      <span><FolderSync size={16} /><strong>{job.kind.replaceAll("_", " ")}</strong></span>
      <span>{job.attempts} / {job.maxAttempts}</span>
      <span>{formatTime(job.queuedAt)}</span>
      <Status value={job.status} />
      <span>{job.lastError || "ready"}</span>
    </div>
  );
}

function ConflictRow({ conflict, versions, onResolve }: { conflict: Conflict; versions: FileVersion[]; onResolve: (conflict: Conflict) => void }) {
  const right = versions.find((version) => version.id === conflict.rightVersionId);
  return (
    <div className="conflict-row">
      <span><AlertTriangle size={16} /><strong>{conflict.path}</strong></span>
      <span>{formatTime(conflict.detectedAt)}</span>
      <Status value={conflict.status} />
      {conflict.status === "OPEN" && right ? <button className="small-button" onClick={() => onResolve(conflict)}>Keep newest</button> : <ChevronRight size={16} />}
    </div>
  );
}

function Overview({ data, health, onDrain, onFail }: { data: BackupState; health: Health | null; onDrain: () => void; onFail: () => void }) {
  const usage = Math.round((data.metrics.usedBytes / data.metrics.quotaBytes) * 100);
  return (
    <>
      <section className="metrics-grid">
        <Metric icon={HardDrive} label="Storage used" value={bytes(data.metrics.usedBytes)} detail={`${usage}% of ${bytes(data.metrics.quotaBytes)} quota`} tone="blue" />
        <Metric icon={ShieldCheck} label="Dedupe savings" value={bytes(data.metrics.dedupeSavingsBytes)} detail={`${data.metrics.chunks} unique chunks`} tone="green" />
        <Metric icon={FolderSync} label="Queued jobs" value={data.metrics.queuedJobs} detail={`${data.jobs.length} total jobs`} tone="amber" />
        <Metric icon={AlertTriangle} label="Open conflicts" value={data.metrics.openConflicts} detail={`${data.metrics.snapshots} snapshots`} tone="red" />
      </section>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Active files</p><h2>Latest backed-up paths</h2></div><FileText size={18} /></div>
          {data.activeVersions.slice(0, 5).map((version) => <FileRow key={version.id} version={version} device={data.devices.find((device) => device.id === version.deviceId)} />)}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Sync controls</p><h2>Queue operations</h2></div><FolderSync size={18} /></div>
          <div className="control-stack">
            <button className="button" onClick={onDrain}><FolderSync size={16} /> Drain jobs</button>
            <button className="button secondary" onClick={onFail}><AlertTriangle size={16} /> Fail next job</button>
            <div className="infra-card"><Database size={18} /><span><strong>{health?.persistence || "memory"}</strong><small>Kafka {health?.kafka || "memory"} / {health?.bufferedMessages || 0} buffered changes</small></span></div>
          </div>
        </section>
      </div>
      <section className="panel devices-panel">
        <div className="panel-heading"><div><p className="eyebrow">Device inventory</p><h2>Backup clients</h2></div><Server size={18} /></div>
        <div className="devices-grid">{data.devices.map((device) => <DeviceRow key={device.id} device={device} />)}</div>
      </section>
    </>
  );
}

function FilesView({ data, onChange, onConflict, onPrune }: { data: BackupState; onChange: (kind: string) => void; onConflict: () => void; onPrune: () => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Change detector</p><h2>File events</h2></div>
        <div>
          <button className="button secondary" onClick={() => onChange("photo")}><FileClock size={16} /> New photo</button>
          <button className="button secondary" onClick={() => onChange("note")}><FileText size={16} /> Edit note</button>
          <button className="button secondary" onClick={onConflict}><AlertTriangle size={16} /> Create conflict</button>
          <button className="button" onClick={onPrune}><Trash2 size={16} /> Prune old</button>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="file-head"><span>Path</span><span>Device</span><span>Version</span><span>Size</span><span>Chunks</span><span>Modified</span></div>
        {data.versions.map((version) => <FileRow key={version.id} version={version} device={data.devices.find((device) => device.id === version.deviceId)} />)}
      </section>
    </>
  );
}

function SyncView({ data, health, onDrainKafka, onDrainJobs, onFail, onResolve, onReplay }: { data: BackupState; health: Health | null; onDrainKafka: () => void; onDrainJobs: () => void; onFail: () => void; onResolve: (conflict: Conflict) => void; onReplay: () => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Kafka and workers</p><h2>Sync pipeline</h2></div>
        <div>
          <button className="button secondary" onClick={onDrainKafka}><RadioTower size={16} /> Drain Kafka</button>
          <button className="button secondary" onClick={onReplay}><RefreshCw size={16} /> Replay changes</button>
          <button className="button secondary" onClick={onFail}><AlertTriangle size={16} /> Fail next</button>
          <button className="button" onClick={onDrainJobs}><FolderSync size={16} /> Drain jobs</button>
        </div>
      </section>
      <section className="metrics-grid">
        <Metric icon={RadioTower} label="Kafka mode" value={health?.kafka || "memory"} detail={`${health?.bufferedMessages || 0} buffered events`} tone="blue" />
        <Metric icon={Database} label="Postgres" value={health?.postgres || "memory"} detail="manifests and snapshots" tone="green" />
        <Metric icon={ArchiveRestore} label="Restore queue" value={data.jobs.filter((job) => job.kind === "RESTORE_SNAPSHOT").length} detail="snapshot restore jobs" tone="amber" />
        <Metric icon={AlertTriangle} label="Conflicts" value={data.metrics.openConflicts} detail="cross-device edits" tone="red" />
      </section>
      <div className="overview-grid">
        <section className="panel table-panel">
          <div className="job-head"><span>Job</span><span>Attempts</span><span>Queued</span><span>Status</span><span>Last error</span></div>
          {data.jobs.map((job) => <JobRow key={job.id} job={job} />)}
        </section>
        <section className="panel table-panel">
          <div className="conflict-head"><span>Conflict</span><span>Detected</span><span>Status</span><span /></div>
          {data.conflicts.map((conflict) => <ConflictRow key={conflict.id} conflict={conflict} versions={data.versions} onResolve={onResolve} />)}
        </section>
      </div>
    </>
  );
}

function SnapshotsView({ data, onSnapshot, onRestore }: { data: BackupState; onSnapshot: () => void; onRestore: (snapshot: Snapshot) => void }) {
  return (
    <>
      <section className="operations-toolbar">
        <div><p className="eyebrow">Point-in-time restore</p><h2>Snapshots</h2></div>
        <div><button className="button" onClick={onSnapshot}><Save size={16} /> Snapshot MacBook</button></div>
      </section>
      <section className="snapshot-grid">
        {data.snapshots.map((snapshot) => {
          const device = data.devices.find((item) => item.id === snapshot.deviceId);
          return (
            <div className="snapshot-card" key={snapshot.id}>
              <div><Status value="COMPLETED" /><h3>{snapshot.label}</h3><p>{device?.label || snapshot.deviceId} / {formatTime(snapshot.createdAt)}</p></div>
              <dl><div><dt>Files</dt><dd>{snapshot.fileVersionIds.length}</dd></div><div><dt>Total</dt><dd>{bytes(snapshot.totalBytes)}</dd></div><div><dt>Unique</dt><dd>{bytes(snapshot.uniqueBytes)}</dd></div></dl>
              <button className="button secondary" onClick={() => onRestore(snapshot)}><ArchiveRestore size={16} /> Restore to iPad</button>
            </div>
          );
        })}
      </section>
    </>
  );
}

function AuditView({ data }: { data: BackupState }) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="eyebrow">System history</p><h2>Audit log</h2></div><History size={18} /></div>
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
  const [data, setData] = useState<BackupState | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const recentAudit = useMemo(() => data?.audit.slice(0, 3) || [], [data]);

  const refresh = async () => {
    const [snapshot, healthStatus] = await Promise.all([api<BackupState>("/api/snapshot"), api<Health>("/api/health")]);
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

  if (!data) return <div className="loading"><RefreshCw className="spin" size={20} /> Loading backup sync</div>;

  const publishChange = (kind: string) => {
    const eventId = `${kind}-${crypto.randomUUID()}`;
    const body = kind === "photo"
      ? { eventId, deviceId: "device-iphone", path: `/Photos/trip/${eventId}.jpg`, content: "image-binary-cover-same-same-new-frame", modifiedAt: "2026-06-17T15:00:00Z" }
      : { eventId, deviceId: "device-macbook", path: "/Notes/ideas.md", content: `sync notes with reusable chunks ${eventId}`, modifiedAt: "2026-06-17T15:05:00Z" };
    return run(() => api("/api/changes/publish", { method: "POST", body: JSON.stringify(body) }), "Change event buffered");
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Cloud size={21} /></div><div><strong>VaultSync</strong><span>Personal backup sync</span></div><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="quota-card"><span>Quota</span><strong>{bytes(data.metrics.usedBytes)}</strong><small>{data.metrics.files} files / {data.metrics.chunks} chunks / {bytes(data.metrics.dedupeSavingsBytes)} saved</small></div>
        <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setSidebarOpen(false); }}><Icon size={17} /> {label}{id === "sync" && data.metrics.queuedJobs > 0 && <span>{data.metrics.queuedJobs}</span>}</button>)}</nav>
        <div className="sidebar-bottom">
          {recentAudit.map((event) => <div className="audit-pill" key={event.id}><Activity size={14} /><span><strong>{event.action.replaceAll("_", " ")}</strong><small>{formatTime(event.at)}</small></span></div>)}
          <div className="infra"><Database size={17} /><span><strong>{health?.persistence || "memory"}</strong><small>Kafka {health?.kafka || "memory"}</small></span><i className={health?.status === "ok" ? "online" : ""} /></div>
          <button className="reset-button" onClick={() => run(() => api("/api/reset", { method: "POST" }), "Demo reset")}><RotateCcw size={15} /> Reset demo</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <main>
        <header className="topbar"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><p>Wednesday, June 17</p><h1>{NAV.find((item) => item.id === view)?.label}</h1></div><div className="top-status"><RadioTower size={15} /><span><strong>{health?.bufferedMessages || 0} buffered changes</strong><small>{data.metrics.queuedJobs} jobs waiting</small></span></div></header>
        <div className={`content ${busy ? "content-busy" : ""}`}>
          {view === "overview" && <Overview data={data} health={health} onDrain={() => run(() => api("/api/jobs/drain?max=50", { method: "POST" }), "Jobs drained")} onFail={() => run(() => api("/api/jobs/fail-next", { method: "POST" }), "Next job will retry")} />}
          {view === "files" && <FilesView data={data} onChange={publishChange} onConflict={() => run(() => api("/api/changes/publish", { method: "POST", body: JSON.stringify({ eventId: `conflict-${crypto.randomUUID()}`, deviceId: "device-iphone", path: "/Documents/budget.xlsx", content: "iphone budget edit conflict", modifiedAt: "2026-06-17T15:10:00Z" }) }), "Conflict change buffered")} onPrune={() => run(() => api("/api/retention/prune", { method: "POST", body: JSON.stringify({ keepPerPath: 2 }) }), "Retention prune complete")} />}
          {view === "sync" && <SyncView data={data} health={health} onDrainKafka={() => run(() => api("/api/kafka/drain", { method: "POST" }), "Memory Kafka drained")} onDrainJobs={() => run(() => api("/api/jobs/drain?max=50", { method: "POST" }), "Jobs drained")} onFail={() => run(() => api("/api/jobs/fail-next", { method: "POST" }), "Next job will retry")} onReplay={() => run(() => api("/api/replay", { method: "POST", body: JSON.stringify({ from: "2026-06-17T00:00:00Z", to: "2026-06-18T00:00:00Z" }) }), "Changes replayed")} onResolve={(conflict) => run(() => api(`/api/conflicts/${conflict.id}/resolve`, { method: "POST", body: JSON.stringify({ winningVersionId: conflict.rightVersionId }) }), "Conflict resolved")} />}
          {view === "snapshots" && <SnapshotsView data={data} onSnapshot={() => run(() => api("/api/snapshots", { method: "POST", body: JSON.stringify({ deviceId: "device-macbook", label: "Manual MacBook snapshot" }) }), "Snapshot created")} onRestore={(snapshot) => run(() => api(`/api/snapshots/${snapshot.id}/restore`, { method: "POST", body: JSON.stringify({ targetDeviceId: "device-ipad" }) }), "Restore job queued")} />}
          {view === "audit" && <AuditView data={data} />}
        </div>
      </main>
      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
    </div>
  );
}
