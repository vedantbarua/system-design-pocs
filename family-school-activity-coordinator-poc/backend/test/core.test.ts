import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededCoordinator, fingerprint, schoolEventKey } from "../src/core.js";

const NOW = new Date("2026-07-05T15:00:00Z");

describe("SchoolActivityCoordinator", () => {
  it("seeds schedule items, alerts, and reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.items.length, 6);
    assert.ok(coordinator.alerts.length > 0);
    assert.ok(coordinator.reminders.length > 0);
  });

  it("uses stable event keys and schedule fingerprints", () => {
    assert.equal(schoolEventKey({ itemId: "item-1", eventId: "abc" }), "item-1:abc");
    assert.equal(fingerprint(" Ava ", " Lincoln ", "Math   Night", "2026-07-05T18:00:00Z"), "ava:lincoln:math night:2026-07-05T18:00:00.000Z");
  });

  it("deduplicates school events", () => {
    const coordinator = createSeededCoordinator(NOW);
    const input = { eventId: "dup", itemId: "item-cleats", type: "ITEM_UPDATED" as const, caregiver: "Mia" };
    assert.equal(coordinator.ingest(input).duplicate, false);
    assert.equal(coordinator.ingest(input).duplicate, true);
  });

  it("updates schedule metadata", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "update", itemId: "item-cleats", type: "ITEM_UPDATED", title: "Bring indoor soccer shoes", location: "Garage shelf", caregiver: "Noah" });
    const item = coordinator.itemById("item-cleats");
    assert.equal(item.title, "Bring indoor soccer shoes");
    assert.equal(item.location, "Garage shelf");
  });

  it("ignores out-of-order school updates", () => {
    const coordinator = createSeededCoordinator(NOW);
    const before = coordinator.itemById("item-pickup").pickupBy;
    const result = coordinator.ingest({ eventId: "old", itemId: "item-pickup", type: "PICKUP_CHANGED", occurredAt: addMinutes(-3 * 60, NOW), pickupBy: "Noah" });
    assert.equal(result.stale, true);
    assert.equal(coordinator.itemById("item-pickup").pickupBy, before);
  });

  it("detects child-specific schedule conflicts", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "SCHEDULE_CONFLICT"));
    assert.equal(coordinator.itemById("item-soccer").status, "CONFLICT");
  });

  it("queues assignment due reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "ASSIGNMENT_DUE"));
    assert.ok(coordinator.reminders.some((reminder) => reminder.dedupeKey.includes("ASSIGNMENT_DUE")));
  });

  it("queues form due reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "FORM_DUE"));
    assert.ok(coordinator.reminders.some((reminder) => reminder.dedupeKey.includes("FORM_DUE")));
  });

  it("queues pickup confirmation alerts", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "PICKUP_CONFIRM" && alert.itemId === "item-pickup"));
  });

  it("marks forms submitted and items completed", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "form", itemId: "item-field-trip-form", type: "FORM_SUBMITTED", occurredAt: NOW.toISOString() });
    coordinator.ingest({ eventId: "done", itemId: "item-math", type: "ITEM_COMPLETED", occurredAt: addMinutes(30, NOW) });
    assert.equal(coordinator.itemById("item-field-trip-form").status, "COMPLETED");
    assert.equal(coordinator.itemById("item-math").status, "COMPLETED");
  });

  it("deduplicates reminders across scans", () => {
    const coordinator = createSeededCoordinator(NOW);
    const before = coordinator.reminders.length;
    coordinator.scanSchedule(NOW);
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
    coordinator.ingest({ eventId: "old-event", itemId: "item-cleats", type: "ITEM_UPDATED", occurredAt: addMinutes(-300 * 24 * 60, NOW), title: "Old shoes" });
    const result = coordinator.retain(180, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(coordinator.events.length, coordinator.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ensureJob("SCHEDULE_SCAN");
    coordinator.failNextJob = true;
    assert.equal(coordinator.dispatchNextJob().job?.status, "RETRY");
    assert.equal(coordinator.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.ensureJob("ALERT_DISPATCH").id, coordinator.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededCoordinator(NOW);
    restored.importState(coordinator.exportState());
    assert.equal(restored.items.length, coordinator.items.length);
    assert.equal(restored.alerts.length, coordinator.alerts.length);
  });
});
