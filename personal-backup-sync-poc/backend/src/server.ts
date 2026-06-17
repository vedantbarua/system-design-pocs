import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { createSeededBackupSync, type FileVersion } from "./core.js";

const PORT = Number(process.env.PORT || 8186);
const HOST = process.env.HOST || "127.0.0.1";
const CHANGE_TOPIC = process.env.BACKUP_CHANGE_TOPIC || "backup.file.changes";

const app = express();
let sync = createSeededBackupSync();
const infrastructure = await new Infrastructure().connect();
const persisted = await infrastructure.load();
if (persisted) sync.importState(persisted);
else await infrastructure.save(sync.exportState());

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

async function persist(version?: FileVersion): Promise<void> {
  if (version) await infrastructure.appendEvent(CHANGE_TOPIC, version.id, version as unknown as Record<string, unknown>);
  await infrastructure.save(sync.exportState());
  await infrastructure.mirrorJobs(sync.jobs as unknown as Array<Record<string, unknown>>);
}

async function processChange(message: Record<string, unknown>): Promise<void> {
  const result = sync.ingestChange({ ...message, source: "kafka" } as never);
  if (result.version) await persist(result.version);
  else await persist();
}

await infrastructure.startConsumer(CHANGE_TOPIC, processChange);

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

app.get("/api/snapshot", (_req, res) => res.json(sync.snapshot()));

app.post("/api/changes", route(async (req, res) => {
  await infrastructure.publish(CHANGE_TOPIC, req.body.deviceId, { ...req.body, source: "api" });
  const result = sync.ingestChange({ ...req.body, source: "api" });
  if (result.version) await persist(result.version);
  else await persist();
  res.status(result.duplicate ? 200 : 202).json({ ...result, kafkaPublished: true });
}));

app.post("/api/changes/publish", route(async (req, res) => {
  await infrastructure.publish(CHANGE_TOPIC, req.body.deviceId, req.body);
  res.status(202).json({ queued: true, kafka: infrastructure.kafkaMode, bufferedMessages: infrastructure.messages.length });
}));

app.post("/api/kafka/drain", route(async (_req, res) => {
  const result = await infrastructure.drainMemory(CHANGE_TOPIC, processChange);
  await persist();
  res.json(result);
}));

app.post("/api/jobs/fail-next", (_req, res) => {
  sync.failNextJob = true;
  res.json({ armed: true });
});

app.post("/api/jobs/tick", route(async (_req, res) => {
  const result = sync.dispatchNextJob();
  await persist();
  res.json(result);
}));

app.post("/api/jobs/drain", route(async (req, res) => {
  const result = sync.drainJobs(Number(req.query.max || 50));
  await persist();
  res.json(result);
}));

app.post("/api/snapshots", route(async (req, res) => {
  const snapshot = sync.createSnapshot(req.body.deviceId, req.body.label || "Manual snapshot");
  await persist();
  res.status(201).json(snapshot);
}));

app.post("/api/snapshots/:snapshotId/restore", route(async (req, res) => {
  const snapshotId = Array.isArray(req.params.snapshotId) ? req.params.snapshotId[0] : req.params.snapshotId;
  const job = sync.restoreSnapshot(snapshotId, req.body.targetDeviceId);
  await persist();
  res.status(202).json(job);
}));

app.post("/api/conflicts/:conflictId/resolve", route(async (req, res) => {
  const conflictId = Array.isArray(req.params.conflictId) ? req.params.conflictId[0] : req.params.conflictId;
  const conflict = sync.resolveConflict(conflictId, req.body.winningVersionId, req.body.actor || "user-vedant");
  await persist();
  res.json(conflict);
}));

app.post("/api/retention/prune", route(async (req, res) => {
  const result = sync.pruneOldVersions(Number(req.body.keepPerPath || 2));
  await persist();
  res.json(result);
}));

app.post("/api/replay", route(async (req, res) => {
  const result = sync.replayChanges(req.body.from, req.body.to);
  await persist();
  res.json(result);
}));

app.post("/api/reset", route(async (_req, res) => {
  sync = createSeededBackupSync();
  await persist();
  res.json(sync.snapshot());
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`Personal backup sync API listening on http://${HOST}:${PORT} (${infrastructure.mode})`);
});

async function shutdown(): Promise<void> {
  server.close();
  await infrastructure.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
