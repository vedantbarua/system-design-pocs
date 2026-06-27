import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, careEventKey, createSeededCoordinator } from "../src/core.js";

const NOW = new Date("2026-06-27T15:00:00Z");

describe("PetCareCoordinator", () => {
  it("seeds pets, caregivers, tasks, alerts, and reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.pets.length, 2);
    assert.equal(coordinator.caregivers.length, 3);
    assert.equal(coordinator.tasks.length, 5);
    assert.ok(coordinator.alerts.length > 0);
    assert.ok(coordinator.reminders.length > 0);
  });

  it("uses stable care event keys", () => {
    assert.equal(careEventKey({ caregiverId: "care-1", eventId: "abc" }), "care-1:abc");
  });

  it("deduplicates caregiver events", () => {
    const coordinator = createSeededCoordinator(NOW);
    const input = { eventId: "dup", taskId: "task-ruby-dinner", petId: "pet-ruby", caregiverId: "care-ava", type: "COMPLETED" as const, occurredAt: addMinutes(80, NOW) };
    assert.equal(coordinator.ingest(input).duplicate, false);
    assert.equal(coordinator.ingest(input).duplicate, true);
  });

  it("marks completed care tasks done", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "dinner", taskId: "task-ruby-dinner", petId: "pet-ruby", caregiverId: "care-ava", type: "COMPLETED", occurredAt: addMinutes(82, NOW) });
    assert.equal(coordinator.findTask("task-ruby-dinner").status, "DONE");
  });

  it("detects missed care after task windows expire", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.findTask("task-miso-meds").status, "MISSED");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "MISSED_CARE"));
  });

  it("queues medication due alerts before a medicine task is complete", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "MEDICATION_DUE"));
  });

  it("queues vet appointment alerts", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "UPCOMING_VET"));
  });

  it("detects duplicate care logs for the same task", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "dupe-care", taskId: "task-ruby-walk", petId: "pet-ruby", caregiverId: "care-sam", type: "COMPLETED", occurredAt: addMinutes(-8, NOW) });
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "DUPLICATE_LOG"));
  });

  it("deduplicates reminders across repeated schedule scans", () => {
    const coordinator = createSeededCoordinator(NOW);
    const before = coordinator.reminders.length;
    coordinator.scanSchedules(NOW);
    assert.equal(coordinator.reminders.length, before);
  });

  it("dispatches alerts and reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.dispatchAlerts() > 0);
    assert.ok(coordinator.dispatchReminders() > 0);
    assert.ok(coordinator.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(coordinator.reminders.every((reminder) => reminder.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const coordinator = createSeededCoordinator(NOW);
    const result = coordinator.retain(0.001, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(coordinator.events.length, coordinator.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ensureJob("REMINDER_DISPATCH");
    coordinator.failNextJob = true;
    assert.equal(coordinator.dispatchNextJob().job?.status, "RETRY");
    assert.equal(coordinator.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.ensureJob("SCHEDULE_SCAN").id, coordinator.ensureJob("SCHEDULE_SCAN").id);
  });

  it("exports and restores state", () => {
    const coordinator = createSeededCoordinator(NOW);
    const restored = createSeededCoordinator(NOW);
    restored.importState(coordinator.exportState());
    assert.equal(restored.tasks.length, coordinator.tasks.length);
    assert.equal(restored.events.length, coordinator.events.length);
    assert.equal(restored.alerts.length, coordinator.alerts.length);
  });
});
