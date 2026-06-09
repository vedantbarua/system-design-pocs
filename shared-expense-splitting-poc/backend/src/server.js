import cors from "cors";
import express from "express";
import { createSeededStore } from "./core.js";

const PORT = Number(process.env.PORT || 8176);
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
app.get("/api/groups", (_req, res) => res.json(store.groups));
app.get("/api/snapshot", route((req) => store.snapshot(req.query.groupId)));
app.get("/api/ledger", route((req) => store.snapshot(req.query.groupId).ledger));

app.post("/api/expenses", route((req, res) => {
  const expense = store.createExpense(req.body);
  res.status(201);
  return expense;
}));

app.put("/api/expenses/:expenseId", route((req) => store.editExpense(req.params.expenseId, req.body)));
app.post("/api/expenses/:expenseId/reverse", route((req) => store.reverseExpense(req.params.expenseId, req.body.reason)));

app.post("/api/repayments", route((req, res) => {
  const repayment = store.recordRepayment(req.body);
  res.status(201);
  return repayment;
}));

app.post("/api/recurring/run", route((req) => ({
  generated: store.runRecurring(req.body.runDate || new Date().toISOString().slice(0, 10))
})));

app.post("/api/reminders/run", route((req) => ({
  reminders: store.createReminders(req.body.groupId, req.body.thresholdCents)
})));

app.listen(PORT, () => {
  console.log(`Shared expense API listening on http://127.0.0.1:${PORT}`);
});
