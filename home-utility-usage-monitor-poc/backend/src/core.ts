import crypto from "node:crypto";

export type UtilityKind = "electricity" | "water";
export type ReadingSource = "seed" | "api" | "kafka" | "replay";
export type AlertType = "USAGE_SPIKE" | "POSSIBLE_LEAK" | "MISSING_READINGS" | "BUDGET_RISK";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type JobStatus = "READY" | "PROCESSING" | "RETRY" | "COMPLETED" | "DEAD";

export type Household = {
  id: string;
  name: string;
  timezone: string;
  monthlyBudgetCents: number;
  billingCycleStartDay: number;
};

export type Meter = {
  id: string;
  householdId: string;
  kind: UtilityKind;
  label: string;
  location: string;
  unit: "kWh" | "gal";
  tariffCentsPerUnit: number;
  expectedIntervalMinutes: number;
  baselineHourlyUsage: number[];
  lastReadingAt: string | null;
  status: "ONLINE" | "STALE";
};

export type Reading = {
  id: string;
  eventId: string;
  eventKey: string;
  meterId: string;
  householdId: string;
  kind: UtilityKind;
  measuredAt: string;
  receivedAt: string;
  value: number;
  unit: string;
  source: ReadingSource;
  corrected: boolean;
  correctionOf: string | null;
  supersededBy: string | null;
};

export type Rollup = {
  id: string;
  meterId: string;
  householdId: string;
  kind: UtilityKind;
  bucket: string;
  granularity: "hour" | "day";
  usage: number;
  costCents: number;
  points: number;
  baselineUsage: number;
  recomputedAt: string;
};

export type Alert = {
  id: string;
  householdId: string;
  meterId: string;
  type: AlertType;
  status: AlertStatus;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  detectedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  dedupeKey: string;
  evidence: Record<string, unknown>;
};

