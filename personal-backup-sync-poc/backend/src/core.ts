import crypto from "node:crypto";

export type DeviceStatus = "ONLINE" | "OFFLINE";
export type FileOperation = "UPSERT" | "DELETE";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";
export type ConflictStatus = "OPEN" | "RESOLVED";
export type EventSource = "seed" | "api" | "kafka" | "replay";

export type BackupDevice = {
  id: string;
  label: string;
  platform: string;
  status: DeviceStatus;
  lastSeenAt: string;
};

export type ChunkObject = {
  hash: string;
  sizeBytes: number;
  refCount: number;
  firstSeenAt: string;
};

export type FileVersion = {
  id: string;
  deviceId: string;
  path: string;
  version: number;
  operation: FileOperation;
  contentHash: string;
  sizeBytes: number;
  chunkHashes: string[];
  modifiedAt: string;
  createdAt: string;
  supersededBy: string | null;
};

export type BackupSnapshot = {
  id: string;
  deviceId: string;
  label: string;
  fileVersionIds: string[];
  totalBytes: number;
  uniqueBytes: number;
  createdAt: string;
};

export type SyncJob = {
  id: string;
  kind: "UPLOAD_CHUNKS" | "RESTORE_SNAPSHOT" | "RETENTION_PRUNE";
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  dedupeKey: string;
  payload: Record<string, string | number | boolean | string[]>;
  queuedAt: string;
  completedAt: string | null;
  lastError: string | null;
};

export type Conflict = {
  id: string;
  path: string;
  leftVersionId: string;
  rightVersionId: string;
  status: ConflictStatus;
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
};

export type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  at: string;
};

export type FileChangeInput = {
  eventId?: string;
  deviceId: string;
  path: string;
  content?: string;
  operation?: FileOperation;
  modifiedAt?: string;
  source?: EventSource;
};

