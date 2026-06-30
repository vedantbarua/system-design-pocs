import crypto from "node:crypto";

export type PlantEventType = "SENSOR_READING" | "WATERED" | "CARE_SKIPPED" | "SENSOR_OFFLINE" | "SENSOR_ONLINE";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";
export type Plant = { id: string; name: string; species: string; room: string; idealMoistureMin: number; idealMoistureMax: number; idealLightMin: number; wateringIntervalHours: number; lastWateredAt: string };
export type Sensor = { id: string; plantId: string; name: string; status: "ONLINE" | "OFFLINE" | "STALE"; lastSeenAt: string };
export type PlantReading = { id: string; plantId: string; sensorId: string; moisturePct: number; lightLux: number; temperatureF: number; observedAt: string };
export type PlantEventInput = { eventId: string; plantId: string; sensorId: string; type: PlantEventType; moisturePct?: number; lightLux?: number; temperatureF?: number; observedAt?: string; notes?: string; source?: string };
export type PlantEvent = Required<Omit<PlantEventInput, "moisturePct" | "lightLux" | "temperatureF" | "observedAt" | "notes" | "source">> & { id: string; eventKey: string; moisturePct: number; lightLux: number; temperatureF: number; observedAt: string; receivedAt: string; notes: string; source: string };
export type PlantStatus = { plantId: string; moisturePct: number; lightLux: number; temperatureF: number; careState: "OK" | "DRY" | "OVERWATERED" | "LOW_LIGHT" | "MISSED_WATERING" | "STALE_SENSOR"; nextWateringAt: string; updatedAt: string };
export type Alert = { id: string; plantId: string; kind: "DRY_PLANT" | "OVERWATER_RISK" | "LOW_LIGHT" | "MISSED_WATERING" | "SENSOR_STALE"; status: "QUEUED" | "SENT"; dedupeKey: string; createdAt: string; sentAt: string | null };
export type Reminder = { id: string; plantId: string; channel: "PUSH" | "SMS"; status: "QUEUED" | "SENT"; dedupeKey: string; scheduledFor: string; sentAt: string | null };
export type Job = { id: string; kind: "CARE_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION"; status: JobStatus; attempts: number; dedupeKey: string; queuedAt: string; completedAt: string | null; lastError: string | null };
export type Audit = { id: string; action: string; details: Record<string, unknown>; at: string };

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export function iso(value: string | number | Date = new Date()) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new Error("invalid timestamp"); return date.toISOString(); }
export function addMinutes(minutes: number, value: string | number | Date = new Date()) { return new Date(new Date(value).getTime() + minutes * 60_000).toISOString(); }
export function plantEventKey(input: Pick<PlantEventInput, "sensorId" | "eventId">) { if (!input.sensorId || !input.eventId) throw new Error("sensorId and eventId are required"); return `${input.sensorId}:${input.eventId}`; }

export class PlantCareMonitor {
  plants: Plant[] = [];
  sensors: Sensor[] = [];
  readings: PlantReading[] = [];
  events: PlantEvent[] = [];
  statuses: PlantStatus[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.plants = [
      { id: "plant-monstera", name: "Mira", species: "Monstera", room: "Living room", idealMoistureMin: 35, idealMoistureMax: 65, idealLightMin: 900, wateringIntervalHours: 96, lastWateredAt: addMinutes(-6200, now) },
      { id: "plant-basil", name: "Basil", species: "Sweet basil", room: "Kitchen", idealMoistureMin: 45, idealMoistureMax: 75, idealLightMin: 1400, wateringIntervalHours: 36, lastWateredAt: addMinutes(-2500, now) },
      { id: "plant-snake", name: "Sora", species: "Snake plant", room: "Office", idealMoistureMin: 20, idealMoistureMax: 45, idealLightMin: 500, wateringIntervalHours: 48, lastWateredAt: addMinutes(-2400, now) },
      { id: "plant-fern", name: "Fern", species: "Boston fern", room: "Bathroom", idealMoistureMin: 55, idealMoistureMax: 80, idealLightMin: 650, wateringIntervalHours: 48, lastWateredAt: addMinutes(-3100, now) }
    ];
    this.sensors = this.plants.map((plant, index) => ({ id: `sensor-${plant.id.split("-")[1]}`, plantId: plant.id, name: `${plant.name} sensor`, status: index === 3 ? "STALE" : "ONLINE", lastSeenAt: index === 3 ? addMinutes(-260, now) : iso(now) }));
    this.readings = []; this.events = []; this.statuses = []; this.alerts = []; this.reminders = []; this.jobs = []; this.audit = []; this.processed = new Set(); this.failNextJob = false;
    const rows = [["plant-monstera", "sensor-monstera", 24, 1200, 72], ["plant-basil", "sensor-basil", 82, 950, 73], ["plant-snake", "sensor-snake", 32, 380, 71], ["plant-fern", "sensor-fern", 62, 700, 70]] as const;
    let sequence = 0;
    for (const [plantId, sensorId, moisturePct, lightLux, temperatureF] of rows) this.ingest({ eventId: `seed-${sequence++}`, plantId, sensorId, type: "SENSOR_READING", moisturePct, lightLux, temperatureF, observedAt: addMinutes(-20 + sequence, now), source: "seed" });
    this.sensor("sensor-fern").status = "STALE";
    this.sensor("sensor-fern").lastSeenAt = addMinutes(-260, now);
    this.scanCare(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { plants: this.plants.length, alerts: this.alerts.length });
  }

