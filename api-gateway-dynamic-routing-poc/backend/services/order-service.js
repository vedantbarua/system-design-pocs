import express from "express";

const PORT = process.env.ORDER_SERVICE_PORT
  ? Number(process.env.ORDER_SERVICE_PORT)
  : 9102;

const app = express();
app.use(express.json({ limit: "1mb" }));

const chaos = {
  failureRate: 0,
  delayMs: 180,
  jitterMs: 240,
  down: false
};

const orders = [
  { id: "o-9001", userId: "u-1001", total: 86.4, status: "processing" },
  { id: "o-9002", userId: "u-1001", total: 42.1, status: "shipped" },
  { id: "o-9003", userId: "u-1002", total: 132.8, status: "delivered" },
  { id: "o-9004", userId: "u-1003", total: 24.9, status: "processing" }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.use(async (req, res, next) => {
  if (req.path.startsWith("/admin")) return next();
  if (chaos.down) {
    return res.status(503).json({ ok: false, error: "order_service_down" });
  }

  const delay = chaos.delayMs + Math.floor(Math.random() * chaos.jitterMs);
  if (delay > 0) {
    await sleep(delay);
  }

  if (Math.random() < chaos.failureRate) {
    return res.status(500).json({ ok: false, error: "order_service_flaky" });
  }

  return next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "orders", now: Date.now(), chaos });
});

app.get("/orders", (req, res) => {
  const { userId } = req.query;
  const data = userId ? orders.filter((order) => order.userId === userId) : orders;
  res.json(data);
});

app.post("/admin/chaos", (req, res) => {
  const { failureRate, delayMs, jitterMs, down } = req.body || {};
  if (failureRate !== undefined) chaos.failureRate = Number(failureRate) || 0;
  if (delayMs !== undefined) chaos.delayMs = Number(delayMs) || 0;
  if (jitterMs !== undefined) chaos.jitterMs = Number(jitterMs) || 0;
  if (down !== undefined) chaos.down = Boolean(down);

  res.json({ ok: true, chaos });
});

app.listen(PORT, () => {
  console.log(`Order service running on http://localhost:${PORT}`);
});
