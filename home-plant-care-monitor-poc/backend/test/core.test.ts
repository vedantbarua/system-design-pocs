import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededMonitor, plantEventKey } from "../src/core.js";

const NOW = new Date("2026-06-30T15:00:00Z");

describe("PlantCareMonitor", () => {
  it("seeds plants, sensors, statuses, alerts, and reminders", () => {
    const monitor = createSeededMonitor(NOW);
    assert.equal(monitor.plants.length, 4);
    assert.equal(monitor.sensors.length, 4);
    assert.equal(monitor.statuses.length, 4);
    assert.ok(monitor.alerts.length > 0);
    assert.ok(monitor.reminders.length > 0);
  });
  it("uses stable plant event keys", () => assert.equal(plantEventKey({ sensorId: "sensor-a", eventId: "abc" }), "sensor-a:abc"));
  it("deduplicates sensor events", () => {
    const monitor = createSeededMonitor(NOW);
    const input = { eventId: "dup", plantId: "plant-monstera", sensorId: "sensor-monstera", type: "SENSOR_READING" as const, moisturePct: 30, lightLux: 1200, temperatureF: 72 };
    assert.equal(monitor.ingest(input).duplicate, false);
    assert.equal(monitor.ingest(input).duplicate, true);
  });
  it("detects dry plants", () => {
    const monitor = createSeededMonitor(NOW);
    assert.equal(monitor.statuses.find((status) => status.plantId === "plant-monstera")?.careState, "MISSED_WATERING");
    assert.ok(monitor.alerts.some((alert) => alert.kind === "MISSED_WATERING" || alert.kind === "DRY_PLANT"));
  });
  it("detects overwatering risk", () => {
    const monitor = createSeededMonitor(NOW);
    assert.equal(monitor.statuses.find((status) => status.plantId === "plant-basil")?.careState, "MISSED_WATERING");
    monitor.ingest({ eventId: "fresh-wet", plantId: "plant-basil", sensorId: "sensor-basil", type: "WATERED", moisturePct: 90, lightLux: 1500, temperatureF: 73, observedAt: NOW.toISOString() });
    assert.equal(monitor.statuses.find((status) => status.plantId === "plant-basil")?.careState, "OVERWATERED");
  });
  it("detects low light", () => {
    const monitor = createSeededMonitor(NOW);
    assert.equal(monitor.statuses.find((status) => status.plantId === "plant-snake")?.careState, "LOW_LIGHT");
  });
  it("detects stale sensors", () => {
    const monitor = createSeededMonitor(NOW);
    assert.equal(monitor.statuses.find((status) => status.plantId === "plant-fern")?.careState, "STALE_SENSOR");
    assert.ok(monitor.alerts.some((alert) => alert.kind === "SENSOR_STALE"));
  });
  it("updates watering time and clears missed watering after watering", () => {
    const monitor = createSeededMonitor(NOW);
    monitor.ingest({ eventId: "watered", plantId: "plant-monstera", sensorId: "sensor-monstera", type: "WATERED", moisturePct: 50, lightLux: 1200, temperatureF: 72, observedAt: NOW.toISOString() });
    assert.equal(monitor.plant("plant-monstera").lastWateredAt, NOW.toISOString());
    assert.equal(monitor.statuses.find((status) => status.plantId === "plant-monstera")?.careState, "OK");
  });
  it("queues sensor offline alerts", () => {
    const monitor = createSeededMonitor(NOW);
    monitor.ingest({ eventId: "offline", plantId: "plant-snake", sensorId: "sensor-snake", type: "SENSOR_OFFLINE", observedAt: NOW.toISOString() });
    assert.equal(monitor.sensor("sensor-snake").status, "OFFLINE");
    assert.ok(monitor.alerts.some((alert) => alert.kind === "SENSOR_STALE"));
  });
  it("deduplicates reminders across repeated scans", () => {
    const monitor = createSeededMonitor(NOW);
    const before = monitor.reminders.length;
    monitor.scanCare(NOW);
    assert.equal(monitor.reminders.length, before);
  });
  it("dispatches alerts and reminders", () => {
    const monitor = createSeededMonitor(NOW);
    assert.ok(monitor.dispatchAlerts() > 0);
    assert.ok(monitor.dispatchReminders() > 0);
    assert.ok(monitor.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(monitor.reminders.every((reminder) => reminder.status === "SENT"));
  });
  it("validates sensor readings", () => {
    const monitor = createSeededMonitor(NOW);
    assert.throws(() => monitor.ingest({ eventId: "bad", plantId: "plant-monstera", sensorId: "sensor-monstera", type: "SENSOR_READING", moisturePct: 101 }), /moisture/);
  });
  it("retains recent events and resets processed keys", () => {
    const monitor = createSeededMonitor(NOW);
    const result = monitor.retain(0.001, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(monitor.events.length, monitor.processed.size);
  });
  it("retries failed jobs and then completes them", () => {
    const monitor = createSeededMonitor(NOW);
    monitor.ensureJob("REMINDER_DISPATCH");
    monitor.failNextJob = true;
    assert.equal(monitor.dispatchNextJob().job?.status, "RETRY");
    assert.equal(monitor.dispatchNextJob().job?.status, "COMPLETED");
  });
  it("exports and restores state", () => {
    const monitor = createSeededMonitor(NOW);
    const restored = createSeededMonitor(NOW);
    restored.importState(monitor.exportState());
    assert.equal(restored.plants.length, monitor.plants.length);
    assert.equal(restored.events.length, monitor.events.length);
    assert.equal(restored.alerts.length, monitor.alerts.length);
  });
});
