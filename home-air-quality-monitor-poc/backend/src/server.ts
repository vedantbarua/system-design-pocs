import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { createSeededMonitor, readingKey, type Reading } from "./core.js";

const PORT = Number(process.env.PORT || 8194);
const HOST = process.env.HOST || "127.0.0.1";
const TOPIC = process.env.AIR_READING_TOPIC || "home.air.readings";

const app = express();
let monitor = createSeededMonitor();
const infra = await new Infrastructure().connect();
const saved = await infra.load();

if (saved) {
  monitor.importState(saved);
} else {
  await infra.save(monitor.exportState());
}

app.use(cors());
app.use(express.json());

const route =
  (handler: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    try {
      await Promise.resolve(handler(req, res, next));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };

async function persist(reading?: Reading) {
  if (reading) await infra.append(reading.eventKey, reading as unknown as Record<string, unknown>);
  await infra.save(monitor.exportState());
}

async function processReading(message: Record<string, unknown>) {
  const result = monitor.ingest({ ...message, source: "kafka" } as never);
  await persist(result.reading);
}

await infra.consume(TOPIC, processReading);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    persistence: infra.mode,
    kafka: infra.kafkaMode,
    postgres: infra.postgresMode,
    redis: infra.redisMode,
    bufferedMessages: infra.messages.length
  });
});

app.get("/api/snapshot", (_req, res) => {
  res.json(monitor.snapshot());
});

app.post(
  "/api/readings",
  route(async (req, res) => {
    const input = {
      ...req.body,
      pm25: Number(req.body.pm25),
      co2Ppm: Number(req.body.co2Ppm),
      vocIndex: Number(req.body.vocIndex),
      humidityPct: Number(req.body.humidityPct),
      temperatureF: Number(req.body.temperatureF),
      source: "api"
    };
    await infra.publish(TOPIC, input.sensorId, input);
    const result = monitor.ingest(input);
    await persist(result.reading);
    res.status(result.duplicate ? 200 : 202).json(result);
  })
);

app.post(
  "/api/readings/publish",
  route(async (req, res) => {
    monitor.findRoom(req.body.roomId);
    monitor.findSensor(req.body.sensorId, req.body.roomId);
    readingKey(req.body);
    await infra.publish(TOPIC, req.body.sensorId, req.body);
    res.status(202).json({ queued: true, bufferedMessages: infra.messages.length });
  })
);

app.post(
  "/api/kafka/drain",
  route(async (_req, res) => {
    const result = await infra.drain(TOPIC, processReading);
    await persist();
    res.json(result);
  })
);

app.post(
  "/api/jobs",
  route(async (req, res) => {
    const job = monitor.ensureJob(req.body.kind);
    await persist();
    res.status(202).json(job);
  })
);

app.post("/api/jobs/fail-next", (_req, res) => {
  monitor.failNextJob = true;
  res.json({ armed: true });
});

app.post(
  "/api/jobs/drain",
  route(async (_req, res) => {
    const result = monitor.drainJobs();
    await persist();
    res.json(result);
  })
);

app.post(
  "/api/reset",
  route(async (_req, res) => {
    monitor = createSeededMonitor();
    await persist();
    res.json(monitor.snapshot());
  })
);

const server = app.listen(PORT, HOST, () => {
  console.log(`Home air quality API listening on http://${HOST}:${PORT} (${infra.mode})`);
});

async function stop() {
  server.close();
  await infra.close();
  process.exit();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
