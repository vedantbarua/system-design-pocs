import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededTracker, sleepEventKey } from "../src/core.js";

const NOW = new Date("2026-06-25T12:00:00Z");

describe("SleepRecoveryTracker", () => {
  it("seeds devices, sessions, and recovery metrics", () => {
    const tracker = createSeededTracker(NOW);
    assert.equal(tracker.devices.length, 3);
    assert.ok(tracker.sessions.length >= 7);
    assert.ok(tracker.dailyRecovery.length >= 7);
  });

  it("uses stable event keys", () => {
    assert.equal(sleepEventKey({ deviceId: "ring", eventId: "abc" }), "ring:abc");
  });

  it("deduplicates wearable events", () => {
    const tracker = createSeededTracker(NOW);
    const input = {
      eventId: "dup",
      userId: "user-ava",
      deviceId: "device-ring",
      type: "SLEEP_START" as const,
      occurredAt: addMinutes(20, NOW)
    };
    assert.equal(tracker.ingest(input).duplicate, false);
    assert.equal(tracker.ingest(input).duplicate, true);
  });

  it("pairs sleep start and wake events into a night session", () => {
    const tracker = createSeededTracker(NOW);
    tracker.ingest({
      eventId: "night-start",
      userId: "user-ava",
      deviceId: "device-ring",
      type: "SLEEP_START",
      occurredAt: "2026-07-01T03:30:00Z",
      quality: 86
    });
    tracker.ingest({
      eventId: "night-end",
      userId: "user-ava",
      deviceId: "device-ring",
      type: "WAKE",
      occurredAt: "2026-07-01T11:15:00Z",
      quality: 84
    });
    const session = tracker.sessions.find((candidate) => candidate.sourceEventIds.some((eventId) => tracker.events.find((event) => event.id === eventId)?.eventId === "night-start"));
    assert.equal(session?.durationMinutes, 465);
    assert.equal(session?.status, "COMPLETE");
  });

  it("rebuilds sessions correctly for out-of-order events", () => {
    const tracker = createSeededTracker(NOW);
    tracker.ingest({
      eventId: "late-wake",
      userId: "user-ava",
      deviceId: "device-ring",
      type: "WAKE",
      occurredAt: "2026-06-27T11:00:00Z"
    });
    tracker.ingest({
      eventId: "late-start",
      userId: "user-ava",
      deviceId: "device-ring",
      type: "SLEEP_START",
      occurredAt: "2026-06-27T03:00:00Z"
    });
    assert.ok(tracker.sessions.some((session) => session.startedAt === "2026-06-27T03:00:00.000Z" && session.durationMinutes === 480));
  });

  it("tracks open sessions when only a start event exists", () => {
    const tracker = createSeededTracker(NOW);
    tracker.ingest({
      eventId: "open-start",
      userId: "user-ava",
      deviceId: "device-phone",
      type: "SLEEP_START",
      occurredAt: "2026-07-02T03:00:00Z"
    });
    assert.ok(tracker.sessions.some((session) => session.status === "OPEN"));
  });

  it("computes sleep debt from the target night duration", () => {
    const tracker = createSeededTracker(NOW);
    const shortNight = tracker.dailyRecovery.find((row) => row.nightSleepMinutes < 390);
    assert.ok(shortNight);
    assert.ok(shortNight.sleepDebtMinutes > 0);
  });

  it("detects irregular bedtime alerts", () => {
    const tracker = createSeededTracker(NOW);
    assert.ok(tracker.alerts.some((alert) => alert.kind === "IRREGULAR_SLEEP"));
  });

  it("deduplicates alerts across projection rebuilds", () => {
    const tracker = createSeededTracker(NOW);
    const before = tracker.alerts.length;
    tracker.rebuildProjections();
    assert.equal(tracker.alerts.length, before);
  });

  it("dispatches queued alerts", () => {
    const tracker = createSeededTracker(NOW);
    assert.ok(tracker.dispatchAlerts() > 0);
    assert.ok(tracker.alerts.every((alert) => alert.status === "SENT"));
  });

  it("refreshes recommendations from latest recovery", () => {
    const tracker = createSeededTracker(NOW);
    assert.ok(tracker.recommendations.length > 0);
    assert.ok(tracker.recommendations[0].message.length > 0);
  });

  it("retains recent events and drops expired ones", () => {
    const tracker = createSeededTracker(NOW);
    const result = tracker.retain(1, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(tracker.events.length, tracker.processed.size);
  });

  it("validates event quality bounds", () => {
    const tracker = createSeededTracker(NOW);
    assert.throws(
      () =>
        tracker.ingest({
          eventId: "bad",
          userId: "user-ava",
          deviceId: "device-ring",
          type: "WAKE",
          quality: 200
        }),
      /quality/
    );
  });

  it("retries failed jobs and then completes them", () => {
    const tracker = createSeededTracker(NOW);
    tracker.ensureJob("RECOVERY_REBUILD");
    tracker.failNextJob = true;
    assert.equal(tracker.dispatchNextJob().job?.status, "RETRY");
    assert.equal(tracker.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs", () => {
    const tracker = createSeededTracker(NOW);
    assert.equal(tracker.ensureJob("RETENTION").id, tracker.ensureJob("RETENTION").id);
  });

  it("exports and restores state", () => {
    const tracker = createSeededTracker(NOW);
    const restored = createSeededTracker(NOW);
    restored.importState(tracker.exportState());
    assert.equal(restored.events.length, tracker.events.length);
    assert.equal(restored.sessions.length, tracker.sessions.length);
    assert.equal(restored.dailyRecovery.length, tracker.dailyRecovery.length);
  });
});
