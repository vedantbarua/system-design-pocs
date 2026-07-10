import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, careEventKey, careTaskFingerprint, careWindowKey, createSeededCare } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("ElderCareCoordinator", () => {
  it("seeds care tasks, alerts, and reminders", () => {
    const care = createSeededCare(NOW);
    assert.equal(care.tasks.length, 6);
    assert.ok(care.alerts.length > 0);
    assert.ok(care.reminders.length > 0);
  });

  it("uses stable event keys, window keys, and task fingerprints", () => {
    assert.equal(careEventKey({ taskId: "task-1", eventId: "abc" }), "task-1:abc");
    assert.equal(careWindowKey("task-1", "2026-07-09T15:18:00Z"), "task-1:2026-07-09T15");
    assert.equal(careTaskFingerprint(" Mira ", " Evening   Call ", NOW), "mira:evening call:2026-07-09");
  });

  it("deduplicates care events", () => {
    const care = createSeededCare(NOW);
    const input = { eventId: "dup", taskId: "task-breakfast", type: "CARE_LOGGED" as const, caregiver: "Ava", occurredAt: addMinutes(30, NOW) };
    assert.equal(care.ingest(input).duplicate, false);
    assert.equal(care.ingest(input).duplicate, true);
  });

  it("updates task metadata", () => {
    const care = createSeededCare(NOW);
    care.ingest({ eventId: "update", taskId: "task-pharmacy", type: "TASK_UPDATED", caregiver: "Noah", location: "Drive-through pharmacy", priority: "MEDIUM" });
    const task = care.taskById("task-pharmacy");
    assert.equal(task.caregiver, "Noah");
    assert.equal(task.location, "Drive-through pharmacy");
    assert.equal(task.priority, "MEDIUM");
  });

  it("ignores stale task updates", () => {
    const care = createSeededCare(NOW);
    const before = care.taskById("task-ride").caregiver;
    const result = care.ingest({ eventId: "old", taskId: "task-ride", type: "TASK_UPDATED", occurredAt: addMinutes(-48 * 60, NOW), caregiver: "Late update" });
    assert.equal(result.stale, true);
    assert.equal(care.taskById("task-ride").caregiver, before);
  });

  it("logs completed care and marks task done", () => {
    const care = createSeededCare(NOW);
    const log = care.logCare("task-breakfast", "Ava", "COMPLETED", addMinutes(40, NOW));
    assert.equal(log.duplicateOf, null);
    assert.equal(care.taskById("task-breakfast").status, "DONE");
  });

  it("detects duplicate completed care logs", () => {
    const care = createSeededCare(NOW);
    care.logCare("task-breakfast", "Ava", "COMPLETED", addMinutes(40, NOW));
    const duplicate = care.logCare("task-breakfast", "Noah", "COMPLETED", addMinutes(45, NOW));
    assert.ok(duplicate.duplicateOf);
    assert.ok(care.alerts.some((alert) => alert.kind === "DUPLICATE_LOG" && alert.taskId === "task-breakfast"));
  });

  it("escalates high-priority skipped care", () => {
    const care = createSeededCare(NOW);
    care.ingest({ eventId: "skip", taskId: "task-appointment", type: "TASK_SKIPPED", caregiver: "Isha", occurredAt: addMinutes(24 * 60, NOW) });
    assert.equal(care.taskById("task-appointment").status, "ESCALATED");
    assert.ok(care.alerts.some((alert) => alert.kind === "ESCALATED_TASK"));
  });

  it("detects due soon care", () => {
    const care = createSeededCare(NOW);
    assert.equal(care.taskById("task-breakfast").status, "DUE_SOON");
    assert.ok(care.alerts.some((alert) => alert.kind === "DUE_SOON" && alert.taskId === "task-breakfast"));
  });

  it("detects missed care", () => {
    const care = createSeededCare(NOW);
    assert.equal(care.taskById("task-water").status, "MISSED");
    assert.ok(care.alerts.some((alert) => alert.kind === "MISSED_CARE" && alert.taskId === "task-water"));
  });

  it("requests and accepts handoffs", () => {
    const care = createSeededCare(NOW);
    care.ingest({ eventId: "handoff", taskId: "task-pharmacy", type: "HANDOFF_REQUESTED", backupCaregiver: "Noah", occurredAt: addMinutes(1, NOW) });
    assert.equal(care.taskById("task-pharmacy").status, "HANDOFF_PENDING");
    care.ingest({ eventId: "accept", taskId: "task-pharmacy", type: "HANDOFF_ACCEPTED", caregiver: "Isha", backupCaregiver: "Noah", occurredAt: addMinutes(2, NOW) });
    assert.equal(care.taskById("task-pharmacy").caregiver, "Noah");
    assert.equal(care.taskById("task-pharmacy").status, "DUE_SOON");
  });

  it("deduplicates reminders across scans", () => {
    const care = createSeededCare(NOW);
    const before = care.reminders.length;
    care.scanCare(NOW);
    assert.equal(care.reminders.length, before);
  });

  it("dispatches alerts and reminders", () => {
    const care = createSeededCare(NOW);
    assert.ok(care.dispatchAlerts() > 0);
    assert.ok(care.dispatchReminders() > 0);
    assert.ok(care.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(care.reminders.every((reminder) => reminder.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const care = createSeededCare(NOW);
    care.ingest({ eventId: "old-event", taskId: "task-breakfast", type: "TASK_UPDATED", occurredAt: addMinutes(-500 * 24 * 60, NOW), caregiver: "Ava" });
    const result = care.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(care.events.length, care.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const care = createSeededCare(NOW);
    care.ensureJob("CARE_SCAN");
    care.failNextJob = true;
    assert.equal(care.dispatchNextJob().job?.status, "RETRY");
    assert.equal(care.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const care = createSeededCare(NOW);
    assert.equal(care.ensureJob("ALERT_DISPATCH").id, care.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededCare(NOW);
    restored.importState(care.exportState());
    assert.equal(restored.tasks.length, care.tasks.length);
    assert.equal(restored.alerts.length, care.alerts.length);
  });
});
