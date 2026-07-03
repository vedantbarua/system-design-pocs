import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededCoordinator, laundryEventKey } from "../src/core.js";

const NOW = new Date("2026-06-29T15:00:00Z");

describe("LaundryCoordinator", () => {
  it("seeds machines, loads, events, alerts, and reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.machines.length, 2);
    assert.equal(coordinator.loads.length, 3);
    assert.ok(coordinator.events.length > 0);
    assert.ok(coordinator.alerts.length > 0);
    assert.ok(coordinator.reminders.length > 0);
  });

  it("uses stable laundry event keys", () => {
    assert.equal(laundryEventKey({ machineId: "washer-1", eventId: "abc" }), "washer-1:abc");
  });

  it("deduplicates machine events", () => {
    const coordinator = createSeededCoordinator(NOW);
    const input = { eventId: "dup", loadId: "load-sheets", machineId: "washer-1", type: "LOAD_STARTED" as const, actor: "Ava", occurredAt: addMinutes(20, NOW) };
    assert.equal(coordinator.ingest(input).duplicate, false);
    assert.equal(coordinator.ingest(input).duplicate, true);
  });

  it("starts washer loads and marks the washer running", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "start-sheets", loadId: "load-sheets", machineId: "washer-1", type: "LOAD_STARTED", actor: "Ava", occurredAt: addMinutes(20, NOW) });
    assert.equal(coordinator.loadById("load-sheets").status, "WASHING");
    assert.equal(coordinator.machine("washer-1").status, "RUNNING");
  });

  it("marks wet loads stale after the handoff window expires", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.loadById("load-towels").status, "STALE");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "WET_LOAD_STALE"));
  });

  it("marks abandoned dryer loads stale", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.loadById("load-workout").status, "STALE");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "DRYER_ABANDONED"));
  });

  it("detects duplicate status updates", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "dupe-done", loadId: "load-towels", machineId: "washer-1", type: "CYCLE_DONE", actor: "Washer", occurredAt: addMinutes(-44, NOW) });
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "DUPLICATE_UPDATE"));
  });

  it("queues machine offline alerts", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "offline", loadId: "load-sheets", machineId: "washer-1", type: "MACHINE_OFFLINE", actor: "Washer", occurredAt: NOW.toISOString() });
    assert.equal(coordinator.machine("washer-1").status, "OFFLINE");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "MACHINE_OFFLINE"));
  });

  it("deduplicates reminders across repeated scans", () => {
    const coordinator = createSeededCoordinator(NOW);
    const before = coordinator.reminders.length;
    coordinator.scanLoads(NOW);
    assert.equal(coordinator.reminders.length, before);
  });

  it("dispatches alerts and reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.dispatchAlerts() > 0);
    assert.ok(coordinator.dispatchReminders() > 0);
    assert.ok(coordinator.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(coordinator.reminders.every((reminder) => reminder.status === "SENT"));
  });

  it("completes loads when folded", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "folded", loadId: "load-workout", machineId: "dryer-1", type: "LOAD_FOLDED", actor: "Ava", occurredAt: addMinutes(5, NOW) });
    assert.equal(coordinator.loadById("load-workout").status, "COMPLETED");
    assert.equal(coordinator.machine("dryer-1").status, "AVAILABLE");
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
    assert.equal(coordinator.ensureJob("LOAD_SCAN").id, coordinator.ensureJob("LOAD_SCAN").id);
  });

  it("exports and restores state", () => {
    const coordinator = createSeededCoordinator(NOW);
    const restored = createSeededCoordinator(NOW);
    restored.importState(coordinator.exportState());
    assert.equal(restored.loads.length, coordinator.loads.length);
    assert.equal(restored.events.length, coordinator.events.length);
    assert.equal(restored.alerts.length, coordinator.alerts.length);
  });
});
