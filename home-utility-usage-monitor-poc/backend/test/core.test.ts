import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSeededMonitor, readingKey } from "../src/core.js";

describe("UtilityMonitor", () => {
  it("seeds meters, readings, rollups, and anomalies", () => {
    const monitor = createSeededMonitor();
    const snapshot = monitor.snapshot() as any;
    assert.equal(snapshot.metrics.meters, 2);
    assert.equal(snapshot.metrics.readings, 48);
    assert.ok(snapshot.metrics.openAlerts >= 2);
    assert.ok(snapshot.metrics.todayElectricityKwh > 0);
  });

  it("deduplicates readings by event id", () => {
    const monitor = createSeededMonitor();
    const input = { eventId: "dup-1", meterId: "meter-electric-main", measuredAt: "2026-06-15T23:00:00Z", value: 1.2 };
    const first = monitor.ingestReading(input);
    const second = monitor.ingestReading(input);
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
  });

  it("uses meter id and event id as a stable reading key", () => {
    assert.equal(
      readingKey({ eventId: "evt-1", meterId: "meter-a", measuredAt: "2026-06-15T00:00:00Z", value: 1 }),
      "meter-a:evt-1"
    );
  });

  it("accepts out-of-order readings and recomputes the affected hour", () => {
    const monitor = createSeededMonitor();
    const before = monitor.rollupsFor("meter-electric-main").find((item) => item.bucket === "2026-06-15T03:00:00.000Z")?.usage;
    monitor.ingestReading({ eventId: "late-03", meterId: "meter-electric-main", measuredAt: "2026-06-15T03:35:00Z", value: 0.4 });
    const after = monitor.rollupsFor("meter-electric-main").find((item) => item.bucket === "2026-06-15T03:00:00.000Z")?.usage;
    assert.equal(Number(after), Number(before) + 0.4);
  });

  it("corrections supersede an original event and reprocess projections", () => {
    const monitor = createSeededMonitor();
    const original = monitor.ingestReading({ eventId: "bad-water", meterId: "meter-water-main", measuredAt: "2026-06-15T10:00:00Z", value: 100 });
    assert.ok(original.reading);
    const corrected = monitor.ingestReading({
      eventId: "fix-water",
      meterId: "meter-water-main",
      measuredAt: "2026-06-15T10:00:00Z",
      value: 4,
      correctionOf: "bad-water"
    });
    assert.ok(corrected.reading?.corrected);
    const bucket = monitor.rollupsFor("meter-water-main").find((item) => item.bucket === "2026-06-15T10:00:00.000Z");
    assert.ok(bucket);
    assert.ok(bucket.usage < 110);
  });

  it("reprocesses a range after corrected readings", () => {
    const monitor = createSeededMonitor();
    const result = monitor.reprocessRange("meter-electric-main", "2026-06-15T00:00:00Z", "2026-06-15T23:59:00Z");
    assert.ok(result.buckets.some((bucket) => bucket.startsWith("hour:")));
    assert.ok(result.buckets.some((bucket) => bucket.startsWith("day:")));
  });

  it("detects a usage spike", () => {
    const monitor = createSeededMonitor();
    const before = monitor.alerts.length;
    monitor.ingestReading({ eventId: "spike-extra", meterId: "meter-electric-main", measuredAt: "2026-06-15T18:20:00Z", value: 20 });
    const result = monitor.runAnomalyDetection("2026-06-15T23:55:00Z");
    assert.ok(result.created >= 1);
    assert.ok(monitor.alerts.length > before);
    assert.ok(monitor.alerts.some((alert) => alert.type === "USAGE_SPIKE"));
  });

  it("detects possible overnight water leak", () => {
    const monitor = createSeededMonitor();
    assert.ok(monitor.alerts.some((alert) => alert.type === "POSSIBLE_LEAK"));
  });

  it("detects missing readings and marks meter stale", () => {
    const monitor = createSeededMonitor();
    monitor.runAnomalyDetection("2026-06-16T04:30:00Z");
    assert.equal(monitor.meter("meter-electric-main").status, "STALE");
    assert.ok(monitor.alerts.some((alert) => alert.type === "MISSING_READINGS"));
  });

  it("deduplicates open alerts by key", () => {
    const monitor = createSeededMonitor();
    const firstCount = monitor.alerts.length;
    monitor.runAnomalyDetection("2026-06-15T23:55:00Z");
    assert.equal(monitor.alerts.length, firstCount);
  });

  it("acknowledges alerts idempotently", () => {
    const monitor = createSeededMonitor();
    const alert = monitor.alerts[0];
    const first = monitor.acknowledgeAlert(alert.id, "user-vedant");
    const second = monitor.acknowledgeAlert(alert.id, "user-vedant");
    assert.equal(first.id, second.id);
    assert.equal(second.status, "ACKNOWLEDGED");
  });

  it("notification worker retries provider failure and recovers", () => {
    const monitor = createSeededMonitor();
    monitor.failNextDelivery = true;
    const failed = monitor.workerTick();
    const failedStatus = failed.job?.status;
    const recovered = monitor.workerTick();
    assert.equal(failedStatus, "RETRY");
    assert.equal(recovered.job?.status, "COMPLETED");
    assert.ok(monitor.deliveries.length > 0);
  });

  it("delivery receipts are deduplicated if a job is replayed", () => {
    const monitor = createSeededMonitor();
    const job = monitor.jobs[0];
    monitor.workerTick();
    const count = monitor.deliveries.length;
    job.status = "READY";
    monitor.workerTick();
    assert.equal(monitor.deliveries.length, count);
  });
});