  createAudit(action: string, details: Record<string, unknown>) { const audit = { id: id("audit"), action, details, at: iso() }; this.audit.unshift(audit); return audit; }
  plant(plantId: string) { const plant = this.plants.find((candidate) => candidate.id === plantId); if (!plant) throw new Error("plant not found"); return plant; }
  sensor(sensorId: string, plantId?: string) { const sensor = this.sensors.find((candidate) => candidate.id === sensorId && (!plantId || candidate.plantId === plantId)); if (!sensor) throw new Error("sensor not found"); return sensor; }

  ingest(input: PlantEventInput) {
    const plant = this.plant(input.plantId);
    const sensor = this.sensor(input.sensorId, input.plantId);
    const eventKey = plantEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    validateInput(input);
    const observedAt = iso(input.observedAt || new Date());
    const prior = latest(this.readings.filter((reading) => reading.plantId === input.plantId));
    const event: PlantEvent = { id: id("event"), eventId: input.eventId, eventKey, plantId: input.plantId, sensorId: input.sensorId, type: input.type, moisturePct: input.moisturePct ?? prior?.moisturePct ?? 50, lightLux: input.lightLux ?? prior?.lightLux ?? 800, temperatureF: input.temperatureF ?? prior?.temperatureF ?? 72, observedAt, receivedAt: iso(), notes: input.notes || "", source: input.source || "api" };
    this.events.push(event); this.processed.add(eventKey); sensor.lastSeenAt = observedAt;
    if (event.type === "SENSOR_READING") { sensor.status = "ONLINE"; this.readings.push({ id: id("reading"), plantId: event.plantId, sensorId: event.sensorId, moisturePct: event.moisturePct, lightLux: event.lightLux, temperatureF: event.temperatureF, observedAt }); }
    if (event.type === "WATERED") { plant.lastWateredAt = observedAt; this.readings.push({ id: id("reading"), plantId: event.plantId, sensorId: event.sensorId, moisturePct: Math.max(event.moisturePct, plant.idealMoistureMin + 10), lightLux: event.lightLux, temperatureF: event.temperatureF, observedAt }); }
    if (event.type === "SENSOR_OFFLINE") { sensor.status = "OFFLINE"; this.ensureAlert(plant, "SENSOR_STALE", `offline:${sensor.id}`); }
    if (event.type === "SENSOR_ONLINE") sensor.status = "ONLINE";
    this.rebuildStatus(plant.id, observedAt); this.scanCare(observedAt); this.createAudit("PLANT_EVENT_INGESTED", { eventId: event.id, plantId: plant.id, type: event.type });
    return { duplicate: false, event };
  }

  rebuildStatus(plantId: string, asOf: string | Date = new Date()) {
    const plant = this.plant(plantId), sensor = this.sensors.find((candidate) => candidate.plantId === plantId), reading = latest(this.readings.filter((candidate) => candidate.plantId === plantId));
    if (!reading) return null;
    const nextWateringAt = addMinutes(plant.wateringIntervalHours * 60, plant.lastWateredAt);
    const staleSensor = !sensor || new Date(asOf).getTime() - new Date(sensor.lastSeenAt).getTime() > 180 * 60_000 || sensor.status !== "ONLINE";
    let careState: PlantStatus["careState"] = "OK";
    if (staleSensor) careState = "STALE_SENSOR"; else if (new Date(nextWateringAt).getTime() < new Date(asOf).getTime()) careState = "MISSED_WATERING"; else if (reading.moisturePct < plant.idealMoistureMin) careState = "DRY"; else if (reading.moisturePct > plant.idealMoistureMax) careState = "OVERWATERED"; else if (reading.lightLux < plant.idealLightMin) careState = "LOW_LIGHT";
    const status: PlantStatus = { plantId, moisturePct: reading.moisturePct, lightLux: reading.lightLux, temperatureF: reading.temperatureF, careState, nextWateringAt, updatedAt: iso(asOf) };
    const index = this.statuses.findIndex((candidate) => candidate.plantId === plantId);
    if (index >= 0) this.statuses[index] = status; else this.statuses.push(status);
    return status;
  }

