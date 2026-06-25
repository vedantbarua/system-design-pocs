import crypto from "node:crypto";

export type SleepEventType = "SLEEP_START" | "WAKE" | "NAP_START" | "NAP_END";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type UserProfile = {
  id: string;
  name: string;
  targetSleepMinutes: number;
  idealBedtime: string;
};

export type Device = {
  id: string;
  userId: string;
  name: string;
  kind: "WATCH" | "RING" | "PHONE";
  lastSyncAt: string;
};

export type SleepEventInput = {
  eventId: string;
  userId: string;
  deviceId: string;
  type: SleepEventType;
  occurredAt?: string;
  quality?: number;
  source?: string;
};

export type SleepEvent = Required<Omit<SleepEventInput, "occurredAt" | "quality" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  receivedAt: string;
  quality: number;
  source: string;
};

export type SleepSession = {
  id: string;
  userId: string;
  kind: "NIGHT" | "NAP";
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  qualityScore: number;
  status: "OPEN" | "COMPLETE";
  sourceEventIds: string[];
};

export type DailyRecovery = {
  userId: string;
  date: string;
  totalSleepMinutes: number;
  nightSleepMinutes: number;
  napMinutes: number;
  sleepDebtMinutes: number;
  bedtimeVarianceMinutes: number;
  consistencyScore: number;
  recoveryScore: number;
};

export type Alert = {
  id: string;
  kind: "SHORT_SLEEP_STREAK" | "IRREGULAR_SLEEP" | "RECOVERY_DROP";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Recommendation = {
  id: string;
  userId: string;
  kind: "EARLIER_BEDTIME" | "RECOVERY_DAY" | "CONSISTENCY" | "ON_TRACK";
  priority: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  createdAt: string;
};

export type Job = {
  id: string;
  kind: "RECOVERY_REBUILD" | "ALERT_DISPATCH" | "RETENTION" | "RECOMMENDATION_REFRESH";
  status: JobStatus;
  attempts: number;
  dedupeKey: string;
  queuedAt: string;
  completedAt: string | null;
  lastError: string | null;
};

export type Audit = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  at: string;
};

type OpenSession = {
  userId: string;
  kind: "NIGHT" | "NAP";
  start: SleepEvent;
};

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const dayKey = (value: string | Date) => new Date(value).toISOString().slice(0, 10);

export function iso(value: string | number | Date = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid timestamp");
  }
  return date.toISOString();
}

export function addMinutes(minutes: number, value: string | number | Date = new Date()) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

export function sleepEventKey(input: Pick<SleepEventInput, "deviceId" | "eventId">) {
  if (!input.deviceId || !input.eventId) {
    throw new Error("deviceId and eventId are required");
  }
  return `${input.deviceId}:${input.eventId}`;
}

export class SleepRecoveryTracker {
  users: UserProfile[] = [];
  devices: Device[] = [];
  events: SleepEvent[] = [];
  sessions: SleepSession[] = [];
  dailyRecovery: DailyRecovery[] = [];
  alerts: Alert[] = [];
  recommendations: Recommendation[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.users = [{ id: "user-ava", name: "Ava", targetSleepMinutes: 480, idealBedtime: "22:30" }];
    this.devices = [
      { id: "device-ring", userId: "user-ava", name: "Sleep ring", kind: "RING", lastSyncAt: iso(now) },
      { id: "device-watch", userId: "user-ava", name: "Running watch", kind: "WATCH", lastSyncAt: iso(now) },
      { id: "device-phone", userId: "user-ava", name: "Bedside phone", kind: "PHONE", lastSyncAt: iso(now) }
    ];
    this.events = [];
    this.sessions = [];
    this.dailyRecovery = [];
    this.alerts = [];
    this.recommendations = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;

    const nightDurations = [455, 430, 365, 350, 405, 500, 470];
    let sequence = 0;
    for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
      const wake = new Date(now);
      wake.setUTCDate(wake.getUTCDate() - daysAgo);
      wake.setUTCHours(6 + (daysAgo % 2), 30, 0, 0);
      const duration = nightDurations[6 - daysAgo];
      const end = iso(wake);
      const start = daysAgo === 3 ? iso(new Date(Date.UTC(wake.getUTCFullYear(), wake.getUTCMonth(), wake.getUTCDate(), 1, 20, 0, 0))) : addMinutes(-duration, end);
      this.ingest({
        eventId: `seed-${sequence++}`,
        userId: "user-ava",
        deviceId: "device-ring",
        type: "SLEEP_START",
        occurredAt: start,
        quality: 82 - daysAgo,
        source: "seed"
      });
      this.ingest({
        eventId: `seed-${sequence++}`,
        userId: "user-ava",
        deviceId: "device-ring",
        type: "WAKE",
        occurredAt: end,
        quality: 78 - Math.max(0, daysAgo - 2),
        source: "seed"
      });
    }