export type NotificationJob = {
  id: string;
  alertId: string;
  kind: "ALERT_NOTIFICATION";
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  dedupeKey: string;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type Delivery = {
  id: string;
  jobId: string;
  alertId: string;
  recipient: string;
  channel: "push" | "email";
  status: "DELIVERED";
  dedupeKey: string;
  deliveredAt: string;
};

type IngestInput = {
  eventId?: string;
  meterId: string;
  measuredAt: string;
  value: number;
  unit?: string;
  receivedAt?: string;
  source?: ReadingSource;
  correctionOf?: string | null;
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

function hourBucket(value: string): string {
  const parsed = new Date(iso(value));
  parsed.setUTCMinutes(0, 0, 0);
  return parsed.toISOString();
}

function dayBucket(value: string): string {
  return `${iso(value).slice(0, 10)}T00:00:00.000Z`;
}

function hourOfDay(value: string): number {
  return new Date(iso(value)).getUTCHours();
}

function minutesBetween(start: string, end: string): number {
  return Math.round((new Date(iso(end)).getTime() - new Date(iso(start)).getTime()) / 60000);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, precision = 2): number {
  return Number(value.toFixed(precision));
}

export function readingKey(input: IngestInput): string {
  return input.eventId
    ? `${input.meterId}:${input.eventId}`
    : `${input.meterId}:${iso(input.measuredAt)}:${input.value}`;
}

export class UtilityMonitor {
  households: Household[] = [];
  meters: Meter[] = [];
  readings: Reading[] = [];
  rollups: Rollup[] = [];
  alerts: Alert[] = [];
  jobs: NotificationJob[] = [];
  deliveries: Delivery[] = [];
  audit: Array<{ id: string; action: string; actor: string; details: Record<string, unknown>; at: string }> = [];
  processedKeys = new Set<string>();
  failNextDelivery = false;

  seed(): void {
    this.households = [
      {
        id: "household-maple",
        name: "Maple Street Home",
        timezone: "America/Chicago",
        monthlyBudgetCents: 18500,
        billingCycleStartDay: 1
      }
    ];
    const electricBaseline = Array.from({ length: 24 }, (_item, hour) => {
      if (hour >= 17 && hour <= 22) return 2.2;
      if (hour >= 7 && hour <= 9) return 1.4;
      return 0.7;
    });
    const waterBaseline = Array.from({ length: 24 }, (_item, hour) => {
      if (hour >= 6 && hour <= 8) return 18;
      if (hour >= 18 && hour <= 21) return 14;
      return 2.2;
    });
    this.meters = [
      {
        id: "meter-electric-main",
        householdId: "household-maple",
        kind: "electricity",
        label: "Main electric meter",
        location: "Side yard",
        unit: "kWh",
        tariffCentsPerUnit: 18.4,
        expectedIntervalMinutes: 60,
        baselineHourlyUsage: electricBaseline,
        lastReadingAt: null,
        status: "ONLINE"
      },
      {
        id: "meter-water-main",
        householdId: "household-maple",
        kind: "water",
        label: "Water meter",
        location: "Basement utility room",
        unit: "gal",
        tariffCentsPerUnit: 1.3,
        expectedIntervalMinutes: 60,
        baselineHourlyUsage: waterBaseline,
        lastReadingAt: null,
        status: "ONLINE"
      }
    ];
    for (let hour = 0; hour < 24; hour += 1) {
      const measuredAt = `2026-06-15T${String(hour).padStart(2, "0")}:00:00.000Z`;
      this.ingestReading({
        eventId: `seed-electric-${hour}`,
        meterId: "meter-electric-main",
        measuredAt,
        value: hour === 19 ? 7.9 : round(electricBaseline[hour] * (hour % 5 === 0 ? 1.2 : 0.9)),
        receivedAt: "2026-06-15T23:55:00.000Z",
        source: "seed"
      });
      this.ingestReading({
        eventId: `seed-water-${hour}`,
        meterId: "meter-water-main",
        measuredAt,
        value: hour >= 1 && hour <= 4 ? 9.6 : round(waterBaseline[hour] * (hour % 4 === 0 ? 1.1 : 0.85)),
        receivedAt: "2026-06-15T23:55:00.000Z",
        source: "seed"
      });
    }
    this.runAnomalyDetection("2026-06-15T23:55:00.000Z");
    this.createAudit("SYSTEM_SEEDED", "system", { meters: this.meters.length, readings: this.readings.length });
  }

  meter(meterId: string): Meter {
    const meter = this.meters.find((item) => item.id === meterId);
    assertCondition(meter, "meter not found");
    return meter;
  }

  createAudit(action: string, actor: string, details: Record<string, unknown>): void {
    this.audit.unshift({ id: id("audit"), action, actor, details, at: iso() });
    this.audit = this.audit.slice(0, 250);
  }

  ingestReading(input: IngestInput): { duplicate: boolean; reading?: Reading; affectedBuckets: string[] } {
    assertCondition(input.meterId, "meterId is required");
    assertCondition(typeof input.value === "number" && input.value >= 0, "value must be non-negative");
    const meter = this.meter(input.meterId);
    const eventKey = readingKey(input);
    if (this.processedKeys.has(eventKey)) return { duplicate: true, affectedBuckets: [] };
    const measuredAt = iso(input.measuredAt);
    const eventId = input.eventId || eventKey;
    if (input.correctionOf) {
      const original = this.readings.find((item) => item.eventId === input.correctionOf || item.id === input.correctionOf);
      assertCondition(original, "correction target not found");
      original.supersededBy = eventId;
    }
    const reading: Reading = {
      id: id("reading"),
      eventId,
      eventKey,
      meterId: meter.id,
      householdId: meter.householdId,
      kind: meter.kind,
      measuredAt,
      receivedAt: iso(input.receivedAt || new Date()),
      value: round(input.value, 3),
      unit: input.unit || meter.unit,
      source: input.source || "api",
      corrected: Boolean(input.correctionOf),
      correctionOf: input.correctionOf || null,
      supersededBy: null
    };
    this.readings.push(reading);
    this.processedKeys.add(eventKey);
    meter.lastReadingAt = this.latestReadingForMeter(meter.id)?.measuredAt || null;
    meter.status = "ONLINE";
    const affectedBuckets = this.recomputeProjections(meter.id, measuredAt);
    this.createAudit(reading.corrected ? "READING_CORRECTED" : "READING_INGESTED", "meter-ingest", {
      meterId: meter.id,
      eventId: reading.eventId,
      measuredAt: reading.measuredAt,
      value: reading.value
    });
    return { duplicate: false, reading, affectedBuckets };
  }

  latestReadingForMeter(meterId: string): Reading | null {
    return this.activeReadings(meterId).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0] || null;
  }

  activeReadings(meterId?: string): Reading[] {
    return this.readings
      .filter((item) => !item.supersededBy && (!meterId || item.meterId === meterId))
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  }

  recomputeProjections(meterId: string, measuredAt?: string): string[] {
    const meter = this.meter(meterId);
    const candidateReadings = measuredAt
      ? this.activeReadings(meterId).filter((reading) => dayBucket(reading.measuredAt) === dayBucket(measuredAt))
      : this.activeReadings(meterId);
    const touched = new Set<string>();
    for (const granularity of ["hour", "day"] as const) {
      const groups = new Map<string, Reading[]>();
      for (const reading of candidateReadings) {
        const bucket = granularity === "hour" ? hourBucket(reading.measuredAt) : dayBucket(reading.measuredAt);
        groups.set(bucket, [...(groups.get(bucket) || []), reading]);
      }
      for (const [bucket, readings] of groups.entries()) {
        this.rollups = this.rollups.filter(
          (rollup) => !(rollup.meterId === meterId && rollup.granularity === granularity && rollup.bucket === bucket)
        );
        const usage = round(sum(readings.map((reading) => reading.value)), 3);
        const baselineUsage =
          granularity === "hour"
            ? meter.baselineHourlyUsage[hourOfDay(bucket)]
            : round(sum(meter.baselineHourlyUsage), 3);
        this.rollups.push({
          id: `rollup:${meterId}:${granularity}:${bucket}`,
          meterId,
          householdId: meter.householdId,
          kind: meter.kind,
          bucket,
          granularity,
          usage,
          costCents: Math.round(usage * meter.tariffCentsPerUnit),
          points: readings.length,
          baselineUsage,
          recomputedAt: iso()
        });
        touched.add(`${granularity}:${bucket}`);
      }
    }
    return [...touched].sort();
  }

  reprocessRange(meterId: string, from: string, to: string): { meterId: string; buckets: string[] } {
    const meter = this.meter(meterId);
    const relevant = this.activeReadings(meterId).filter(
      (reading) => reading.measuredAt >= iso(from) && reading.measuredAt <= iso(to)
    );
    const buckets = new Set<string>();
    for (const reading of relevant) {
      for (const bucket of this.recomputeProjections(meter.id, reading.measuredAt)) buckets.add(bucket);
    }
    this.createAudit("PROJECTIONS_REPROCESSED", "worker:reprocessor", { meterId, from: iso(from), to: iso(to) });
    return { meterId, buckets: [...buckets].sort() };
  }

  rollupsFor(meterId: string, granularity: "hour" | "day" = "hour"): Rollup[] {
    return this.rollups
      .filter((item) => item.meterId === meterId && item.granularity === granularity)
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  runAnomalyDetection(asOf: string): { created: number; checked: number } {
    let created = 0;
    let checked = 0;
    for (const meter of this.meters) {
      const hourly = this.rollupsFor(meter.id, "hour");
      checked += hourly.length;
      for (const rollup of hourly) {
        if (rollup.baselineUsage > 0 && rollup.usage >= rollup.baselineUsage * 3) {
          created += this.createAlert({
            meter,
            type: "USAGE_SPIKE",
            severity: "warning",
            title: `${meter.label} usage spike`,
            message: `${rollup.usage} ${meter.unit} exceeded the ${rollup.baselineUsage} ${meter.unit} baseline.`,
            dedupeKey: `${meter.id}:spike:${rollup.bucket}`,
            evidence: { bucket: rollup.bucket, usage: rollup.usage, baseline: rollup.baselineUsage }
          });
        }
      }
      if (meter.kind === "water") {
        const overnight = hourly.filter((rollup) => {
          const hour = hourOfDay(rollup.bucket);
          return hour >= 1 && hour <= 4;
        });
        const continuousFlow = overnight.length >= 4 && overnight.every((rollup) => rollup.usage >= 5);
        if (continuousFlow) {
          created += this.createAlert({
            meter,
            type: "POSSIBLE_LEAK",
            severity: "critical",
            title: "Possible overnight water leak",
            message: "Water usage stayed above 5 gal for four overnight hours.",
            dedupeKey: `${meter.id}:leak:${dayBucket(asOf)}`,
            evidence: { buckets: overnight.map((rollup) => rollup.bucket), usage: overnight.map((rollup) => rollup.usage) }
          });
        }
      }
      const latest = this.latestReadingForMeter(meter.id);
      if (latest && minutesBetween(latest.measuredAt, asOf) > meter.expectedIntervalMinutes * 2) {
        meter.status = "STALE";
        created += this.createAlert({
          meter,
          type: "MISSING_READINGS",
          severity: "warning",
          title: `${meter.label} has missing readings`,
          message: `No reading has arrived since ${latest.measuredAt}.`,
          dedupeKey: `${meter.id}:missing:${dayBucket(asOf)}`,
          evidence: { latestReadingAt: latest.measuredAt, asOf: iso(asOf) }
        });
      }
    }
    const monthToDate = this.monthToDateCostCents();
    const household = this.households[0];
    if (monthToDate > household.monthlyBudgetCents * 0.85) {
      created += this.createAlert({
        meter: this.meters[0],
        type: "BUDGET_RISK",
        severity: "info",
        title: "Utility budget risk",
        message: "Month-to-date utility cost is above 85% of budget.",
        dedupeKey: `${household.id}:budget:${dayBucket(asOf)}`,
        evidence: { monthToDate, budget: household.monthlyBudgetCents }
      });
    }
    if (created) this.createAudit("ANOMALY_DETECTION_COMPLETED", "worker:anomaly", { created, checked });
    return { created, checked };
  }

  createAlert(input: {
    meter: Meter;
    type: AlertType;
    severity: Alert["severity"];
    title: string;
    message: string;
    dedupeKey: string;
    evidence: Record<string, unknown>;
  }): number {
    const existing = this.alerts.find((alert) => alert.dedupeKey === input.dedupeKey && alert.status === "OPEN");
    if (existing) return 0;
    const alert: Alert = {
      id: id("alert"),
      householdId: input.meter.householdId,
      meterId: input.meter.id,
      type: input.type,
      status: "OPEN",
      severity: input.severity,
      title: input.title,
      message: input.message,
      detectedAt: iso(),
      acknowledgedAt: null,
      acknowledgedBy: null,
      dedupeKey: input.dedupeKey,
      evidence: input.evidence
    };
    this.alerts.unshift(alert);
    this.ensureJob(alert.id, `${alert.dedupeKey}:notify`);
    return 1;
  }

  ensureJob(alertId: string, dedupeKey: string): NotificationJob {
    const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey);
    if (existing) return existing;
    const job: NotificationJob = {
      id: id("job"),
      alertId,
      kind: "ALERT_NOTIFICATION",
      status: "READY",
      attempts: 0,
      maxAttempts: 3,
      dedupeKey,
      lastError: null,
      createdAt: iso(),
      completedAt: null
    };
    this.jobs.push(job);
    return job;
  }

  acknowledgeAlert(alertId: string, actor: string): Alert {
    const alert = this.alerts.find((item) => item.id === alertId);
    assertCondition(alert, "alert not found");
    if (alert.status === "ACKNOWLEDGED") return alert;
    alert.status = "ACKNOWLEDGED";
    alert.acknowledgedAt = iso();
    alert.acknowledgedBy = actor;
    this.createAudit("ALERT_ACKNOWLEDGED", actor, { alertId, type: alert.type });
    return alert;
  }

  workerTick(): { processed: boolean; job?: NotificationJob } {
    const job = this.jobs.find((item) => item.status === "READY" || item.status === "RETRY");
    if (!job) return { processed: false };
    job.status = "PROCESSING";
    job.attempts += 1;
    if (this.failNextDelivery) {
      this.failNextDelivery = false;
      job.lastError = "simulated provider timeout";
      job.status = job.attempts >= job.maxAttempts ? "DEAD" : "RETRY";
      this.createAudit("ALERT_DELIVERY_RETRY", "worker:notifications", { jobId: job.id });
      return { processed: true, job };
    }
    const recipients = ["owner@maple.example", "maya@maple.example"];
    for (const recipient of recipients) {
      for (const channel of ["push", "email"] as const) {
        const dedupeKey = `${job.dedupeKey}:${recipient}:${channel}`;
        if (this.deliveries.some((delivery) => delivery.dedupeKey === dedupeKey)) continue;
        this.deliveries.unshift({
          id: id("delivery"),
          jobId: job.id,
          alertId: job.alertId,
          recipient,
          channel,
          status: "DELIVERED",
          dedupeKey,
          deliveredAt: iso()
        });
      }
    }
    job.status = "COMPLETED";
    job.completedAt = iso();
    job.lastError = null;
    this.createAudit("ALERT_DELIVERED", "worker:notifications", { jobId: job.id, alertId: job.alertId });
    return { processed: true, job };
  }

  drainWorkers(maxJobs = 50): { processed: number } {
    let processed = 0;
    while (processed < maxJobs) {
      const result = this.workerTick();
      if (!result.processed) break;
      processed += 1;
    }
    return { processed };
  }

  monthToDateCostCents(): number {
    return this.rollups
      .filter((rollup) => rollup.granularity === "day" && rollup.bucket.startsWith("2026-06"))
      .reduce((total, rollup) => total + rollup.costCents, 0);
  }

  snapshot(): Record<string, unknown> {
    const activeReadings = this.activeReadings();
    const hourly = this.rollups.filter((rollup) => rollup.granularity === "hour");
    const todayUsage = this.rollups.filter((rollup) => rollup.granularity === "day" && rollup.bucket === "2026-06-15T00:00:00.000Z");
    return {
      household: this.households[0],
      meters: this.meters.map((meter) => ({
        ...meter,
        latestReading: this.latestReadingForMeter(meter.id),
        hourly: this.rollupsFor(meter.id, "hour"),
        daily: this.rollupsFor(meter.id, "day"),
        alerts: this.alerts.filter((alert) => alert.meterId === meter.id)
      })),
      readings: activeReadings.slice(-80).reverse(),
      rollups: hourly,
      alerts: this.alerts,
      jobs: this.jobs,
      deliveries: this.deliveries,
      audit: this.audit,
      metrics: {
        meters: this.meters.length,
        readings: activeReadings.length,
        openAlerts: this.alerts.filter((alert) => alert.status === "OPEN").length,
        spikeAlerts: this.alerts.filter((alert) => alert.type === "USAGE_SPIKE" && alert.status === "OPEN").length,
        leakAlerts: this.alerts.filter((alert) => alert.type === "POSSIBLE_LEAK" && alert.status === "OPEN").length,
        missingMeters: this.meters.filter((meter) => meter.status === "STALE").length,
        pendingJobs: this.jobs.filter((job) => job.status === "READY" || job.status === "RETRY").length,
        monthToDateCostCents: this.monthToDateCostCents(),
        todayElectricityKwh: round(sum(todayUsage.filter((item) => item.kind === "electricity").map((item) => item.usage)), 2),
        todayWaterGallons: round(sum(todayUsage.filter((item) => item.kind === "water").map((item) => item.usage)), 2)
      }
    };
  }

  exportState(): Record<string, unknown> {
    return {
      households: this.households,
      meters: this.meters,
      readings: this.readings,
      rollups: this.rollups,
      alerts: this.alerts,
      jobs: this.jobs,
      deliveries: this.deliveries,
      audit: this.audit,
      processedKeys: [...this.processedKeys]
    };
  }

  importState(state: Record<string, unknown>): void {
    this.households = state.households as Household[];
    this.meters = state.meters as Meter[];
    this.readings = state.readings as Reading[];
    this.rollups = state.rollups as Rollup[];
    this.alerts = state.alerts as Alert[];
    this.jobs = state.jobs as NotificationJob[];
    this.deliveries = state.deliveries as Delivery[];
    this.audit = state.audit as UtilityMonitor["audit"];
    this.processedKeys = new Set(state.processedKeys as string[]);
  }
}

export function createSeededMonitor(): UtilityMonitor {
  const monitor = new UtilityMonitor();
  monitor.seed();
  return monitor;
}
