import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { createSeededFinder, resourceEventKey, type ResourceEvent, type SearchQuery } from "./core.js";

const PORT = Number(process.env.PORT || 8290);
const HOST = process.env.HOST || "127.0.0.1";
const TOPIC = process.env.RESOURCE_EVENT_TOPIC || "local.community.resources.events";

const app = express();
let finder = createSeededFinder();
const infra = await new Infrastructure().connect();
const saved = await infra.load();

if (saved) finder.importState(saved);
else await infra.save(finder.exportState());

app.use(cors());
app.use(express.json());

const route = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await Promise.resolve(handler(req, res, next)); } catch (error) { res.status(400).json({ error: (error as Error).message }); }
};

async function persist(event?: ResourceEvent) { if (event) await infra.append(event.eventKey, event as unknown as Record<string, unknown>); await infra.save(finder.exportState()); }
async function processEvent(message: Record<string, unknown>) { const result = finder.ingest({ ...message, source: "kafka" } as never); await persist(result.event); }

await infra.consume(TOPIC, processEvent);

app.get("/api/health", (_req, res) => res.json({ status: "ok", persistence: infra.mode, kafka: infra.kafkaMode, postgres: infra.postgresMode, redis: infra.redisMode, bufferedMessages: infra.messages.length }));
app.get("/api/snapshot", (_req, res) => res.json(finder.snapshot()));
app.get("/api/search", route((req, res) => {
  const query: SearchQuery = {
    category: req.query.category as never,
    zipCode: req.query.zipCode as string | undefined,
    language: req.query.language as string | undefined,
    eligibility: req.query.eligibility as string | undefined,
    needsOpenNow: req.query.needsOpenNow === "true",
    maxDocuments: req.query.maxDocuments ? Number(req.query.maxDocuments) : undefined
  };
  res.json(finder.search(query));
}));
app.post("/api/events", route(async (req, res) => {
  const input = { ...req.body, source: "api" };
  await infra.publish(TOPIC, input.resourceId, input);
  const result = finder.ingest(input);
  await persist(result.event);
  res.status(result.duplicate ? 200 : 202).json(result);
}));
app.post("/api/events/publish", route(async (req, res) => {
  finder.resourceById(req.body.resourceId);
  resourceEventKey(req.body);
  await infra.publish(TOPIC, req.body.resourceId, req.body);
  res.status(202).json({ queued: true, bufferedMessages: infra.messages.length });
}));
app.post("/api/kafka/drain", route(async (_req, res) => { const result = await infra.drain(TOPIC, processEvent); await persist(); res.json(result); }));
app.post("/api/jobs", route(async (req, res) => { const job = finder.ensureJob(req.body.kind); await persist(); res.status(202).json(job); }));
app.post("/api/jobs/fail-next", (_req, res) => { finder.failNextJob = true; res.json({ armed: true }); });
app.post("/api/jobs/drain", route(async (_req, res) => { const result = finder.drainJobs(); await persist(); res.json(result); }));
app.post("/api/reset", route(async (_req, res) => { finder = createSeededFinder(); await persist(); res.json(finder.snapshot()); }));

const server = app.listen(PORT, HOST, () => console.log(`Community resource finder API listening on http://${HOST}:${PORT} (${infra.mode})`));
async function stop() { server.close(); await infra.close(); process.exit(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
