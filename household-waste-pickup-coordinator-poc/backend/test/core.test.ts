import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededCoordinator, routeEventKey } from "../src/core.js";

const NOW = new Date("2026-06-28T15:00:00Z");

describe("WastePickupCoordinator", () => {
  it("seeds schedules, route statuses, events, alerts, and reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.schedules.length, 5);
    assert.equal(coordinator.routeStatuses.length, 4);
    assert.ok(coordinator.events.length > 0);
    assert.ok(coordinator.alerts.length > 0);
    assert.ok(coordinator.reminders.length > 0);
  });

  it("uses stable route event keys", () => {
    assert.equal(routeEventKey({ routeId: "route-a", eventId: "abc" }), "route-a:abc");
  });

  it("deduplicates municipal route events", () => {
    const coordinator = createSeededCoordinator(NOW);
    const input = { eventId: "dup", routeId: "route-compost-nw", scheduleId: "sched-compost-today", type: "PICKUP_COMPLETED" as const, occurredAt: addMinutes(80, NOW) };
    assert.equal(coordinator.ingest(input).duplicate, false);
    assert.equal(coordinator.ingest(input).duplicate, true);
  });

  it("marks completed pickups done", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "compost-done", routeId: "route-compost-nw", scheduleId: "sched-compost-today", type: "PICKUP_COMPLETED", occurredAt: addMinutes(95, NOW) });
    assert.equal(coordinator.findSchedule("sched-compost-today").status, "COMPLETED");
  });

  it("applies route delays and queues delay alerts", () => {
    const coordinator = createSeededCoordinator(NOW);
    const recycling = coordinator.findSchedule("sched-recycle-today");
    assert.equal(recycling.status, "DELAYED");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "ROUTE_DELAY"));
  });

  it("applies holiday shifts to future schedules", () => {
    const coordinator = createSeededCoordinator(NOW);
    const trash = coordinator.findSchedule("sched-trash-next");
    assert.equal(trash.scheduledFor, addMinutes(2940, NOW));
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "HOLIDAY_SHIFT"));
  });

  it("detects missed pickups after the service window expires", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.scanSchedules(addMinutes(500, NOW));
    assert.equal(coordinator.findSchedule("sched-recycle-today").status, "MISSED");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "MISSED_PICKUP"));
  });

  it("queues skipped pickup alerts", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "skip", routeId: "route-compost-nw", scheduleId: "sched-compost-today", type: "PICKUP_SKIPPED", occurredAt: addMinutes(90, NOW), notes: "Blocked bin" });
    assert.equal(coordinator.findSchedule("sched-compost-today").status, "SKIPPED");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "SKIPPED_PICKUP"));
  });

  it("queues bulk pickup due alerts", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "BULK_PICKUP_DUE"));
  });

  it("deduplicates reminders across repeated scans", () => {
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
    coordinator.ensureJob("ALERT_DISPATCH");
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
    assert.equal(restored.schedules.length, coordinator.schedules.length);
    assert.equal(restored.events.length, coordinator.events.length);
    assert.equal(restored.alerts.length, coordinator.alerts.length);
  });
});
