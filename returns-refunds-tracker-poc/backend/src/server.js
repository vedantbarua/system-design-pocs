import cors from "cors";
import express from "express";
import { createSeededStore, webhookKey } from "./core.js";
import { createRepository } from "./repository.js";

const PORT = Number(process.env.PORT || 8179);
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

async function persist(result) {
  const event = result?.event;
  if (event) await repository.appendOperationalEvent(event);
  await repository.save(store.exportState());
  return result;
}

async function claim(input) {
  const key = webhookKey(input);
  if (store.hasEvent(key)) return false;
  return repository.claim(key);
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", persistence: repository.mode }));
app.get("/api/snapshot", route((req) => store.snapshot(req.query.asOf)));
app.get("/api/returns/:returnId", route((req) => store.returnView(req.params.returnId, req.query.asOf)));

app.post("/api/returns", route(async (req, res) => {
  const result = store.createReturn(req.body);
  await repository.save(store.exportState());
  res.status(201);
  return result;
}));

app.post("/api/returns/:returnId/transition", route(async (req) => {
  const result = store.transition(req.params.returnId, req.body.state, req.body);
  await repository.save(store.exportState());
  return result;
}));

app.post("/api/webhooks/merchant", route(async (req, res) => {
  const input = { ...req.body, source: req.body.provider || "merchant", type: req.body.status };
  if (!(await claim(input))) return { duplicate: true, repositoryDeduplicated: true };
  const result = await persist(store.ingestMerchantWebhook(req.body));
  res.status(202);
  return result;
}));

app.post("/api/webhooks/carrier", route(async (req, res) => {
  const input = { ...req.body, source: req.body.carrier || "carrier", type: req.body.status };
  if (!(await claim(input))) return { duplicate: true, repositoryDeduplicated: true };
  const result = await persist(store.ingestCarrierWebhook(req.body));
  res.status(202);
  return result;
}));

app.post("/api/webhooks/refund", route(async (req, res) => {
  const input = { ...req.body, source: req.body.provider || "payment", type: "REFUND_POSTED" };
  if (!(await claim(input))) return { duplicate: true, repositoryDeduplicated: true };
  const result = await persist(store.ingestRefundWebhook(req.body));
  res.status(202);
  return result;
}));

app.post("/api/alerts/refresh", route(async (req) => {
  const alerts = store.refreshAlerts(req.body.asOf);
  await repository.save(store.exportState());
  return { alerts };
}));

app.post("/api/reset", route(async () => {
  const clean = createSeededStore();
  store.importState(clean.exportState());
  await repository.save(store.exportState());
  return store.snapshot("2026-06-11");
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`Returns/refunds API listening on http://${HOST}:${PORT} (${repository.mode})`);
});

async function shutdown() {
  server.close();
  await repository.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
