import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { createSeededAutomation, type HomeEvent } from "./core.js";

const PORT = Number(process.env.PORT || 8185);
const HOST = process.env.HOST || "127.0.0.1";
const EVENT_TOPIC = process.env.AUTOMATION_EVENT_TOPIC || "home.automation.events";

const app = express();
let automation = createSeededAutomation();
const infrastructure = await new Infrastructure().connect();
const persisted = await infrastructure.load();
if (persisted) automation.importState(persisted);
else await infrastructure.save(automation.exportState());

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

async function persist(event?: HomeEvent): Promise<void> {
  if (event) await infrastructure.appendEvent(EVENT_TOPIC, event.eventKey, event as unknown as Record<string, unknown>);
  await infrastructure.save(automation.exportState());
  await infrastructure.mirrorCommands(automation.commands as unknown as Array<Record<string, unknown>>);
}

async function processHomeEvent(message: Record<string, unknown>): Promise<void> {
  const result = automation.ingestEvent({ ...message, source: "kafka" } as never);
  if (result.event) await persist(result.event);
  else await persist();
}

await infrastructure.startConsumer(EVENT_TOPIC, processHomeEvent);

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

app.get("/api/snapshot", (_req, res) => res.json(automation.snapshot()));

app.post("/api/events", route(async (req, res) => {
  await infrastructure.publish(EVENT_TOPIC, req.body.type, { ...req.body, source: "api" });
  const result = automation.ingestEvent({ ...req.body, source: "api" });
  if (result.event) await persist(result.event);
  else await persist();
  res.status(result.duplicate ? 200 : 202).json({ ...result, kafkaPublished: true });
}));

app.post("/api/events/publish", route(async (req, res) => {
  await infrastructure.publish(EVENT_TOPIC, req.body.type, req.body);
  res.status(202).json({ queued: true, kafka: infrastructure.kafkaMode, bufferedMessages: infrastructure.messages.length });
}));

app.post("/api/kafka/drain", route(async (_req, res) => {
  const result = await infrastructure.drainMemory(EVENT_TOPIC, processHomeEvent);
  await persist();
  res.json(result);
}));

app.post("/api/rules/:ruleId/toggle", route(async (req, res) => {
  const ruleId = Array.isArray(req.params.ruleId) ? req.params.ruleId[0] : req.params.ruleId;
  const rule = automation.toggleRule(ruleId, Boolean(req.body.enabled), req.body.actor || "user-vedant");
  await persist();
  res.json(rule);
}));

app.post("/api/home-mode", route(async (req, res) => {
  automation.setHomeMode(req.body.mode, req.body.actor || "user-vedant");
  await persist();
  res.json(automation.snapshot());
}));

app.post("/api/manual-override", route(async (req, res) => {
  automation.setManualOverride(Number(req.body.minutes || 0), req.body.actor || "user-vedant");
  await persist();
  res.json(automation.snapshot());
}));

app.post("/api/commands/fail-next", (_req, res) => {
  automation.failNextCommand = true;
  res.json({ armed: true });
});

app.post("/api/commands/tick", route(async (_req, res) => {
  const result = automation.dispatchNextCommand();
  await persist();
  res.json(result);
}));

app.post("/api/commands/drain", route(async (req, res) => {
  const result = automation.drainCommands(Number(req.query.max || 50));
  await persist();
  res.json(result);
}));

app.post("/api/commands/:commandId/ack", route(async (req, res) => {
  const commandId = Array.isArray(req.params.commandId) ? req.params.commandId[0] : req.params.commandId;
  const command = automation.acknowledgeCommand(commandId, req.body.actor || "device-gateway");
  await persist();
  res.json(command);
}));

app.post("/api/replay", route(async (req, res) => {
  const result = automation.replayEvents(req.body.from, req.body.to);
  await persist();
  res.json(result);
}));

app.post("/api/reset", route(async (_req, res) => {
  automation = createSeededAutomation();
  await persist();
  res.json(automation.snapshot());
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`Smart home automation API listening on http://${HOST}:${PORT} (${infrastructure.mode})`);
});

async function shutdown(): Promise<void> {
  server.close();
  await infrastructure.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
