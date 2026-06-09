import cors from "cors";
import express from "express";
import { createSeededStore } from "./core.js";

const PORT = Number(process.env.PORT || 8177);
const HOST = process.env.HOST || "127.0.0.1";
const app = express();
const store = createSeededStore();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function route(handler) {
  return (req, res) => {
    try {
      const result = handler(req, res);
      if (!res.headersSent) res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
}

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/snapshot", route((req) => store.snapshot(req.query.propertyId, req.query.asOf)));
app.get("/api/calendar", route((req) => store.calendar(req.query.propertyId, req.query.month)));

app.post("/api/assets", route((req, res) => {
  res.status(201);
  return store.addAsset(req.body);
}));
app.post("/api/assets/:assetId/documents", route((req, res) => {
  res.status(201);
  return store.addDocument(req.params.assetId, req.body);
}));
app.post("/api/tasks", route((req, res) => {
  res.status(201);
  return store.createTask(req.body);
}));
app.post("/api/tasks/:taskId/complete", route((req) => store.completeTask(req.params.taskId, req.body)));
app.post("/api/tasks/:taskId/skip", route((req) => store.skipTask(req.params.taskId, req.body)));
app.post("/api/tasks/:taskId/usage", route((req) => store.updateUsage(req.params.taskId, req.body.currentUsage)));
app.post("/api/reminders/run", route((req) => ({
  reminders: store.runReminders(req.body.propertyId, req.body.asOf, req.body.warrantyWindowDays)
})));

app.listen(PORT, HOST, () => {
  console.log(`Home maintenance API listening on http://${HOST}:${PORT}`);
});
