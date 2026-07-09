import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededReadiness, itemFingerprint, readinessEventKey } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("EmergencyReadiness", () => {
  it("seeds readiness items, alerts, and reminders", () => {
    const readiness = createSeededReadiness(NOW);
    assert.equal(readiness.items.length, 7);
    assert.ok(readiness.alerts.length > 0);
    assert.ok(readiness.reminders.length > 0);
  });

  it("uses stable event keys and item fingerprints", () => {
    assert.equal(readinessEventKey({ itemId: "item-1", eventId: "abc" }), "item-1:abc");
    assert.equal(itemFingerprint(" Drinking  Water ", "SUPPLIES", " Garage Kit "), "SUPPLIES:drinking water:garage kit");
  });

  it("deduplicates readiness events", () => {
    const readiness = createSeededReadiness(NOW);
    const input = { eventId: "dup", itemId: "item-water", type: "SUPPLY_CHECKED" as const, quantity: 12 };
    assert.equal(readiness.ingest(input).duplicate, false);
    assert.equal(readiness.ingest(input).duplicate, true);
  });

  it("updates item metadata", () => {
    const readiness = createSeededReadiness(NOW);
    readiness.ingest({ eventId: "update", itemId: "item-water", type: "ITEM_UPDATED", quantity: 14, requiredQuantity: 12, owner: "Noah" });
    const item = readiness.itemById("item-water");
    assert.equal(item.quantity, 14);
    assert.equal(item.owner, "Noah");
  });

  it("ignores stale item updates", () => {
    const readiness = createSeededReadiness(NOW);
    const before = readiness.itemById("item-car-fuel").quantity;
    const result = readiness.ingest({ eventId: "old", itemId: "item-car-fuel", type: "ITEM_UPDATED", occurredAt: addMinutes(-12 * 24 * 60, NOW), quantity: 0 });
    assert.equal(result.stale, true);
    assert.equal(readiness.itemById("item-car-fuel").quantity, before);
  });

  it("detects low quantities and missing documents", () => {
    const readiness = createSeededReadiness(NOW);
    assert.ok(readiness.alerts.some((alert) => alert.kind === "LOW_QUANTITY" && alert.itemId === "item-water"));
    assert.ok(readiness.alerts.some((alert) => alert.kind === "MISSING_DOCUMENT" && alert.itemId === "item-passports"));
  });

  it("detects expiring and expired supplies", () => {
    const readiness = createSeededReadiness(NOW);
    assert.ok(readiness.alerts.some((alert) => alert.kind === "SUPPLY_EXPIRING" && alert.itemId === "item-water"));
    assert.ok(readiness.alerts.some((alert) => alert.kind === "SUPPLY_EXPIRED" && alert.itemId === "item-batteries"));
  });

  it("detects stale contacts", () => {
    const readiness = createSeededReadiness(NOW);
    assert.equal(readiness.itemById("item-contact-neighbor").status, "STALE");
    assert.ok(readiness.alerts.some((alert) => alert.kind === "STALE_CONTACT"));
  });

  it("starts incident mode and queues critical tasks", () => {
    const readiness = createSeededReadiness(NOW);
    readiness.ingest({ eventId: "incident", itemId: "item-water", type: "INCIDENT_MODE_STARTED", occurredAt: NOW.toISOString() });
    assert.equal(readiness.incidentMode, true);
    assert.ok(readiness.alerts.some((alert) => alert.kind === "INCIDENT_TASK"));
  });

  it("marks tasks done and refreshes documents", () => {
    const readiness = createSeededReadiness(NOW);
    readiness.ingest({ eventId: "doc", itemId: "item-passports", type: "DOCUMENT_REFRESHED", quantity: 1, occurredAt: NOW.toISOString() });
    readiness.ingest({ eventId: "task", itemId: "item-meetup", type: "TASK_COMPLETED", quantity: 1, occurredAt: addMinutes(30, NOW) });
    assert.equal(readiness.itemById("item-passports").status, "READY");
    assert.equal(readiness.itemById("item-meetup").status, "DONE");
  });

  it("deduplicates reminders across scans", () => {
    const readiness = createSeededReadiness(NOW);
    const before = readiness.reminders.length;
    readiness.scanReadiness(NOW);
    assert.equal(readiness.reminders.length, before);
  });

  it("dispatches alerts and reminders", () => {
    const readiness = createSeededReadiness(NOW);
    assert.ok(readiness.dispatchAlerts() > 0);
    assert.ok(readiness.dispatchReminders() > 0);
    assert.ok(readiness.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(readiness.reminders.every((reminder) => reminder.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const readiness = createSeededReadiness(NOW);
    readiness.ingest({ eventId: "old-event", itemId: "item-water", type: "SUPPLY_CHECKED", occurredAt: addMinutes(-500 * 24 * 60, NOW), quantity: 12 });
    const result = readiness.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(readiness.events.length, readiness.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const readiness = createSeededReadiness(NOW);
    readiness.ensureJob("READINESS_SCAN");
    readiness.failNextJob = true;
    assert.equal(readiness.dispatchNextJob().job?.status, "RETRY");
    assert.equal(readiness.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const readiness = createSeededReadiness(NOW);
    assert.equal(readiness.ensureJob("ALERT_DISPATCH").id, readiness.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededReadiness(NOW);
    restored.importState(readiness.exportState());
    assert.equal(restored.items.length, readiness.items.length);
    assert.equal(restored.alerts.length, readiness.alerts.length);
  });
});
