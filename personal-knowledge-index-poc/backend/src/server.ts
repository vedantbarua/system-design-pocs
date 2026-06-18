import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { createSeededKnowledgeIndex, eventKey, type KnowledgeDocument } from "./core.js";

const PORT = Number(process.env.PORT || 8187);
const HOST = process.env.HOST || "127.0.0.1";
const DOCUMENT_TOPIC = process.env.KNOWLEDGE_DOCUMENT_TOPIC || "knowledge.document.changes";

const app = express();
let knowledge = createSeededKnowledgeIndex();
const infrastructure = await new Infrastructure().connect();
const persisted = await infrastructure.load();
if (persisted) knowledge.importState(persisted);
else await infrastructure.save(knowledge.exportState());

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function route(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await Promise.resolve(handler(req, res, next));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  };
}

async function persist(document?: KnowledgeDocument): Promise<void> {
  if (document) await infrastructure.appendEvent(DOCUMENT_TOPIC, document.eventKey, document as unknown as Record<string, unknown>);
  await infrastructure.save(knowledge.exportState());
  await infrastructure.mirrorJobs(knowledge.jobs as unknown as Array<Record<string, unknown>>);
}

async function processDocument(message: Record<string, unknown>): Promise<void> {
  const result = knowledge.ingestDocument({ ...message, source: "kafka" } as never);
  if (result.document) await persist(result.document);
  else await persist();
}

await infrastructure.startConsumer(DOCUMENT_TOPIC, processDocument);

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

app.get("/api/snapshot", (_req, res) => res.json(knowledge.snapshot()));

app.post("/api/documents", route(async (req, res) => {
  await infrastructure.publish(DOCUMENT_TOPIC, req.body.path, { ...req.body, source: "api" });
  const result = knowledge.ingestDocument({ ...req.body, source: "api" });
  if (result.document) await persist(result.document);
  else await persist();
  res.status(result.duplicate ? 200 : 202).json({ ...result, kafkaPublished: true });
}));

app.post("/api/documents/publish", route(async (req, res) => {
  await infrastructure.publish(DOCUMENT_TOPIC, req.body.path, req.body);
  res.status(202).json({ queued: true, kafka: infrastructure.kafkaMode, bufferedMessages: infrastructure.messages.length });
}));

app.post("/api/kafka/drain", route(async (_req, res) => {
  const result = await infrastructure.drainMemory(DOCUMENT_TOPIC, processDocument);
  await persist();
  res.json(result);
}));

app.get("/api/search", route(async (req, res) => {
  const q = String(req.query.q || "");
  const actor = String(req.query.actor || "vedant");
  const mode = String(req.query.mode || "hybrid") as "keyword" | "semantic" | "hybrid";
  const result = knowledge.search(q, actor, mode);
  await infrastructure.cacheSearch(`${actor}:${mode}:${q.toLowerCase()}`, result.results);
  await persist();
  res.json(result);
}));

app.post("/api/jobs/fail-next", (_req, res) => {
  knowledge.failNextJob = true;
  res.json({ armed: true });
});

app.post("/api/jobs/tick", route(async (_req, res) => {
  const result = knowledge.dispatchNextJob();
  await persist();
  res.json(result);
}));

app.post("/api/jobs/drain", route(async (req, res) => {
  const result = knowledge.drainJobs(Number(req.query.max || 50));
  await persist();
  res.json(result);
}));

app.post("/api/index/rebuild", route(async (_req, res) => {
  const job = knowledge.rebuildIndex();
  await persist();
  res.status(202).json(job);
}));

app.post("/api/stale-scan", route(async (req, res) => {
  const result = knowledge.scanStaleDocuments(Number(req.body.maxAgeMinutes ?? 60));
  await persist();
  res.json(result);
}));

app.post("/api/grants", route(async (req, res) => {
  const grant = knowledge.createGrant(req.body.documentId, req.body.principal, req.body.expiresAt || null);
  await persist();
  res.status(201).json(grant);
}));

app.post("/api/reset", route(async (_req, res) => {
  knowledge = createSeededKnowledgeIndex();
  await persist();
  res.json(knowledge.snapshot());
}));

app.get("/api/event-key", route(async (req, res) => {
  res.json({ key: eventKey(req.query as never) });
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`Personal knowledge index API listening on http://${HOST}:${PORT} (${infrastructure.mode})`);
});

async function shutdown(): Promise<void> {
  server.close();
  await infrastructure.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
