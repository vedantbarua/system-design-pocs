import crypto from "node:crypto";

export type ReadingType = "MEASUREMENT" | "HEARTBEAT";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Room = {
  id: string;
  name: string;
  floor: string;
  targetCo2Ppm: number;
  targetHumidityMin: number;
  targetHumidityMax: number;
};

export type Sensor = {
  id: string;
  roomId: string;
  name: string;
  kind: "AIR_NODE" | "THERMOSTAT" | "PURIFIER";
  lastSeenAt: string;
};

export type ReadingInput = {
  eventId: string;
  roomId: string;
  sensorId: string;
  type: ReadingType;
  pm25: number;
  co2Ppm: number;
  vocIndex: number;
  humidityPct: number;
  temperatureF: number;
  observedAt?: string;
  source?: string;
};

export type Reading = ReadingInput & {
  id: string;
  eventKey: string;
  observedAt: string;
  receivedAt: string;
  source: string;
};

export type RoomRollup = {
  roomId: string;
  windowStart: string;
  samples: number;
  averagePm25: number;
  averageCo2Ppm: number;
  averageVocIndex: number;
  averageHumidityPct: number;
  averageTemperatureF: number;
  airQualityScore: number;
  staleSensors: number;
};

export type Incident = {
  id: string;
  roomId: string;
  kind: "PARTICULATE_SPIKE" | "CO2_BUILDUP" | "HUMIDITY_OUT_OF_RANGE" | "VOC_SPIKE" | "SENSOR_STALE";
  status: "OPEN" | "RESOLVED";
  startedAt: string;
  resolvedAt: string | null;
  samples: number;
  peakValue: number;
  alerted: boolean;
};

