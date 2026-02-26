import express from "express";

const PORT = process.env.USER_SERVICE_PORT
  ? Number(process.env.USER_SERVICE_PORT)
  : 9101;

const app = express();
app.use(express.json({ limit: "1mb" }));

const chaos = {
  failureRate: 0,
  delayMs: 120,
  jitterMs: 180,
  down: false
};

const users = new Map([
  ["u-1001", { id: "u-1001", name: "Riley", plan: "pro", region: "us-east" }],
  ["u-1002", { id: "u-1002", name: "Jordan", plan: "starter", region: "eu-west" }],
  ["u-1003", { id: "u-1003", name: "Avery", plan: "team", region: "ap-south" }]
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.use(async (req, res, next) => {
  if (req.path.startsWith("/admin")) return next();
  if (chaos.down) {
    return res.status(503).json({ ok: false, error: "user_service_down" });
  }

  const delay = chaos.delayMs + Math.floor(Math.random() * chaos.jitterMs);
  if (delay > 0) {
    await sleep(delay);
  }

  if (Math.random() < chaos.failureRate) {
    return res.status(500).json({ ok: false, error: "user_service_flaky" });
  }

  return next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "users", now: Date.now(), chaos });
});

app.get("/users/:id", (req, res) => {
  const user = users.get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "user_not_found" });
  }
  res.json(user);
});

app.get("/users", (req, res) => {
  res.json(Array.from(users.values()));
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
  console.log(`User service running on http://localhost:${PORT}`);
});
