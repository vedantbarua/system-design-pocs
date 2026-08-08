import cors from "cors";
import express from "express";
import { createCache } from "./cache.js";
import { generateWeeklyPlan } from "./planner.js";
import { getDueReviews, getProgress, getWeeklyPlan, rateReviewCard, saveProgress, saveWeeklyPlan, seedReviewCards } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 4360);
const cache = await createCache();

app.use(cors());
app.use(express.json({ limit: "128kb" }));

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "math-ml-learning-roadmap-api",
    cache: cache.mode,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/progress/:userId", async (req, res) => {
  const progress = getProgress(req.params.userId);
  const streak = Number((await cache.get(streakKey(req.params.userId))) || 0);
  res.json({ ...progress, streak });
});

app.put("/api/progress/:userId", async (req, res) => {
  const progress = saveProgress(req.params.userId, req.body);
  const streak = await cache.incr(streakKey(req.params.userId));
  await cache.set(`progress:${req.params.userId}`, JSON.stringify(progress), 900);
  res.json({ ...progress, streak });
});

app.get("/api/plan/:userId", (req, res) => {
  res.json(getWeeklyPlan(req.params.userId));
});

app.post("/api/plan/:userId", (req, res) => {
  const plan = generateWeeklyPlan(req.body);
  res.json(saveWeeklyPlan(req.params.userId, plan));
});

app.post("/api/reviews/:userId/seed", async (req, res) => {
  const due = seedReviewCards(req.params.userId, req.body.cards);
  await cache.set(dueCountKey(req.params.userId), String(due.length), 900);
  res.json({ userId: req.params.userId, due });
});

app.get("/api/reviews/:userId", async (req, res) => {
  const due = getDueReviews(req.params.userId, req.query.limit);
  await cache.set(dueCountKey(req.params.userId), String(due.length), 900);
  res.json({ userId: req.params.userId, due, count: due.length });
});

app.post("/api/reviews/:userId/:cardId/rate", async (req, res) => {
  const card = rateReviewCard(req.params.userId, req.params.cardId, req.body.rating);
  if (!card) return res.status(404).json({ ok: false, error: "Review card not found" });
  const due = getDueReviews(req.params.userId, 6);
  await cache.set(dueCountKey(req.params.userId), String(due.length), 900);
  res.json({ userId: req.params.userId, card, due, count: due.length });
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ ok: false, error: err.message || "Internal server error" });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Learning roadmap API running on http://127.0.0.1:${port}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  server.close();
  await cache.close();
  process.exit(0);
}

function streakKey(userId) {
  return `streak:${userId}`;
}

function dueCountKey(userId) {
  return `due-reviews:${userId}`;
}
