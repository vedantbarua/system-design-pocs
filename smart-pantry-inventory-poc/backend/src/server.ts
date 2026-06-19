import cors from "cors";
import express, { type RequestHandler } from "express";
import { Infrastructure } from "./adapters.js";
import { createSeededPantry, stockEventKey, type StockEvent } from "./core.js";

const PORT = Number(process.env.PORT || 8188);
const HOST = process.env.HOST || "127.0.0.1";
const STOCK_TOPIC = process.env.PANTRY_STOCK_TOPIC || "pantry.stock.events";

const app = express();
let pantry = createSeededPantry();
const infrastructure = await new Infrastructure().connect();
const persisted = await infrastructure.load();
if (persisted) pantry.importState(persisted);
else await infrastructure.save(pantry.exportState());

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

async function persist(event?: StockEvent): Promise<void> {
  if (event) await infrastructure.appendEvent(STOCK_TOPIC, event.eventKey, event as unknown as Record<string, unknown>);
  await infrastructure.save(pantry.exportState());
  await infrastructure.mirrorProjections(pantry.shoppingItems, pantry.jobs);
}

async function processStockEvent(message: Record<string, unknown>): Promise<void> {
  const result = pantry.applyStockEvent({ ...message, source: "kafka" } as never);
  await persist(result.event);
}

await infrastructure.startConsumer(STOCK_TOPIC, processStockEvent);

app.get("/api/health", (_req, res) => res.json({
  status: "ok", persistence: infrastructure.mode, kafka: infrastructure.kafkaMode,
  postgres: infrastructure.postgresMode, redis: infrastructure.redisMode,
  bufferedMessages: infrastructure.messages.length
}));

app.get("/api/snapshot", (_req, res) => res.json(pantry.snapshot()));

app.get("/api/products/barcode/:barcode", route((req, res) => {
  res.json(pantry.lookupBarcode(String(req.params.barcode)));
}));

app.post("/api/stock/events", route(async (req, res) => {
  const input = { ...req.body, source: "api" };
  await infrastructure.publish(STOCK_TOPIC, input.productId, input);
  const result = pantry.applyStockEvent(input);
  await persist(result.event);
  res.status(result.duplicate ? 200 : 202).json({ ...result, kafkaPublished: true });
}));

app.post("/api/stock/events/publish", route(async (req, res) => {
  pantry.findProduct(req.body.productId);
  stockEventKey(req.body);
  await infrastructure.publish(STOCK_TOPIC, req.body.productId, req.body);
  res.status(202).json({ queued: true, kafka: infrastructure.kafkaMode, bufferedMessages: infrastructure.messages.length });
}));

app.post("/api/kafka/drain", route(async (_req, res) => {
  const result = await infrastructure.drainMemory(STOCK_TOPIC, processStockEvent);
  await persist();
  res.json(result);
}));

app.post("/api/shopping-items", route(async (req, res) => {
  const item = pantry.addShoppingItem(req.body.productId, Number(req.body.quantity));
  await persist();
  res.status(201).json(item);
}));

app.patch("/api/shopping-items/:id", route(async (req, res) => {
  const item = pantry.updateShoppingStatus(String(req.params.id), req.body.status);
  await persist();
  res.json(item);
}));

app.post("/api/scans/expiration", route(async (req, res) => {
  const result = pantry.scanExpirations(Number(req.body.withinDays ?? 7), req.body.asOf || new Date());
  await persist();
  res.json(result);
}));

app.post("/api/jobs/expiration", route(async (req, res) => {
  const job = pantry.queueExpirationScan(Number(req.body.withinDays ?? 7));
  await persist();
  res.status(202).json(job);
}));

app.post("/api/jobs/shopping-rebuild", route(async (_req, res) => {
  const job = pantry.queueShoppingRebuild();
  await persist();
  res.status(202).json(job);
}));

app.post("/api/jobs/fail-next", (_req, res) => {
  pantry.failNextJob = true;
  res.json({ armed: true });
});

app.post("/api/jobs/tick", route(async (_req, res) => {
  const result = pantry.dispatchNextJob();
  await persist();
  res.json(result);
}));

app.post("/api/jobs/drain", route(async (req, res) => {
  const result = pantry.drainJobs(Number(req.query.max || 50));
  await persist();
  res.json(result);
}));

app.post("/api/reset", route(async (_req, res) => {
  pantry = createSeededPantry();
  await persist();
  res.json(pantry.snapshot());
}));

const server = app.listen(PORT, HOST, () => {
  console.log(`Smart pantry API listening on http://${HOST}:${PORT} (${infrastructure.mode})`);
});

async function shutdown(): Promise<void> {
  server.close();
  await infrastructure.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