export type Alert = {
  id: string;
  incidentId: string;
  kind: Incident["kind"] | "RECOVERY";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Recommendation = {
  id: string;
  roomId: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  createdAt: string;
};

export type Job = {
  id: string;
  kind: "ROLLUP_REBUILD" | "INCIDENT_REBUILD" | "ALERT_DISPATCH" | "RETENTION";
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

type IncidentSignal = {
  roomId: string;
  kind: Incident["kind"];
  active: boolean;
  value: number;
  at: string;
};

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

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

export function readingKey(input: Pick<ReadingInput, "sensorId" | "eventId">) {
  if (!input.sensorId || !input.eventId) {
    throw new Error("sensorId and eventId are required");
  }
  return `${input.sensorId}:${input.eventId}`;
}

export class AirQualityMonitor {
  rooms: Room[] = [];
  sensors: Sensor[] = [];
  readings: Reading[] = [];
  rollups: RoomRollup[] = [];
  incidents: Incident[] = [];
  alerts: Alert[] = [];
  recommendations: Recommendation[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.rooms = [
      { id: "room-living", name: "Living room", floor: "Main", targetCo2Ppm: 900, targetHumidityMin: 35, targetHumidityMax: 55 },
      { id: "room-bedroom", name: "Bedroom", floor: "Upper", targetCo2Ppm: 850, targetHumidityMin: 35, targetHumidityMax: 55 },
      { id: "room-office", name: "Home office", floor: "Main", targetCo2Ppm: 800, targetHumidityMin: 35, targetHumidityMax: 55 },
      { id: "room-basement", name: "Basement", floor: "Lower", targetCo2Ppm: 950, targetHumidityMin: 35, targetHumidityMax: 60 }
    ];
    this.sensors = [
      { id: "sensor-living", roomId: "room-living", name: "Living Air Node", kind: "AIR_NODE", lastSeenAt: iso(now) },
      { id: "sensor-bedroom", roomId: "room-bedroom", name: "Bedroom Ring", kind: "AIR_NODE", lastSeenAt: iso(now) },
      { id: "sensor-office", roomId: "room-office", name: "Office Thermostat", kind: "THERMOSTAT", lastSeenAt: iso(now) },
      { id: "sensor-basement", roomId: "room-basement", name: "Basement Purifier", kind: "PURIFIER", lastSeenAt: addMinutes(-55, now) }
    ];
    this.readings = [];
    this.rollups = [];
    this.incidents = [];
    this.alerts = [];
    this.recommendations = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;

    let sequence = 0;
    for (let minute = -45; minute <= 0; minute += 5) {
      for (const room of this.rooms) {
        const spike = room.id === "room-office" && minute >= -20 && minute <= -10;
        const stale = room.id === "room-basement" && minute > -35;
        if (stale) {
          continue;
        }
        this.ingest({
          eventId: `seed-${sequence++}`,
          roomId: room.id,
          sensorId: this.sensors.find((sensor) => sensor.roomId === room.id)!.id,
          type: "MEASUREMENT",
          pm25: spike ? 58 : room.id === "room-basement" ? 18 : 7 + Math.abs(minute % 6),
          co2Ppm: spike ? 1380 : room.id === "room-bedroom" ? 980 : 620 + Math.abs(minute * 3),
          vocIndex: spike ? 620 : 120 + Math.abs(minute % 8) * 10,
          humidityPct: room.id === "room-basement" ? 66 : 42 + Math.abs(minute % 7),
          temperatureF: room.id === "room-bedroom" ? 68 : 71,
          observedAt: addMinutes(minute, now),
          source: "seed"
        });
      }
    }
    this.rebuildProjections(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { readings: this.readings.length, incidents: this.incidents.length });
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  findRoom(roomId: string) {
    const room = this.rooms.find((candidate) => candidate.id === roomId);
    if (!room) {
      throw new Error("room not found");
    }
    return room;
  }

  findSensor(sensorId: string, roomId: string) {
    const sensor = this.sensors.find((candidate) => candidate.id === sensorId && candidate.roomId === roomId);
    if (!sensor) {
      throw new Error("sensor not found");
    }
    return sensor;
  }

  ingest(input: ReadingInput) {
    this.findRoom(input.roomId);
    const sensor = this.findSensor(input.sensorId, input.roomId);
    validateReading(input);

    const eventKey = readingKey(input);
    if (this.processed.has(eventKey)) {
      return { duplicate: true };
    }

    const reading: Reading = {
      ...input,
      id: id("reading"),
      eventKey,
      observedAt: iso(input.observedAt || new Date()),
      receivedAt: iso(),
      source: input.source || "api"
    };

    this.readings.push(reading);
    this.processed.add(eventKey);
    sensor.lastSeenAt = reading.observedAt;
    this.rebuildProjections();
    this.createAudit("READING_INGESTED", { readingId: reading.id, roomId: reading.roomId, pm25: reading.pm25, co2Ppm: reading.co2Ppm });
    return { duplicate: false, reading };
  }

  rebuildProjections(asOf: string | Date = new Date()) {
    this.rebuildRollups(30, asOf);
    this.rebuildIncidents(asOf);
    this.refreshRecommendations();
  }

  rebuildRollups(windowMinutes = 30, asOf: string | Date = new Date()) {
    const end = new Date(asOf).getTime();
    const start = end - windowMinutes * 60_000;
    this.rollups = this.rooms.map((room) => {
      const rows = this.readings.filter((reading) => reading.roomId === room.id && new Date(reading.observedAt).getTime() >= start && new Date(reading.observedAt).getTime() <= end);
      const staleSensors = this.sensors.filter((sensor) => sensor.roomId === room.id && end - new Date(sensor.lastSeenAt).getTime() > 20 * 60_000).length;
      const averagePm25 = average(rows.map((row) => row.pm25));
      const averageCo2Ppm = average(rows.map((row) => row.co2Ppm));
      const averageVocIndex = average(rows.map((row) => row.vocIndex));
      const averageHumidityPct = average(rows.map((row) => row.humidityPct));
      const averageTemperatureF = average(rows.map((row) => row.temperatureF));
      return {
        roomId: room.id,
        windowStart: iso(start),
        samples: rows.length,
        averagePm25,
        averageCo2Ppm,
        averageVocIndex,
        averageHumidityPct,
        averageTemperatureF,
        airQualityScore: airQualityScore({ averagePm25, averageCo2Ppm, averageVocIndex, averageHumidityPct, averageTemperatureF, staleSensors }),
        staleSensors
      };
    });
    return this.rollups;
  }

  rebuildIncidents(asOf: string | Date = new Date()) {
    const prior = new Map(this.incidents.map((incident) => [`${incident.roomId}:${incident.kind}:${incident.startedAt}`, incident]));
    const next: Incident[] = [];
    const latestTime = new Date(asOf).getTime();

    for (const room of this.rooms) {
      const rows = this.readings.filter((reading) => reading.roomId === room.id).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
      const signals: IncidentSignal[] = rows.flatMap((reading) => readingSignals(reading, room));
      const staleSensorCount = this.sensors.filter((sensor) => sensor.roomId === room.id && latestTime - new Date(sensor.lastSeenAt).getTime() > 20 * 60_000).length;
      if (staleSensorCount > 0) {
        signals.push({ roomId: room.id, kind: "SENSOR_STALE", active: true, value: staleSensorCount, at: iso(asOf) });
      }

      for (const kind of ["PARTICULATE_SPIKE", "CO2_BUILDUP", "HUMIDITY_OUT_OF_RANGE", "VOC_SPIKE", "SENSOR_STALE"] as Incident["kind"][]) {
        let current: Incident | null = null;
        for (const signal of signals.filter((candidate) => candidate.kind === kind).sort((a, b) => a.at.localeCompare(b.at))) {
          if (signal.active) {
            if (!current) {
              const key = `${room.id}:${kind}:${signal.at}`;
              const old = prior.get(key);
              current = {
                id: old?.id || id("incident"),
                roomId: room.id,
                kind,
                status: "OPEN",
                startedAt: signal.at,
                resolvedAt: null,
                samples: 0,
                peakValue: signal.value,
                alerted: old?.alerted || false
              };
              next.push(current);
            }
            current.samples += 1;
            current.peakValue = Math.max(current.peakValue, signal.value);
          } else if (current) {
            current.status = "RESOLVED";
            current.resolvedAt = signal.at;
            current = null;
          }
        }
      }
    }

    this.incidents = next.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    for (const incident of this.incidents) {
      this.ensureAlert(incident, incident.kind);
      if (incident.status === "RESOLVED") {
        this.ensureAlert(incident, "RECOVERY");
      }
    }
    return this.incidents;
  }

  ensureAlert(incident: Incident, kind: Alert["kind"]) {
    const dedupeKey = `${incident.id}:${kind}`;
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), incidentId: incident.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  refreshRecommendations() {
    this.recommendations = this.rollups.flatMap((rollup) => {
      const recs: Recommendation[] = [];
      if (rollup.staleSensors > 0) {
        recs.push({ id: id("rec"), roomId: rollup.roomId, priority: "HIGH", message: "Check this room's sensor battery or Wi-Fi connection.", createdAt: iso() });
      }
      if (rollup.averageCo2Ppm > 1000) {
        recs.push({ id: id("rec"), roomId: rollup.roomId, priority: "HIGH", message: "Open a window or increase ventilation to reduce CO2.", createdAt: iso() });
      }
      if (rollup.averagePm25 > 35) {
        recs.push({ id: id("rec"), roomId: rollup.roomId, priority: "HIGH", message: "Run a purifier and avoid indoor smoke or cooking fumes.", createdAt: iso() });
      }
      if (rollup.averageHumidityPct > 60 || (rollup.samples > 0 && rollup.averageHumidityPct < 30)) {
        recs.push({ id: id("rec"), roomId: rollup.roomId, priority: "MEDIUM", message: "Adjust humidity to stay in the comfort range.", createdAt: iso() });
      }
      if (recs.length === 0 && rollup.samples > 0) {
        recs.push({ id: id("rec"), roomId: rollup.roomId, priority: "LOW", message: "Air quality is stable in this room.", createdAt: iso() });
      }
      return recs;
    });
    return this.recommendations;
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

  retain(hours = 48, asOf: string | Date = new Date()) {
    const cutoff = new Date(asOf).getTime() - hours * 60 * 60_000;
    const before = this.readings.length;
    this.readings = this.readings.filter((reading) => new Date(reading.observedAt).getTime() >= cutoff);
    this.processed = new Set(this.readings.map((reading) => reading.eventKey));
    this.rebuildProjections(asOf);
    return { deleted: before - this.readings.length };
  }

  ensureJob(kind: Job["kind"]) {
    const dedupeKey = `${kind}:${iso().slice(0, 13)}`;
    const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey);
    if (existing) {
      return existing;
    }
    const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null };
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
      job.lastError = "simulated sensor batch timeout";
      return { processed: true, job };
    }
    if (job.kind === "ROLLUP_REBUILD") this.rebuildRollups();
    if (job.kind === "INCIDENT_REBUILD") this.rebuildIncidents();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(48);
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
      if (!result.processed || !result.job) break;
      processed += 1;
      if (result.job.status === "COMPLETED") completed += 1;
    }
    return { processed, completed };
  }

  snapshot() {
    const worst = [...this.rollups].sort((a, b) => a.airQualityScore - b.airQualityScore)[0];
    return {
      rooms: this.rooms,
      sensors: this.sensors,
      readings: [...this.readings].sort((a, b) => b.observedAt.localeCompare(a.observedAt)),
      rollups: this.rollups,
      incidents: this.incidents,
      alerts: this.alerts,
      recommendations: this.recommendations,
      jobs: this.jobs,
      audit: this.audit,
      metrics: {
        homeScore: this.rollups.length ? Math.round(average(this.rollups.map((rollup) => rollup.airQualityScore))) : 0,
        worstRoomId: worst?.roomId || null,
        openIncidents: this.incidents.filter((incident) => incident.status === "OPEN").length,
        staleSensors: this.rollups.reduce((sum, rollup) => sum + rollup.staleSensors, 0),
        averagePm25: Number(average(this.rollups.map((rollup) => rollup.averagePm25)).toFixed(1)),
        averageCo2Ppm: Math.round(average(this.rollups.map((rollup) => rollup.averageCo2Ppm))),
        queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length,
        queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length
      }
    };
  }

  exportState() {
    return {
      rooms: this.rooms,
      sensors: this.sensors,
      readings: this.readings,
      rollups: this.rollups,
      incidents: this.incidents,
      alerts: this.alerts,
      recommendations: this.recommendations,
      jobs: this.jobs,
      audit: this.audit,
      processed: [...this.processed]
    };
  }

  importState(state: Record<string, unknown>) {
    this.rooms = state.rooms as Room[];
    this.sensors = state.sensors as Sensor[];
    this.readings = state.readings as Reading[];
    this.rollups = state.rollups as RoomRollup[];
    this.incidents = state.incidents as Incident[];
    this.alerts = state.alerts as Alert[];
    this.recommendations = state.recommendations as Recommendation[];
    this.jobs = state.jobs as Job[];
    this.audit = state.audit as Audit[];
    this.processed = new Set(state.processed as string[]);
  }
}

