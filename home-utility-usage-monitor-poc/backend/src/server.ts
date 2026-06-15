import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { createSeededMonitor, type Reading } from "./core.js";

const PORT = Number(process.env.PORT || 8184);
const HOST = process.env.HOST || "127.0.0.1";
const TOPIC = process.env.UTILITY_KAFKA_TOPIC || "utility.meter.readings";

const app = express();
let monitor = createSeededMonitor();
const infrastructure = await new Infrastructure().connect();
const persisted = await infrastructure.load();
if (persisted) monitor.importState(persisted);
else await infrastructure.save(monitor.exportState());

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function route(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await Promise.resolve(handler(req, res, next));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };
}

async function persist(reading?: Reading): Promise<void> {
  if (reading) await infrastructure.appendReading(reading);
  await infrastructure.save(monitor.exportState());
  await infrastructure.mirrorJobs(monitor.jobs as unknown as Array<Record<string, unknown>>);
}

async function ingestKafkaReading(message: Record<string, unknown>): Promise<void> {
  const ingestResult = monitor.ingestReading({ ...message, source: "kafka" } as never);
  if (ingestResult.reading) await persist(ingestResult.reading);
  else await persist();
}

await infrastructure.startKafkaConsumer(TOPIC, ingestKafkaReading);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    persistence: infrastructure.mode,
    kafka: infrastructure.kafkaMode,
    postgres: infrastructure.postgresMode,
    redis: infrastructure.redisMode,
    bufferedMessages: infrastructure.messages.length
  });
});

app.get("/api/snapshot", (_req, res) => res.json(monitor.snapshot()));

app.post("/api/readings", route(async (req, res) => {
  await infrastructure.publishReading(TOPIC, req.body.meterId, { ...req.body, source: "api" });
  const result = monitor.ingestReading({ ...req.body, source: "api" });
  if (result.reading) await persist(result.reading);
  else await persist();
  res.status(result.duplicate ? 200 : 202).json({ ...result, kafkaPublished: true });
}));

app.post("/api/readings/publish", route(async (req, res) => {
  await infrastructure.publishReading(TOPIC, req.body.meterId, req.body);
  res.status(202).json({ queued: true, kafka: infrastructure.kafkaMode, bufferedMessages: infrastructure.messages.length });
}));

app.post("/api/kafka/drain", route(async (_req, res) => {
  const result = await infrastructure.consumeMemoryMessages(ingestKafkaReading);
  await persist();
  res.json(result);
}));

app.post("/api/anomalies/run", route(async (req, res) => {
  const result = monitor.runAnomalyDetection(req.body.asOf || "2026-06-15T23:55:00.000Z");
  await persist();
  res.json(result);
}));

app.post("/api/reprocess", route(async (req, res) => {
  const result = monitor.reprocessRange(req.body.meterId, req.body.from, req.body.to);
  await persist();
  res.json(result);
}));

app.post("/api/alerts/:alertId/acknowledge", route(async (req, res) => {
  const alertId = Array.isArray(req.params.alertId) ? req.params.alertId[0] : req.params.alertId;
  const alert = monitor.acknowledgeAlert(alertId, req.body.actor || "user-vedant");
  await persist();
  res.json(alert);
}));

app.post("/api/workers/tick", route(async (_req, res) => {
  const result = monitor.workerTick();
  await persist();
  res.json(result);
}));

app.post("/api/workers/drain", route(async (req, res) => {
  const maxJobs = Array.isArray(req.query.maxJobs) ? req.query.maxJobs[0] : req.query.maxJobs;
  const result = monitor.drainWorkers(Number(maxJobs || 50));
  await persist();
  res.json(result);
}));

app.post("/api/workers/fail-next", (_req, res) => {
  monitor.failNextDelivery = true;
  res.json({ armed: true });
});

app.post("/api/reset", route(async (_req, res) => {
  monitor = createSeededMonitor();
  await persist();
  res.json(monitor.snapshot());
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`Utility monitor API listening on http://${HOST}:${PORT} (${infrastructure.mode})`);
});

async function shutdown(): Promise<void> {
  server.close();
  await infrastructure.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
