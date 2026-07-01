import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededPlanner, errandEventKey } from "../src/core.js";

const NOW = new Date("2026-07-01T15:00:00Z");

describe("ErrandRoutePlanner", () => {
  it("seeds errands, route plan, alerts, and reminders", () => {
    const planner = createSeededPlanner(NOW);
    assert.equal(planner.errands.length, 4);
    assert.ok(planner.routePlan);
    assert.ok(planner.routePlan!.stops.length > 0);
    assert.ok(planner.alerts.length > 0);
    assert.ok(planner.reminders.length > 0);
  });

  it("uses stable errand event keys", () => {
    assert.equal(errandEventKey({ errandId: "errand-1", eventId: "abc" }), "errand-1:abc");
  });

  it("deduplicates errand events", () => {
    const planner = createSeededPlanner(NOW);
    const input = { eventId: "dup", errandId: "errand-groceries", type: "ERRAND_COMPLETED" as const, occurredAt: addMinutes(10, NOW) };
    assert.equal(planner.ingest(input).duplicate, false);
    assert.equal(planner.ingest(input).duplicate, true);
  });

  it("orders route stops by priority then deadline", () => {
    const planner = createSeededPlanner(NOW);
    assert.equal(planner.routePlan?.stops[0].errandId, "errand-pharmacy");
  });

  it("marks location updates as route-stale alerts", () => {
    const planner = createSeededPlanner(NOW);
    planner.ingest({ eventId: "loc", errandId: "errand-groceries", type: "LOCATION_UPDATED", lat: 37.8, lng: -122.4, occurredAt: NOW.toISOString() });
    assert.ok(planner.alerts.some((alert) => alert.kind === "ROUTE_STALE"));
  });

  it("marks completed errands and rebuilds route", () => {
    const planner = createSeededPlanner(NOW);
    planner.ingest({ eventId: "complete-pharmacy", errandId: "errand-pharmacy", type: "ERRAND_COMPLETED", occurredAt: addMinutes(5, NOW) });
    assert.equal(planner.errandById("errand-pharmacy").status, "COMPLETED");
    assert.ok(!planner.routePlan?.stops.some((stop) => stop.errandId === "errand-pharmacy"));
  });

  it("marks skipped errands", () => {
    const planner = createSeededPlanner(NOW);
    planner.ingest({ eventId: "skip-mail", errandId: "errand-mail", type: "ERRAND_SKIPPED", occurredAt: addMinutes(5, NOW) });
    assert.equal(planner.errandById("errand-mail").status, "SKIPPED");
  });

  it("detects missed windows", () => {
    const planner = createSeededPlanner(NOW);
    assert.equal(planner.errandById("errand-return").status, "MISSED");
    assert.ok(planner.alerts.some((alert) => alert.kind === "MISSED_WINDOW"));
  });

  it("queues high priority due alerts", () => {
    const planner = createSeededPlanner(NOW);
    assert.ok(planner.alerts.some((alert) => alert.kind === "HIGH_PRIORITY_DUE"));
  });

  it("detects duplicate semantic updates", () => {
    const planner = createSeededPlanner(NOW);
    planner.ingest({ eventId: "done-a", errandId: "errand-groceries", type: "ERRAND_COMPLETED", occurredAt: addMinutes(1, NOW) });
    planner.ingest({ eventId: "done-b", errandId: "errand-groceries", type: "ERRAND_COMPLETED", occurredAt: addMinutes(2, NOW) });
    assert.ok(planner.alerts.some((alert) => alert.kind === "DUPLICATE_UPDATE"));
  });

  it("deduplicates reminders across scans", () => {
    const planner = createSeededPlanner(NOW);
    const before = planner.reminders.length;
    planner.scanWindows(NOW);
    assert.equal(planner.reminders.length, before);
  });

  it("dispatches alerts and reminders", () => {
    const planner = createSeededPlanner(NOW);
    assert.ok(planner.dispatchAlerts() > 0);
    assert.ok(planner.dispatchReminders() > 0);
    assert.ok(planner.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(planner.reminders.every((reminder) => reminder.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const planner = createSeededPlanner(NOW);
    const result = planner.retain(0.001, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(planner.events.length, planner.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const planner = createSeededPlanner(NOW);
    planner.ensureJob("ROUTE_REBUILD");
    planner.failNextJob = true;
    assert.equal(planner.dispatchNextJob().job?.status, "RETRY");
    assert.equal(planner.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("exports and restores state", () => {
    const planner = createSeededPlanner(NOW);
    const restored = createSeededPlanner(NOW);
    restored.importState(planner.exportState());
    assert.equal(restored.errands.length, planner.errands.length);
    assert.equal(restored.events.length, planner.events.length);
    assert.equal(restored.alerts.length, planner.alerts.length);
  });
});
