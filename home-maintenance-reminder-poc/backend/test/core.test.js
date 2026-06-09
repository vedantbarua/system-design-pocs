import assert from "node:assert/strict";
import test from "node:test";
import { MaintenanceStore, nextRecurringDate, taskStatus } from "../src/core.js";

test("date tasks derive upcoming, due, and overdue states", () => {
  const task = { scheduleType: "date", nextDueDate: "2026-06-20", leadDays: 7, manualStatus: null };
  assert.equal(taskStatus(task, "2026-06-10"), "UPCOMING");
  assert.equal(taskStatus(task, "2026-06-15"), "DUE");
  assert.equal(taskStatus(task, "2026-06-21"), "OVERDUE");
});

test("usage tasks become due near threshold and overdue after it", () => {
  const task = { scheduleType: "usage", currentUsage: 90, nextDueUsage: 100, usageLead: 10, manualStatus: null };
  assert.equal(taskStatus(task), "DUE");
  assert.equal(taskStatus({ ...task, currentUsage: 101 }), "OVERDUE");
});

test("recurring date calculation advances from completion date", () => {
  assert.equal(nextRecurringDate("2026-06-09", 90), "2026-09-07");
});

test("task completion records service history and schedules next date", () => {
  const store = new MaintenanceStore();
  store.seed();
  const result = store.completeTask("task-hvac-filter", {
    completedOn: "2026-06-09",
    costCents: 3200,
    vendor: "DIY",
    notes: "Installed MERV 11 filter."
  });
  assert.equal(result.task.nextDueDate, "2026-09-07");
  assert.equal(result.history.costCents, 3200);
  assert.equal(store.serviceHistory.at(-1).taskId, "task-hvac-filter");
});

test("usage completion advances threshold from current usage", () => {
  const store = new MaintenanceStore();
  store.seed();
  store.updateUsage("task-generator-service", 103);
  const result = store.completeTask("task-generator-service", { completedOn: "2026-06-09" });
  assert.equal(result.task.nextDueUsage, 203);
  assert.equal(result.task.status, "UPCOMING");
});

test("skipping records history and advances schedule", () => {
  const store = new MaintenanceStore();
  store.seed();
  const task = store.skipTask("task-smoke-detectors", { skippedOn: "2026-06-09", notes: "Traveling" });
  assert.equal(task.nextDueDate, "2026-07-09");
  assert.equal(task.status, "SKIPPED");
  assert.equal(store.serviceHistory.at(-1).outcome, "SKIPPED");
});

test("reminder generation is idempotent for task and warranty targets", () => {
  const store = new MaintenanceStore();
  store.seed();
  const first = store.runReminders("property-maple", "2026-06-09", 30);
  const second = store.runReminders("property-maple", "2026-06-09", 30);
  assert.ok(first.some((item) => item.targetId === "task-hvac-filter"));
  assert.ok(first.some((item) => item.targetType === "DOCUMENT"));
  assert.equal(first.filter((item) => item.targetType === "DOCUMENT").length, 1);
  assert.equal(second.length, 0);
});

test("asset health declines when maintenance is overdue", () => {
  const store = new MaintenanceStore();
  store.seed();
  const health = store.assetHealth("asset-hvac", "2026-06-09");
  assert.equal(health.score, 75);
  assert.equal(health.status, "WATCH");
});

test("calendar returns date tasks for selected month", () => {
  const store = new MaintenanceStore();
  store.seed();
  const calendar = store.calendar("property-maple", "2026-06");
  assert.deepEqual(calendar.map((task) => task.id), ["task-hvac-filter", "task-smoke-detectors", "task-gutters"]);
});

test("yearly spend sums completed service history in cents", () => {
  const store = new MaintenanceStore();
  store.seed();
  assert.equal(store.yearlySpend("property-maple", 2026), 17100);
});

test("snapshot summarizes statuses, health, spend, and expiring documents", () => {
  const store = new MaintenanceStore();
  store.seed();
  const snapshot = store.snapshot("property-maple", "2026-06-09");
  assert.equal(snapshot.metrics.statusCounts.OVERDUE, 1);
  assert.equal(snapshot.metrics.statusCounts.DUE, 2);
  assert.equal(snapshot.metrics.assetCount, 3);
  assert.equal(snapshot.metrics.yearlySpendCents, 17100);
  assert.equal(snapshot.metrics.expiringDocumentCount, 1);
});