function validateReading(input: ReadingInput) {
  if (input.pm25 < 0 || input.co2Ppm < 0 || input.vocIndex < 0) throw new Error("air metrics cannot be negative");
  if (input.humidityPct < 0 || input.humidityPct > 100) throw new Error("humidity must be between 0 and 100");
  if (input.temperatureF < -40 || input.temperatureF > 140) throw new Error("temperature is outside expected range");
}

function average(values: number[]) {
  const rows = values.filter((value) => Number.isFinite(value));
  return rows.length ? Number((rows.reduce((sum, value) => sum + value, 0) / rows.length).toFixed(1)) : 0;
}

function airQualityScore(values: Pick<RoomRollup, "averagePm25" | "averageCo2Ppm" | "averageVocIndex" | "averageHumidityPct" | "averageTemperatureF" | "staleSensors">) {
  const pmPenalty = Math.max(0, values.averagePm25 - 12) * 1.4;
  const co2Penalty = Math.max(0, values.averageCo2Ppm - 800) / 25;
  const vocPenalty = Math.max(0, values.averageVocIndex - 200) / 18;
  const humidityPenalty = values.averageHumidityPct === 0 ? 0 : Math.max(0, 35 - values.averageHumidityPct, values.averageHumidityPct - 55) * 1.5;
  const tempPenalty = values.averageTemperatureF === 0 ? 0 : Math.max(0, 65 - values.averageTemperatureF, values.averageTemperatureF - 78) * 1.8;
  return Math.max(0, Math.round(100 - pmPenalty - co2Penalty - vocPenalty - humidityPenalty - tempPenalty - values.staleSensors * 20));
}

function readingSignals(reading: Reading, room: Room): IncidentSignal[] {
  return [
    { roomId: room.id, kind: "PARTICULATE_SPIKE", active: reading.pm25 > 35, value: reading.pm25, at: reading.observedAt },
    { roomId: room.id, kind: "CO2_BUILDUP", active: reading.co2Ppm > Math.max(1100, room.targetCo2Ppm + 250), value: reading.co2Ppm, at: reading.observedAt },
    { roomId: room.id, kind: "VOC_SPIKE", active: reading.vocIndex > 500, value: reading.vocIndex, at: reading.observedAt },
    {
      roomId: room.id,
      kind: "HUMIDITY_OUT_OF_RANGE",
      active: reading.humidityPct < room.targetHumidityMin || reading.humidityPct > room.targetHumidityMax,
      value: reading.humidityPct,
      at: reading.observedAt
    }
  ];
}

export function createSeededMonitor(now: Date = new Date()) {
  const monitor = new AirQualityMonitor();
  monitor.seed(now);
  return monitor;
}
