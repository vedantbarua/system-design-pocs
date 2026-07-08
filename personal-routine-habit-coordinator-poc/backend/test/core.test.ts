import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededCoordinator, habitEventKey, windowKey } from "../src/core.js";

const NOW = new Date("2026-07-08T15:00:00Z");

describe("RoutineHabitCoordinator", () => {
  it("seeds habits, logs, alerts, and reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.habits.length, 6);
    assert.equal(coordinator.logs.length, 1);
    assert.ok(coordinator.alerts.length > 0);
    assert.ok(coordinator.reminders.length > 0);
  });

  it("uses stable event keys and window keys", () => {
    assert.equal(habitEventKey({ habitId: "habit-1", eventId: "abc" }), "habit-1:abc");
    assert.equal(windowKey("2026-07-08T15:00:00Z"), "2026-07-08");
  });

  it("deduplicates habit events", () => {
    const coordinator = createSeededCoordinator(NOW);
    const input = { eventId: "dup", habitId: "habit-read", type: "HABIT_UPDATED" as const, title: "Read 25 minutes" };
    assert.equal(coordinator.ingest(input).duplicate, false);
    assert.equal(coordinator.ingest(input).duplicate, true);
  });

  it("updates habit metadata", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "update", habitId: "habit-read", type: "HABIT_UPDATED", title: "Read 30 minutes", owner: "Noah" });
    const habit = coordinator.habitById("habit-read");
    assert.equal(habit.title, "Read 30 minutes");
    assert.equal(habit.owner, "Noah");
  });

  it("ignores out-of-order habit edits", () => {
    const coordinator = createSeededCoordinator(NOW);
    const before = coordinator.habitById("habit-vitamins").title;
    const result = coordinator.ingest({ eventId: "old", habitId: "habit-vitamins", type: "HABIT_UPDATED", occurredAt: addMinutes(-3 * 60, NOW), title: "Old vitamin title" });
    assert.equal(result.stale, true);
    assert.equal(coordinator.habitById("habit-vitamins").title, before);
  });

  it("checks in habits and increments streaks", () => {
    const coordinator = createSeededCoordinator(NOW);
    const before = coordinator.habitById("habit-water").streak;
    coordinator.ingest({ eventId: "checkin", habitId: "habit-water", type: "CHECKED_IN", occurredAt: NOW.toISOString() });
    assert.equal(coordinator.habitById("habit-water").status, "DONE");
    assert.equal(coordinator.habitById("habit-water").streak, before + 1);
  });

  it("detects duplicate check-ins", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "checkin-1", habitId: "habit-water", type: "CHECKED_IN", occurredAt: NOW.toISOString() });
    coordinator.ingest({ eventId: "checkin-2", habitId: "habit-water", type: "CHECKED_IN", occurredAt: addMinutes(10, NOW) });
    assert.ok(coordinator.logs.some((log) => log.duplicateOf));
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "DUPLICATE_CHECKIN"));
  });

  it("skips habits and breaks streaks", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "skip", habitId: "habit-vitamins", type: "SKIPPED", occurredAt: NOW.toISOString() });
    assert.equal(coordinator.habitById("habit-vitamins").status, "SKIPPED");
    assert.equal(coordinator.habitById("habit-vitamins").streak, 0);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "STREAK_BROKEN"));
  });

  it("detects missed windows", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.habitById("habit-walk").status, "MISSED");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "MISSED_WINDOW"));
  });

  it("detects overloaded routine windows", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "OVERLOADED_WINDOW"));
    assert.equal(coordinator.habitById("habit-dishes").status, "OVERLOADED");
  });

  it("queues due soon reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "DUE_SOON"));
    assert.ok(coordinator.reminders.some((reminder) => reminder.dedupeKey.includes("DUE_SOON")));
  });

  it("deduplicates reminders across scans", () => {
    const coordinator = createSeededCoordinator(NOW);
    const before = coordinator.reminders.length;
    coordinator.scanRoutines(NOW);
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
    coordinator.ingest({ eventId: "old-event", habitId: "habit-read", type: "HABIT_UPDATED", occurredAt: addMinutes(-500 * 24 * 60, NOW), title: "Old read habit" });
    const result = coordinator.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(coordinator.events.length, coordinator.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ensureJob("ROUTINE_SCAN");
    coordinator.failNextJob = true;
    assert.equal(coordinator.dispatchNextJob().job?.status, "RETRY");
    assert.equal(coordinator.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.ensureJob("ALERT_DISPATCH").id, coordinator.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededCoordinator(NOW);
    restored.importState(coordinator.exportState());
    assert.equal(restored.habits.length, coordinator.habits.length);
    assert.equal(restored.logs.length, coordinator.logs.length);
  });
});
