import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { completionEventKey, createSeededCoordinator, type CompletionEvent } from "./core.js";

const PORT = Number(process.env.PORT || 8189);
const HOST = process.env.HOST || "127.0.0.1";
const COMPLETION_TOPIC = process.env.CHORE_COMPLETION_TOPIC || "chores.task.completions";

const app = express();
let coordinator = createSeededCoordinator();
const infrastructure = await new Infrastructure().connect();
const persisted = await infrastructure.load();
if (persisted) coordinator.importState(persisted);
else await infrastructure.save(coordinator.exportState());

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

async function persist(event?: CompletionEvent): Promise<void> {
  if (event) await infrastructure.appendCompletion(COMPLETION_TOPIC, event.eventKey, event as unknown as Record<string, unknown>);
  await infrastructure.save(coordinator.exportState());
  await infrastructure.mirrorProjections(coordinator.tasks, coordinator.reminders, coordinator.jobs);
}

async function processCompletion(message: Record<string, unknown>): Promise<void> {
  const result = coordinator.completeTask({ ...message, source: message.source || "kafka" } as never);
  await persist(result.event);
}

await infrastructure.startConsumer(COMPLETION_TOPIC, processCompletion);

app.get("/api/health", (_req, res) => res.json({
  status: "ok", persistence: infrastructure.mode, kafka: infrastructure.kafkaMode,
  postgres: infrastructure.postgresMode, redis: infrastructure.redisMode,
  bufferedMessages: infrastructure.messages.length
}));

app.get("/api/snapshot", (_req, res) => res.json(coordinator.snapshot()));

app.post("/api/definitions", route(async (req, res) => {
  const definition = coordinator.addDefinition({ ...req.body, recurrenceDays: Number(req.body.recurrenceDays), effortPoints: Number(req.body.effortPoints) });
  coordinator.materializeOccurrences(14);
  await persist();
  res.status(201).json(definition);
}));

app.post("/api/materialize", route(async (req, res) => {
  const result = coordinator.materializeOccurrences(Number(req.body.horizonDays ?? 14), req.body.asOf || new Date());
  await persist();
  res.json(result);
}));

app.post("/api/tasks/:id/claim", route(async (req, res) => {
  const lease = coordinator.claimTask(String(req.params.id), req.body.memberId, Number(req.body.ttlMinutes ?? 15), req.body.now || new Date());
  await persist();
  res.status(201).json(lease);
}));

app.post("/api/tasks/:id/release", route(async (req, res) => {
  const task = coordinator.releaseClaim(String(req.params.id), req.body.memberId, Number(req.body.fencingToken));
  await persist();
  res.json(task);
}));

app.post("/api/completions", route(async (req, res) => {
  const input = { ...req.body, source: req.body.source || "api" };
  await infrastructure.publish(COMPLETION_TOPIC, input.taskId, input);
  const result = coordinator.completeTask(input);
  await persist(result.event);
  res.status(result.duplicate ? 200 : 202).json({ ...result, kafkaPublished: true });
}));

app.post("/api/completions/publish", route(async (req, res) => {
  coordinator.findTask(req.body.taskId);
  completionEventKey(req.body);
  await infrastructure.publish(COMPLETION_TOPIC, req.body.taskId, { ...req.body, source: "offline" });
  res.status(202).json({ queued: true, kafka: infrastructure.kafkaMode, bufferedMessages: infrastructure.messages.length });
}));

app.post("/api/kafka/drain", route(async (_req, res) => {
  const result = await infrastructure.drainMemory(COMPLETION_TOPIC, processCompletion);
  await persist();
  res.json(result);
}));

app.post("/api/scans/overdue", route(async (req, res) => {
  const result = coordinator.scanOverdue(req.body.asOf || new Date());
  await persist();
  res.json(result);
}));

app.post("/api/jobs", route(async (req, res) => {
  const job = coordinator.queueJob(req.body.kind, req.body.payload || {});
  await persist();
  res.status(202).json(job);
}));

app.post("/api/jobs/fail-next", (_req, res) => {
  coordinator.failNextJob = true;
  res.json({ armed: true });
});

app.post("/api/jobs/tick", route(async (_req, res) => {
  const result = coordinator.dispatchNextJob();
  await persist();
  res.json(result);
}));

app.post("/api/jobs/drain", route(async (req, res) => {
  const result = coordinator.drainJobs(Number(req.query.max || 50));
  await persist();
  res.json(result);
}));

app.post("/api/reset", route(async (_req, res) => {
  coordinator = createSeededCoordinator();
  await persist();
  res.json(coordinator.snapshot());
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`Household chore coordinator API listening on http://${HOST}:${PORT} (${infrastructure.mode})`);
});

async function shutdown(): Promise<void> {
  server.close();
  await infrastructure.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