  scanCare(asOf: string | Date = new Date()) {
    for (const plant of this.plants) {
      const status = this.rebuildStatus(plant.id, asOf); if (!status) continue;
      if (status.careState === "DRY") this.ensureAlert(plant, "DRY_PLANT", `dry:${plant.id}`);
      if (status.careState === "OVERWATERED") this.ensureAlert(plant, "OVERWATER_RISK", `overwater:${plant.id}`);
      if (status.careState === "LOW_LIGHT") this.ensureAlert(plant, "LOW_LIGHT", `light:${plant.id}`);
      if (status.careState === "MISSED_WATERING") this.ensureAlert(plant, "MISSED_WATERING", `missed:${plant.id}`);
      if (status.careState === "STALE_SENSOR") this.ensureAlert(plant, "SENSOR_STALE", `stale:${plant.id}`);
      const minutesUntilWater = (new Date(status.nextWateringAt).getTime() - new Date(asOf).getTime()) / 60_000;
      if (minutesUntilWater <= 12 * 60 && minutesUntilWater >= -60) this.ensureReminder(plant, addMinutes(-180, status.nextWateringAt));
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  ensureAlert(plant: Plant, kind: Alert["kind"], dedupeKey: string) { let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey); if (!alert) { alert = { id: id("alert"), plantId: plant.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null }; this.alerts.unshift(alert); } return alert; }
  ensureReminder(plant: Plant, scheduledFor: string) { const dedupeKey = `reminder:${plant.id}`; let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey); if (!reminder) { reminder = { id: id("reminder"), plantId: plant.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null }; this.reminders.unshift(reminder); } return reminder; }
  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  dispatchReminders() { let sent = 0; for (const reminder of this.reminders.filter((candidate) => candidate.status === "QUEUED")) { reminder.status = "SENT"; reminder.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 30, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000, before = this.events.length; this.events = this.events.filter((event) => new Date(event.observedAt).getTime() >= cutoff); this.readings = this.readings.filter((reading) => new Date(reading.observedAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`, existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() { const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY"); if (!job) return { processed: false }; job.attempts += 1; if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated reminder provider timeout"; return { processed: true, job }; } if (job.kind === "CARE_SCAN") this.scanCare(); if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders(); if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts(); if (job.kind === "RETENTION") this.retain(30); job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job }; }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { plants: this.plants, sensors: this.sensors, readings: [...this.readings].sort((a, b) => b.observedAt.localeCompare(a.observedAt)), events: [...this.events].sort((a, b) => b.observedAt.localeCompare(a.observedAt)), statuses: [...this.statuses].sort((a, b) => a.careState.localeCompare(b.careState)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { plants: this.plants.length, healthyPlants: this.statuses.filter((status) => status.careState === "OK").length, dryPlants: this.statuses.filter((status) => status.careState === "DRY" || status.careState === "MISSED_WATERING").length, staleSensors: this.statuses.filter((status) => status.careState === "STALE_SENSOR").length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { plants: this.plants, sensors: this.sensors, readings: this.readings, events: this.events, statuses: this.statuses, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.plants = state.plants as Plant[]; this.sensors = state.sensors as Sensor[]; this.readings = state.readings as PlantReading[]; this.events = state.events as PlantEvent[]; this.statuses = state.statuses as PlantStatus[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

function validateInput(input: PlantEventInput) { if (input.moisturePct !== undefined && (input.moisturePct < 0 || input.moisturePct > 100)) throw new Error("moisture must be between 0 and 100"); if (input.lightLux !== undefined && input.lightLux < 0) throw new Error("light cannot be negative"); if (input.temperatureF !== undefined && (input.temperatureF < -20 || input.temperatureF > 130)) throw new Error("temperature is outside expected range"); }
function latest<T extends { observedAt: string }>(rows: T[]) { return [...rows].sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] || null; }
export function createSeededMonitor(now: Date = new Date()) { const monitor = new PlantCareMonitor(); monitor.seed(now); return monitor; }
