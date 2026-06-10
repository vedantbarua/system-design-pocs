import cors from "cors";
import express from "express";
import { createSeededStore, eventKey } from "./core.js";
import { createRepository } from "./repository.js";

const PORT = Number(process.env.PORT || 8178);
const HOST = process.env.HOST || "127.0.0.1";
const app = express();
const store = createSeededStore();
const repository = await createRepository();
const persisted = await repository.load();
if (persisted) store.importState(persisted);
else await repository.save(store.exportState());

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function route(handler) {
  return async (req, res) => {
    try {
      const result = await handler(req, res);
      if (!res.headersSent) res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
}

async function persist() {
  await repository.save(store.exportState());
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", persistence: repository.mode }));
app.get("/api/snapshot", route((req) => store.snapshot(req.query.householdId, req.query.asOf)));
app.get("/api/packages/:packageId", route((req) => store.packageView(req.params.packageId)));

app.post("/api/packages", route(async (req, res) => {
  const parcel = store.addPackage(req.body);
  await persist();
  res.status(201);
  return parcel;
}));

app.post("/api/events/webhook", route(async (req, res) => {
  const key = eventKey(req.body);
  if (!store.hasEvent(key)) {
    const claimed = await repository.claimEvent(key);
    if (!claimed) return { duplicate: true, repositoryDeduplicated: true };
  }
  const result = store.ingestEvent(req.body, { source: "webhook" });
  if (!result.duplicate) {
    await repository.appendEvent(result.event);
    await persist();
    res.status(202);
  }
  return result;
}));

app.post("/api/poll/run", route(async (req) => {
  const result = store.runPoll(req.body.householdId, req.body.asOf);
  for (const event of result.events) {
    await repository.claimEvent(event.eventKey);
    await repository.appendEvent(event);
  }
  await persist();
  return result;
}));

app.post("/api/packages/:packageId/preferences", route(async (req) => {
  const parcel = store.updatePreferences(req.params.packageId, req.body);
  await persist();
  return parcel;
}));

app.post("/api/reset", route(async () => {
  const clean = createSeededStore();
  store.importState(clean.exportState());
  await persist();
  return store.snapshot();
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`Package tracker API listening on http://${HOST}:${PORT} (${repository.mode})`);
});

async function shutdown() {
  server.close();
  await repository.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