export function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function iso(value: string | number | Date = new Date()): string {
  const parsed = new Date(value);
  assertCondition(!Number.isNaN(parsed.getTime()), "invalid timestamp");
  return parsed.toISOString();
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function eventKey(input: FileChangeInput): string {
  return input.eventId ? `${input.deviceId}:${input.eventId}` : `${input.deviceId}:${input.path}:${iso(input.modifiedAt || new Date())}`;
}

function chunkContent(content: string, size = 10): Array<{ hash: string; sizeBytes: number }> {
  if (content.length === 0) return [];
  const chunks = [];
  for (let index = 0; index < content.length; index += size) {
    const slice = content.slice(index, index + size);
    chunks.push({ hash: sha256(slice), sizeBytes: Buffer.byteLength(slice) });
  }
  return chunks;
}

export class PersonalBackupSync {
  quotaBytes = 250_000;
  devices: BackupDevice[] = [];
  chunks: ChunkObject[] = [];
  versions: FileVersion[] = [];
  snapshots: BackupSnapshot[] = [];
  jobs: SyncJob[] = [];
  conflicts: Conflict[] = [];
  audit: AuditEvent[] = [];
  processedEvents = new Set<string>();
  failNextJob = false;

  seed(): void {
    this.devices = [
      { id: "device-macbook", label: "MacBook Pro", platform: "macOS", status: "ONLINE", lastSeenAt: "2026-06-17T13:00:00.000Z" },
      { id: "device-iphone", label: "iPhone", platform: "iOS", status: "ONLINE", lastSeenAt: "2026-06-17T13:00:00.000Z" },
      { id: "device-ipad", label: "iPad", platform: "iPadOS", status: "OFFLINE", lastSeenAt: "2026-06-16T23:30:00.000Z" }
    ];
    this.chunks = [];
    this.versions = [];
    this.snapshots = [];
    this.jobs = [];
    this.conflicts = [];
    this.audit = [];
    this.processedEvents = new Set();
    this.failNextJob = false;
    this.ingestChange({ eventId: "seed-budget", deviceId: "device-macbook", path: "/Documents/budget.xlsx", content: "household budget 2026 shared", modifiedAt: "2026-06-17T12:00:00Z", source: "seed" });
    this.ingestChange({ eventId: "seed-photos", deviceId: "device-iphone", path: "/Photos/trip/cover.jpg", content: "image-binary-cover-same-same", modifiedAt: "2026-06-17T12:10:00Z", source: "seed" });
    this.ingestChange({ eventId: "seed-notes", deviceId: "device-macbook", path: "/Notes/ideas.md", content: "sync notes with reusable chunks", modifiedAt: "2026-06-17T12:20:00Z", source: "seed" });
    this.drainJobs();
    this.createSnapshot("device-macbook", "MacBook noon backup");
    this.createAudit("DEMO_SEEDED", "system", { devices: this.devices.length, chunks: this.chunks.length });
  }

  device(deviceId: string): BackupDevice {
    const device = this.devices.find((item) => item.id === deviceId);
    assertCondition(device, "device not found");
    return device;
  }

  createAudit(action: string, actor: string, details: Record<string, unknown>): AuditEvent {
    const audit = { id: id("audit"), action, actor, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  activeVersions(deviceId?: string): FileVersion[] {
    return this.versions
      .filter((version) => !version.supersededBy && version.operation !== "DELETE" && (!deviceId || version.deviceId === deviceId))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  latestForPath(deviceId: string, path: string): FileVersion | null {
    return this.versions
      .filter((version) => version.deviceId === deviceId && version.path === path)
      .sort((a, b) => b.version - a.version)[0] || null;
  }

  ingestChange(input: FileChangeInput): { duplicate: boolean; version?: FileVersion; chunksAdded: number; chunksReused: number; conflicts: number } {
    assertCondition(input.deviceId, "device id is required");
    assertCondition(input.path?.startsWith("/"), "path must be absolute");
    const device = this.device(input.deviceId);
    const key = eventKey(input);
    if (this.processedEvents.has(key)) return { duplicate: true, chunksAdded: 0, chunksReused: 0, conflicts: 0 };
    const operation = input.operation || "UPSERT";
    assertCondition(operation === "DELETE" || input.content !== undefined, "content is required for upsert");
    const modifiedAt = iso(input.modifiedAt || new Date());
    const previous = this.latestForPath(device.id, input.path);
    if (previous && !previous.supersededBy) previous.supersededBy = "pending";
    const chunkParts = operation === "DELETE" ? [] : chunkContent(input.content || "");
    let chunksAdded = 0;
    let chunksReused = 0;
    for (const chunk of chunkParts) {
      const existing = this.chunks.find((item) => item.hash === chunk.hash);
      if (existing) {
        existing.refCount += 1;
        chunksReused += 1;
      } else {
        this.chunks.push({ hash: chunk.hash, sizeBytes: chunk.sizeBytes, refCount: 1, firstSeenAt: iso() });
        chunksAdded += 1;
      }
    }
    const version: FileVersion = {
      id: id("version"),
      deviceId: device.id,
      path: input.path,
      version: (previous?.version || 0) + 1,
      operation,
      contentHash: operation === "DELETE" ? "deleted" : sha256(input.content || ""),
      sizeBytes: operation === "DELETE" ? 0 : Buffer.byteLength(input.content || ""),
      chunkHashes: chunkParts.map((chunk) => chunk.hash),
      modifiedAt,
      createdAt: iso(),
      supersededBy: null
    };
    if (previous && previous.supersededBy === "pending") previous.supersededBy = version.id;
    this.versions.push(version);
    this.processedEvents.add(key);
    device.status = "ONLINE";
    device.lastSeenAt = modifiedAt;
    const conflicts = operation === "UPSERT" ? this.detectConflicts(version) : 0;
    this.ensureJob("UPLOAD_CHUNKS", `${version.id}:upload`, { versionId: version.id, chunkHashes: version.chunkHashes, bytes: version.sizeBytes });
    this.createAudit(operation === "DELETE" ? "FILE_DELETED" : "FILE_VERSIONED", "sync-ingest", { deviceId: device.id, path: input.path, version: version.version, chunksAdded, chunksReused });
    return { duplicate: false, version, chunksAdded, chunksReused, conflicts };
  }

  detectConflicts(version: FileVersion): number {
    const candidates = this.activeVersions().filter((item) => item.path === version.path && item.deviceId !== version.deviceId && item.contentHash !== version.contentHash);
    let created = 0;
    for (const other of candidates) {
      const already = this.conflicts.some((conflict) => conflict.status === "OPEN" && new Set([conflict.leftVersionId, conflict.rightVersionId]).has(version.id) && new Set([conflict.leftVersionId, conflict.rightVersionId]).has(other.id));
      if (already) continue;
      this.conflicts.unshift({ id: id("conflict"), path: version.path, leftVersionId: other.id, rightVersionId: version.id, status: "OPEN", detectedAt: iso(), resolvedAt: null, resolution: null });
      created += 1;
    }
    if (created) this.createAudit("CONFLICT_DETECTED", "conflict-detector", { path: version.path, conflicts: created });
    return created;
  }

  ensureJob(kind: SyncJob["kind"], dedupeKey: string, payload: SyncJob["payload"]): SyncJob {
    const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey);
    if (existing) return existing;
    const job: SyncJob = { id: id("job"), kind, status: "QUEUED", attempts: 0, maxAttempts: 3, dedupeKey, payload, queuedAt: iso(), completedAt: null, lastError: null };
    this.jobs.unshift(job);
    return job;
  }

  dispatchNextJob(): { processed: boolean; job?: SyncJob } {
    const job = this.jobs.find((item) => item.status === "QUEUED" || item.status === "RETRY");
    if (!job) return { processed: false };
    job.status = "RUNNING";
    job.attempts += 1;
    if (this.failNextJob) {
      this.failNextJob = false;
      job.lastError = "simulated storage timeout";
      job.status = job.attempts >= job.maxAttempts ? "DEAD" : "RETRY";
      this.createAudit("JOB_RETRY", "worker:sync", { jobId: job.id, kind: job.kind, attempts: job.attempts });
      return { processed: true, job };
    }
    job.status = "COMPLETED";
    job.completedAt = iso();
    job.lastError = null;
    this.createAudit("JOB_COMPLETED", "worker:sync", { jobId: job.id, kind: job.kind });
    return { processed: true, job };
  }

  drainJobs(max = 50): { processed: number; completed: number } {
    let processed = 0;
    let completed = 0;
    while (processed < max) {
      const result = this.dispatchNextJob();
      if (!result.processed || !result.job) break;
      processed += 1;
      if (result.job.status === "COMPLETED") completed += 1;
    }
    return { processed, completed };
  }

  createSnapshot(deviceId: string, label: string): BackupSnapshot {
    const device = this.device(deviceId);
    const versions = this.activeVersions(device.id);
    const unique = new Set(versions.flatMap((version) => version.chunkHashes));
    const uniqueBytes = [...unique].reduce((total, hash) => total + (this.chunks.find((chunk) => chunk.hash === hash)?.sizeBytes || 0), 0);
    const snapshot: BackupSnapshot = { id: id("snapshot"), deviceId: device.id, label, fileVersionIds: versions.map((version) => version.id), totalBytes: versions.reduce((total, version) => total + version.sizeBytes, 0), uniqueBytes, createdAt: iso() };
    this.snapshots.unshift(snapshot);
    this.createAudit("SNAPSHOT_CREATED", "snapshotter", { snapshotId: snapshot.id, deviceId, files: versions.length });
    return snapshot;
  }

  restoreSnapshot(snapshotId: string, targetDeviceId: string): SyncJob {
    const snapshot = this.snapshots.find((item) => item.id === snapshotId);
    assertCondition(snapshot, "snapshot not found");
    this.device(targetDeviceId);
    const job = this.ensureJob("RESTORE_SNAPSHOT", `${snapshot.id}:${targetDeviceId}:restore`, { snapshotId, targetDeviceId, fileVersionIds: snapshot.fileVersionIds });
    this.createAudit("RESTORE_QUEUED", "restore-api", { snapshotId, targetDeviceId, jobId: job.id });
    return job;
  }

  resolveConflict(conflictId: string, winningVersionId: string, actor = "user"): Conflict {
    const conflict = this.conflicts.find((item) => item.id === conflictId);
    assertCondition(conflict, "conflict not found");
    assertCondition([conflict.leftVersionId, conflict.rightVersionId].includes(winningVersionId), "winner must be one side of the conflict");
    conflict.status = "RESOLVED";
    conflict.resolvedAt = iso();
    conflict.resolution = `kept ${winningVersionId}`;
    this.createAudit("CONFLICT_RESOLVED", actor, { conflictId, winningVersionId });
    return conflict;
  }

  pruneOldVersions(keepPerPath = 2): { pruned: number } {
    let pruned = 0;
    const groups = new Map<string, FileVersion[]>();
    for (const version of this.versions) {
      const key = `${version.deviceId}:${version.path}`;
      groups.set(key, [...(groups.get(key) || []), version]);
    }
    for (const versions of groups.values()) {
      const sorted = versions.sort((a, b) => b.version - a.version);
      for (const old of sorted.slice(keepPerPath)) {
        if (this.snapshots.some((snapshot) => snapshot.fileVersionIds.includes(old.id))) continue;
        this.versions = this.versions.filter((version) => version.id !== old.id);
        for (const hash of old.chunkHashes) {
          const chunk = this.chunks.find((item) => item.hash === hash);
          if (chunk) chunk.refCount = Math.max(0, chunk.refCount - 1);
        }
        pruned += 1;
      }
    }
    this.chunks = this.chunks.filter((chunk) => chunk.refCount > 0);
    this.ensureJob("RETENTION_PRUNE", `retention:${iso().slice(0, 10)}:${keepPerPath}`, { keepPerPath, pruned });
    this.createAudit("RETENTION_PRUNED", "retention-worker", { keepPerPath, pruned });
    return { pruned };
  }

  replayChanges(from: string, to: string): { replayed: number; jobsBefore: number; jobsAfter: number } {
    const versions = this.versions.filter((version) => version.createdAt >= iso(from) && version.createdAt <= iso(to));
    const jobsBefore = this.jobs.length;
    for (const version of versions) this.ensureJob("UPLOAD_CHUNKS", `${version.id}:upload`, { versionId: version.id, chunkHashes: version.chunkHashes, bytes: version.sizeBytes });
    this.createAudit("CHANGES_REPLAYED", "worker:replay", { from: iso(from), to: iso(to), versions: versions.length });
    return { replayed: versions.length, jobsBefore, jobsAfter: this.jobs.length };
  }

  usedBytes(): number {
    return this.chunks.reduce((total, chunk) => total + chunk.sizeBytes, 0);
  }

  snapshot(): Record<string, unknown> {
    return {
      quotaBytes: this.quotaBytes,
      devices: this.devices,
      chunks: this.chunks,
      versions: this.versions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      activeVersions: this.activeVersions(),
      snapshots: this.snapshots,
      jobs: this.jobs,
      conflicts: this.conflicts,
      audit: this.audit,
      metrics: {
        devices: this.devices.length,
        onlineDevices: this.devices.filter((device) => device.status === "ONLINE").length,
        files: this.activeVersions().length,
        versions: this.versions.length,
        chunks: this.chunks.length,
        usedBytes: this.usedBytes(),
        quotaBytes: this.quotaBytes,
        dedupeSavingsBytes: Math.max(0, this.activeVersions().reduce((total, version) => total + version.sizeBytes, 0) - this.usedBytes()),
        queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length,
        openConflicts: this.conflicts.filter((conflict) => conflict.status === "OPEN").length,
        snapshots: this.snapshots.length
      }
    };
  }

  exportState(): Record<string, unknown> {
    return {
      quotaBytes: this.quotaBytes,
      devices: this.devices,
      chunks: this.chunks,
      versions: this.versions,
      snapshots: this.snapshots,
      jobs: this.jobs,
      conflicts: this.conflicts,
      audit: this.audit,
      processedEvents: [...this.processedEvents],
      failNextJob: this.failNextJob
    };
  }

  importState(state: Record<string, unknown>): void {
    this.quotaBytes = state.quotaBytes as number;
    this.devices = state.devices as BackupDevice[];
    this.chunks = state.chunks as ChunkObject[];
    this.versions = state.versions as FileVersion[];
    this.snapshots = state.snapshots as BackupSnapshot[];
    this.jobs = state.jobs as SyncJob[];
    this.conflicts = state.conflicts as Conflict[];
    this.audit = state.audit as AuditEvent[];
    this.processedEvents = new Set(state.processedEvents as string[]);
    this.failNextJob = Boolean(state.failNextJob);
  }
}

export function createSeededBackupSync(): PersonalBackupSync {
  const sync = new PersonalBackupSync();
  sync.seed();
  return sync;
}
