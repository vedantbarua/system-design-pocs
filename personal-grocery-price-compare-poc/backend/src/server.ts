import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { createSeededGroceryCompare, priceEventKey, type PriceEvent } from "./core.js";

const PORT = Number(process.env.PORT || 8344);
const HOST = process.env.HOST || "127.0.0.1";
const TOPIC = process.env.GROCERY_EVENT_TOPIC || "personal.grocery-price.events";

const app = express();
let compare = createSeededGroceryCompare();
const infra = await new Infrastructure().connect();
const saved = await infra.load();

if (saved) compare.importState(saved);
else await infra.save(compare.exportState());

app.use(cors());
app.use(express.json());

const route = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await Promise.resolve(handler(req, res, next)); } catch (error) { res.status(400).json({ error: (error as Error).message }); }
};

async function persist(event?: PriceEvent) { if (event) await infra.append(event.eventKey, event as unknown as Record<string, unknown>); await infra.save(compare.exportState()); }
async function processEvent(message: Record<string, unknown>) { const result = compare.ingest({ ...message, source: "kafka" } as never); await persist(result.event); }

await infra.consume(TOPIC, processEvent);

app.get("/api/health", (_req, res) => res.json({ status: "ok", persistence: infra.mode, kafka: infra.kafkaMode, postgres: infra.postgresMode, redis: infra.redisMode, bufferedMessages: infra.messages.length }));
app.get("/api/snapshot", (_req, res) => res.json(compare.snapshot()));
app.post("/api/events", route(async (req, res) => {
  const input = { ...req.body, source: "api" };
  await infra.publish(TOPIC, input.itemId, input);
  const result = compare.ingest(input);
  await persist(result.event);
  res.status(result.duplicate ? 200 : 202).json(result);
}));
app.post("/api/events/publish", route(async (req, res) => {
  compare.itemById(req.body.itemId);
  priceEventKey(req.body);
  await infra.publish(TOPIC, req.body.itemId, req.body);
  res.status(202).json({ queued: true, bufferedMessages: infra.messages.length });
}));
app.post("/api/kafka/drain", route(async (_req, res) => { const result = await infra.drain(TOPIC, processEvent); await persist(); res.json(result); }));
app.post("/api/jobs", route(async (req, res) => { const job = compare.ensureJob(req.body.kind); await persist(); res.status(202).json(job); }));
app.post("/api/jobs/fail-next", (_req, res) => { compare.failNextJob = true; res.json({ armed: true }); });
app.post("/api/jobs/drain", route(async (_req, res) => { const result = compare.drainJobs(); await persist(); res.json(result); }));
app.post("/api/reset", route(async (_req, res) => { compare = createSeededGroceryCompare(); await persist(); res.json(compare.snapshot()); }));

const server = app.listen(PORT, HOST, () => console.log(`Personal grocery price compare API listening on http://${HOST}:${PORT} (${infra.mode})`));
async function stop() { server.close(); await infra.close(); process.exit(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