    this.ingest({
      eventId: `seed-${sequence++}`,
      userId: "user-ava",
      deviceId: "device-watch",
      type: "NAP_START",
      occurredAt: addMinutes(-290, now),
      quality: 72,
      source: "seed"
    });
    this.ingest({
      eventId: `seed-${sequence++}`,
      userId: "user-ava",
      deviceId: "device-watch",
      type: "NAP_END",
      occurredAt: addMinutes(-260, now),
      quality: 72,
      source: "seed"
    });
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { events: this.events.length, sessions: this.sessions.length });
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  findUser(userId: string) {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new Error("user not found");
    }
    return user;
  }

  findDevice(deviceId: string, userId: string) {
    const device = this.devices.find((candidate) => candidate.id === deviceId && candidate.userId === userId);
    if (!device) {
      throw new Error("device not found");
    }
    return device;
  }

  ingest(input: SleepEventInput) {
    this.findUser(input.userId);
    const device = this.findDevice(input.deviceId, input.userId);
    if (input.quality !== undefined && (input.quality < 0 || input.quality > 100)) {
      throw new Error("quality must be between 0 and 100");
    }

    const eventKey = sleepEventKey(input);
    if (this.processed.has(eventKey)) {
      return { duplicate: true };
    }

    const event: SleepEvent = {
      id: id("evt"),
      eventId: input.eventId,
      eventKey,
      userId: input.userId,
      deviceId: input.deviceId,
      type: input.type,
      occurredAt: iso(input.occurredAt || new Date()),
      receivedAt: iso(),
      quality: input.quality ?? 75,
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);
    device.lastSyncAt = iso();
    this.rebuildProjections();
    this.createAudit("SLEEP_EVENT_INGESTED", { eventId: event.id, type: event.type, occurredAt: event.occurredAt });
    return { duplicate: false, event };
  }

  rebuildProjections() {
    this.rebuildSessions();
    this.rebuildDailyRecovery();
    this.refreshRecommendations();
    this.evaluateAlerts();
  }

  rebuildSessions() {
    const previous = new Map(this.sessions.map((session) => [session.sourceEventIds.join(":"), session]));
    const sessions: SleepSession[] = [];
    const openByUser = new Map<string, OpenSession>();

    for (const event of [...this.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      if (event.type === "SLEEP_START" || event.type === "NAP_START") {
        const kind = event.type === "SLEEP_START" ? "NIGHT" : "NAP";
        openByUser.set(`${event.userId}:${kind}`, { userId: event.userId, kind, start: event });
        continue;
      }

      const kind = event.type === "WAKE" ? "NIGHT" : "NAP";
      const openKey = `${event.userId}:${kind}`;
      const open = openByUser.get(openKey);
      if (!open) {
        continue;
      }

      const durationMinutes = Math.max(0, Math.round((new Date(event.occurredAt).getTime() - new Date(open.start.occurredAt).getTime()) / 60_000));
      const key = `${open.start.id}:${event.id}`;
      const prior = previous.get(key);
      sessions.push({
        id: prior?.id || id("session"),
        userId: event.userId,
        kind,
        startedAt: open.start.occurredAt,
        endedAt: event.occurredAt,
        durationMinutes,
        qualityScore: Math.round((open.start.quality + event.quality) / 2),
        status: "COMPLETE",
        sourceEventIds: [open.start.id, event.id]
      });
      openByUser.delete(openKey);
    }

    for (const open of openByUser.values()) {
      const key = open.start.id;
      const prior = previous.get(key);
      sessions.push({
        id: prior?.id || id("session"),
        userId: open.userId,
        kind: open.kind,
        startedAt: open.start.occurredAt,
        endedAt: null,
        durationMinutes: 0,
        qualityScore: open.start.quality,
        status: "OPEN",
        sourceEventIds: [open.start.id]
      });
    }

    this.sessions = sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return this.sessions;
  }

  rebuildDailyRecovery() {
    const metrics: DailyRecovery[] = [];
    for (const user of this.users) {
      const sessions = this.sessions.filter((session) => session.userId === user.id && session.status === "COMPLETE");
      const dates = [...new Set(sessions.map((session) => dayKey(session.endedAt || session.startedAt)))].sort();

      for (const date of dates) {
        const rows = sessions.filter((session) => dayKey(session.endedAt || session.startedAt) === date);
        const nightRows = rows.filter((session) => session.kind === "NIGHT");
        const napRows = rows.filter((session) => session.kind === "NAP");
        const totalSleepMinutes = rows.reduce((sum, session) => sum + session.durationMinutes, 0);
        const nightSleepMinutes = nightRows.reduce((sum, session) => sum + session.durationMinutes, 0);
        const napMinutes = napRows.reduce((sum, session) => sum + session.durationMinutes, 0);
        const bedtimeVarianceMinutes = nightRows[0] ? bedtimeVariance(nightRows[0].startedAt, user.idealBedtime) : 120;
        const consistencyScore = Math.max(0, 100 - Math.round(bedtimeVarianceMinutes / 2));
        const sleepDebtMinutes = Math.max(0, user.targetSleepMinutes - nightSleepMinutes);
        const quality = rows.length ? rows.reduce((sum, session) => sum + session.qualityScore, 0) / rows.length : 60;
        const durationScore = Math.min(100, Math.round((totalSleepMinutes / user.targetSleepMinutes) * 100));
        const recoveryScore = Math.max(0, Math.min(100, Math.round(durationScore * 0.45 + quality * 0.35 + consistencyScore * 0.2 - Math.min(20, sleepDebtMinutes / 20))));

        metrics.push({
          userId: user.id,
          date,
          totalSleepMinutes,
          nightSleepMinutes,
          napMinutes,
          sleepDebtMinutes,
          bedtimeVarianceMinutes,
          consistencyScore,
          recoveryScore
        });
      }
    }

    this.dailyRecovery = metrics.sort((a, b) => b.date.localeCompare(a.date));
    return this.dailyRecovery;
  }

  refreshRecommendations() {
    const latest = this.dailyRecovery[0];
    if (!latest) {
      this.recommendations = [];
      return this.recommendations;
    }

    const recommendations: Recommendation[] = [];
    if (latest.sleepDebtMinutes > 90) {
      recommendations.push({
        id: id("rec"),
        userId: latest.userId,
        kind: "EARLIER_BEDTIME",
        priority: "HIGH",
        message: "Move bedtime 30 minutes earlier tonight to reduce accumulated sleep debt.",
        createdAt: iso()
      });
    }
    if (latest.recoveryScore < 65) {
      recommendations.push({
        id: id("rec"),
        userId: latest.userId,
        kind: "RECOVERY_DAY",
        priority: "MEDIUM",
        message: "Schedule a lighter recovery day because recent sleep quality is trending low.",
        createdAt: iso()
      });
    }
    if (latest.bedtimeVarianceMinutes > 75) {
      recommendations.push({
        id: id("rec"),
        userId: latest.userId,
        kind: "CONSISTENCY",
        priority: "MEDIUM",
        message: "Keep bedtime within a one-hour window for the next three nights.",
        createdAt: iso()
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        id: id("rec"),
        userId: latest.userId,
        kind: "ON_TRACK",
        priority: "LOW",
        message: "Recovery is on track; preserve the current schedule.",
        createdAt: iso()
      });
    }

    this.recommendations = recommendations;
    return this.recommendations;
  }

  evaluateAlerts() {
    const latest = [...this.dailyRecovery].sort((a, b) => b.date.localeCompare(a.date))[0];
    const recent = [...this.dailyRecovery].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

    if (recent.length === 3 && recent.every((row) => row.nightSleepMinutes < 390)) {
      this.ensureAlert("SHORT_SLEEP_STREAK", `short:${recent[0].date}`);
    }
    if (latest && latest.bedtimeVarianceMinutes > 120) {
      this.ensureAlert("IRREGULAR_SLEEP", `irregular:${latest.date}`);
    }
    if (latest && latest.recoveryScore < 55) {
      this.ensureAlert("RECOVERY_DROP", `recovery:${latest.date}`);
    }
    return this.alerts;
  }

  ensureAlert(kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  dispatchAlerts() {
    let sent = 0;
    for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) {
      alert.status = "SENT";
      alert.sentAt = iso();
      sent += 1;
    }
    return sent;
  }

  retain(days = 30, asOf: string | Date = new Date()) {
    const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000;
    const before = this.events.length;
    this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff);
    this.processed = new Set(this.events.map((event) => event.eventKey));
    this.rebuildProjections();
    return { deleted: before - this.events.length };
  }

  ensureJob(kind: Job["kind"]) {
    const dedupeKey = `${kind}:${iso().slice(0, 13)}`;
    const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey);
    if (existing) {
      return existing;
    }
    const job: Job = {
      id: id("job"),
      kind,
      status: "QUEUED",
      attempts: 0,
      dedupeKey,
      queuedAt: iso(),
      completedAt: null,
      lastError: null
    };
    this.jobs.unshift(job);
    return job;
  }

  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) {
      return { processed: false };
    }

    job.attempts += 1;
    if (this.failNextJob) {
      this.failNextJob = false;
      job.status = job.attempts >= 3 ? "DEAD" : "RETRY";
      job.lastError = "simulated wearable sync timeout";
      return { processed: true, job };
    }

    if (job.kind === "RECOVERY_REBUILD") {
      this.rebuildProjections();
    }
    if (job.kind === "ALERT_DISPATCH") {
      this.dispatchAlerts();
    }
    if (job.kind === "RETENTION") {
      this.retain(30);
    }
    if (job.kind === "RECOMMENDATION_REFRESH") {
      this.refreshRecommendations();
    }

    job.status = "COMPLETED";
    job.completedAt = iso();
    job.lastError = null;
    return { processed: true, job };
  }

  drainJobs() {
    let processed = 0;
    let completed = 0;
    while (true) {
      const result = this.dispatchNextJob();
      if (!result.processed || !result.job) {
        break;
      }
      processed += 1;
      if (result.job.status === "COMPLETED") {
        completed += 1;
      }
    }
    return { processed, completed };
  }

  snapshot() {
    const latest = this.dailyRecovery[0];
    const completeSessions = this.sessions.filter((session) => session.status === "COMPLETE");
    const recent = this.dailyRecovery.slice(0, 7);
    return {
      users: this.users,
      devices: this.devices,
      events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      sessions: this.sessions,
      dailyRecovery: this.dailyRecovery,
      alerts: this.alerts,
      recommendations: this.recommendations,
      jobs: this.jobs,
      audit: this.audit,
      metrics: {
        recoveryScore: latest?.recoveryScore || 0,
        sleepDebtMinutes: latest?.sleepDebtMinutes || 0,
        averageSleepHours: recent.length ? Number((recent.reduce((sum, row) => sum + row.totalSleepMinutes, 0) / recent.length / 60).toFixed(1)) : 0,
        shortNightStreak: consecutiveShortNights(this.dailyRecovery),
        completeSessions: completeSessions.length,
        openSessions: this.sessions.filter((session) => session.status === "OPEN").length,
        queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length,
        queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length
      }
    };
  }

  exportState() {
    return {
      users: this.users,
      devices: this.devices,
      events: this.events,
      sessions: this.sessions,
      dailyRecovery: this.dailyRecovery,
      alerts: this.alerts,
      recommendations: this.recommendations,
      jobs: this.jobs,
      audit: this.audit,
      processed: [...this.processed]
    };
  }

  importState(state: Record<string, unknown>) {
    this.users = state.users as UserProfile[];
    this.devices = state.devices as Device[];
    this.events = state.events as SleepEvent[];
    this.sessions = state.sessions as SleepSession[];
    this.dailyRecovery = state.dailyRecovery as DailyRecovery[];
    this.alerts = state.alerts as Alert[];
    this.recommendations = state.recommendations as Recommendation[];
    this.jobs = state.jobs as Job[];
    this.audit = state.audit as Audit[];
    this.processed = new Set(state.processed as string[]);
  }
}

function bedtimeVariance(startedAt: string, idealBedtime: string) {
  const [hour, minute] = idealBedtime.split(":").map(Number);
  const date = new Date(startedAt);
  const actual = date.getUTCHours() * 60 + date.getUTCMinutes();
  const ideal = hour * 60 + minute;
  const raw = Math.abs(actual - ideal);
  return Math.min(raw, 1_440 - raw);
}

function consecutiveShortNights(rows: DailyRecovery[]) {
  let streak = 0;
  for (const row of [...rows].sort((a, b) => b.date.localeCompare(a.date))) {
    if (row.nightSleepMinutes >= 390) {
      break;
    }
    streak += 1;
  }
  return streak;
}

export function createSeededTracker(now: Date = new Date()) {
  const tracker = new SleepRecoveryTracker();
  tracker.seed(now);
  return tracker;
}
