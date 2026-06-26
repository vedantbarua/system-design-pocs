import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededMonitor, readingKey } from "../src/core.js";

const NOW = new Date("2026-06-26T15:00:00Z");

describe("AirQualityMonitor", () => {
  it("seeds rooms, sensors, rollups, and incidents", () => {
    const monitor = createSeededMonitor(NOW);
    assert.equal(monitor.rooms.length, 4);
    assert.equal(monitor.sensors.length, 4);
    assert.equal(monitor.rollups.length, 4);
    assert.ok(monitor.incidents.length > 0);
  });

  it("uses stable reading keys", () => {
    assert.equal(readingKey({ sensorId: "sensor", eventId: "abc" }), "sensor:abc");
  });

  it("deduplicates sensor readings", () => {
    const monitor = createSeededMonitor(NOW);
    const input = {
      eventId: "dup",
      roomId: "room-living",
      sensorId: "sensor-living",
      type: "MEASUREMENT" as const,
      pm25: 8,
      co2Ppm: 650,
      vocIndex: 120,
      humidityPct: 44,
      temperatureF: 71
    };
    assert.equal(monitor.ingest(input).duplicate, false);
    assert.equal(monitor.ingest(input).duplicate, true);
  });

  it("computes rolling room air-quality scores", () => {
    const monitor = createSeededMonitor(NOW);
    const office = monitor.rollups.find((rollup) => rollup.roomId === "room-office");
    assert.ok(office);
    assert.ok(office.airQualityScore < 100);
    assert.ok(office.averageCo2Ppm > 0);
  });

  it("accepts late event-time readings and rebuilds projections", () => {
    const monitor = createSeededMonitor(NOW);
    monitor.ingest({
      eventId: "late",
      roomId: "room-office",
      sensorId: "sensor-office",
      type: "MEASUREMENT",
      pm25: 62,
      co2Ppm: 1420,
      vocIndex: 650,
      humidityPct: 48,
      temperatureF: 72,
      observedAt: addMinutes(-15, NOW)
    });
    assert.ok(monitor.readings.some((reading) => reading.eventId === "late"));
    assert.ok(monitor.incidents.some((incident) => incident.roomId === "room-office" && incident.kind === "CO2_BUILDUP"));
  });

  it("detects stale sensors", () => {
    const monitor = createSeededMonitor(NOW);
    const basement = monitor.rollups.find((rollup) => rollup.roomId === "room-basement");
    assert.equal(basement?.staleSensors, 1);
    assert.ok(monitor.incidents.some((incident) => incident.kind === "SENSOR_STALE"));
  });

  it("groups consecutive unhealthy readings into incidents", () => {
    const monitor = createSeededMonitor(NOW);
    const co2 = monitor.incidents.find((incident) => incident.kind === "CO2_BUILDUP" && incident.roomId === "room-office");
    assert.ok(co2);
    assert.ok(co2.samples >= 2);
    assert.equal(co2.status, "RESOLVED");
  });

  it("queues deduplicated alerts for incidents", () => {
    const monitor = createSeededMonitor(NOW);
    const before = monitor.alerts.length;
    monitor.rebuildIncidents(NOW);
    assert.equal(monitor.alerts.length, before);
  });

  it("dispatches alerts", () => {
    const monitor = createSeededMonitor(NOW);
    assert.ok(monitor.dispatchAlerts() > 0);
    assert.ok(monitor.alerts.every((alert) => alert.status === "SENT"));
  });

  it("creates recommendations for unhealthy rooms", () => {
    const monitor = createSeededMonitor(NOW);
    assert.ok(monitor.recommendations.some((rec) => rec.priority === "HIGH"));
  });

  it("validates sensor metrics", () => {
    const monitor = createSeededMonitor(NOW);
    assert.throws(
      () =>
        monitor.ingest({
          eventId: "bad",
          roomId: "room-living",
          sensorId: "sensor-living",
          type: "MEASUREMENT",
          pm25: -1,
          co2Ppm: 500,
          vocIndex: 100,
          humidityPct: 45,
          temperatureF: 70
        }),
      /negative/
    );
  });

  it("retains recent readings and resets processed keys", () => {
    const monitor = createSeededMonitor(NOW);
    const result = monitor.retain(0.2, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(monitor.readings.length, monitor.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const monitor = createSeededMonitor(NOW);
    monitor.ensureJob("ROLLUP_REBUILD");
    monitor.failNextJob = true;
    assert.equal(monitor.dispatchNextJob().job?.status, "RETRY");
    assert.equal(monitor.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs", () => {
    const monitor = createSeededMonitor(NOW);
    assert.equal(monitor.ensureJob("RETENTION").id, monitor.ensureJob("RETENTION").id);
  });

  it("exports and restores state", () => {
    const monitor = createSeededMonitor(NOW);
    const restored = createSeededMonitor(NOW);
    restored.importState(monitor.exportState());
    assert.equal(restored.readings.length, monitor.readings.length);
    assert.equal(restored.incidents.length, monitor.incidents.length);
    assert.equal(restored.rollups.length, monitor.rollups.length);
  });
});
