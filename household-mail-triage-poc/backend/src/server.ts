import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { createSeededTriage, mailEventKey, type MailEvent } from "./core.js";

const PORT = Number(process.env.PORT || 8200);
const HOST = process.env.HOST || "127.0.0.1";
const TOPIC = process.env.MAIL_EVENT_TOPIC || "household.mail.events";

const app = express();
let triage = createSeededTriage();
const infra = await new Infrastructure().connect();
const saved = await infra.load();

if (saved) triage.importState(saved);
else await infra.save(triage.exportState());

app.use(cors());
app.use(express.json());

const route = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await Promise.resolve(handler(req, res, next)); } catch (error) { res.status(400).json({ error: (error as Error).message }); }
};

async function persist(event?: MailEvent) { if (event) await infra.append(event.eventKey, event as unknown as Record<string, unknown>); await infra.save(triage.exportState()); }
async function processEvent(message: Record<string, unknown>) { const result = triage.ingest({ ...message, source: "kafka" } as never); await persist(result.event); }

await infra.consume(TOPIC, processEvent);

app.get("/api/health", (_req, res) => res.json({ status: "ok", persistence: infra.mode, kafka: infra.kafkaMode, postgres: infra.postgresMode, redis: infra.redisMode, bufferedMessages: infra.messages.length }));
app.get("/api/snapshot", (_req, res) => res.json(triage.snapshot()));
app.post("/api/events", route(async (req, res) => {
  const input = { ...req.body, source: "api" };
  await infra.publish(TOPIC, input.mailId, input);
  const result = triage.ingest(input);
  await persist(result.event);
  res.status(result.duplicate ? 200 : 202).json(result);
}));
app.post("/api/events/publish", route(async (req, res) => {
  triage.mailById(req.body.mailId);
  mailEventKey(req.body);
  await infra.publish(TOPIC, req.body.mailId, req.body);
  res.status(202).json({ queued: true, bufferedMessages: infra.messages.length });
}));
app.post("/api/kafka/drain", route(async (_req, res) => { const result = await infra.drain(TOPIC, processEvent); await persist(); res.json(result); }));
app.post("/api/jobs", route(async (req, res) => { const job = triage.ensureJob(req.body.kind); await persist(); res.status(202).json(job); }));
app.post("/api/jobs/fail-next", (_req, res) => { triage.failNextJob = true; res.json({ armed: true }); });
app.post("/api/jobs/drain", route(async (_req, res) => { const result = triage.drainJobs(); await persist(); res.json(result); }));
app.post("/api/reset", route(async (_req, res) => { triage = createSeededTriage(); await persist(); res.json(triage.snapshot()); }));

const server = app.listen(PORT, HOST, () => console.log(`Mail triage API listening on http://${HOST}:${PORT} (${infra.mode})`));
async function stop() { server.close(); await infra.close(); process.exit(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
