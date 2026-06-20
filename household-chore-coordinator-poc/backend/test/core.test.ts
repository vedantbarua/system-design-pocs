import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addHours, completionEventKey, createSeededCoordinator } from "../src/core.js";

const NOW = new Date("2026-06-20T18:00:00.000Z");

describe("HouseholdChoreCoordinator", () => {
  it("seeds members, routines, tasks, and an overdue item", () => {
    const coordinator = createSeededCoordinator(NOW);
    const snapshot = coordinator.snapshot() as { metrics: { routines: number; overdue: number; completed: number } };
    assert.equal(snapshot.metrics.routines, 5);
    assert.ok(snapshot.metrics.overdue >= 1);
    assert.equal(snapshot.metrics.completed, 1);
  });

  it("builds stable completion event keys", () => {
    assert.equal(completionEventKey({ taskId: "task-1", eventId: "event-1" }), "task-1:event-1");
  });

  it("materializes recurring occurrences idempotently", () => {
    const coordinator = createSeededCoordinator(NOW);
    const first = coordinator.materializeOccurrences(8, NOW);
    assert.equal(first.created, 0);
    assert.ok(first.existing > 0);
  });

  it("creates routines and future task instances", () => {
    const coordinator = createSeededCoordinator(NOW);
    const definition = coordinator.addDefinition({ name: "Water plants", area: "Living room", recurrenceDays: 3, effortPoints: 1, anchorAt: addHours(4, NOW) });
    const result = coordinator.materializeOccurrences(7, NOW);
    assert.ok(result.created >= 2);
    assert.ok(coordinator.tasks.some((task) => task.choreId === definition.id));
  });

  it("balances assignment by open effort points", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.tasks = [];
    coordinator.definitions = [];
    const definition = coordinator.addDefinition({ name: "Quick check", area: "General", recurrenceDays: 1, effortPoints: 1, anchorAt: addHours(1, NOW) });
    coordinator.materializeOccurrences(4, NOW);
    const assignees = new Set(coordinator.tasks.filter((task) => task.choreId === definition.id).map((task) => task.assignedTo));
    assert.ok(assignees.size > 1);
  });

  it("returns the same active lease to the same member", () => {
    const coordinator = createSeededCoordinator(NOW);
    const task = coordinator.tasks.find((item) => item.status === "OPEN")!;
    const first = coordinator.claimTask(task.id, "member-vedant", 15, NOW);
    const second = coordinator.claimTask(task.id, "member-vedant", 15, NOW);
    assert.equal(second.id, first.id);
  });

  it("prevents another member from taking an active lease", () => {
    const coordinator = createSeededCoordinator(NOW);
    const task = coordinator.tasks.find((item) => item.status === "OPEN")!;
    coordinator.claimTask(task.id, "member-vedant", 15, NOW);
    assert.throws(() => coordinator.claimTask(task.id, "member-maya", 15, NOW), /another member/);
  });

  it("allows lease takeover after expiration with a higher fencing token", () => {
    const coordinator = createSeededCoordinator(NOW);
    const task = coordinator.tasks.find((item) => item.status === "OPEN")!;
    const first = coordinator.claimTask(task.id, "member-vedant", 15, NOW);
    const second = coordinator.claimTask(task.id, "member-maya", 15, addHours(1, NOW));
    assert.ok(second.fencingToken > first.fencingToken);
  });

  it("rejects stale completion tokens after a lease is renewed", () => {
    const coordinator = createSeededCoordinator(NOW);
    const task = coordinator.tasks.find((item) => item.status === "OPEN")!;
    const first = coordinator.claimTask(task.id, "member-vedant", 15, NOW);
    coordinator.claimTask(task.id, "member-vedant", 15, addHours(1, NOW));
    assert.throws(() => coordinator.completeTask({ eventId: "offline-old", taskId: task.id, memberId: "member-vedant", fencingToken: first.fencingToken }), /stale fencing token/);
  });

  it("completes claimed tasks with the current fencing token", () => {
    const coordinator = createSeededCoordinator(NOW);
    const task = coordinator.tasks.find((item) => item.status === "OPEN")!;
    const lease = coordinator.claimTask(task.id, "member-maya", 15, NOW);
    const result = coordinator.completeTask({ eventId: "done-1", taskId: task.id, memberId: "member-maya", fencingToken: lease.fencingToken });
    assert.equal(result.task?.status, "COMPLETED");
  });

  it("deduplicates completion event replay", () => {
    const coordinator = createSeededCoordinator(NOW);
    const task = coordinator.tasks.find((item) => item.status === "OPEN")!;
    const lease = coordinator.claimTask(task.id, "member-alex", 15, NOW);
    const input = { eventId: "offline-1", taskId: task.id, memberId: "member-alex", fencingToken: lease.fencingToken };
    assert.equal(coordinator.completeTask(input).duplicate, false);
    assert.equal(coordinator.completeTask(input).duplicate, true);
  });

  it("marks overdue tasks and deduplicates reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    const first = coordinator.scanOverdue(addHours(30, NOW));
    const reminderCount = coordinator.reminders.length;
    const second = coordinator.scanOverdue(addHours(30, NOW));
    assert.ok(first.overdue > 0);
    assert.equal(second.reminders, 0);
    assert.equal(coordinator.reminders.length, reminderCount);
  });

  it("dispatches queued reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    const sent = coordinator.dispatchReminders();
    assert.ok(sent > 0);
    assert.equal(coordinator.reminders.every((item) => item.status === "SENT"), true);
  });

  it("retries failed jobs and recovers", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.queueJob("OVERDUE_SCAN");
    coordinator.failNextJob = true;
    assert.equal(coordinator.dispatchNextJob().job?.status, "RETRY");
    assert.equal(coordinator.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates jobs in the same time bucket", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.queueJob("WORKLOAD_REBUILD").id, coordinator.queueJob("WORKLOAD_REBUILD").id);
  });

  it("exports and imports coordinator state", () => {
    const coordinator = createSeededCoordinator(NOW);
    const restored = createSeededCoordinator(NOW);
    restored.importState(coordinator.exportState());
    assert.equal(restored.tasks.length, coordinator.tasks.length);
    assert.equal(restored.nextFencingToken, coordinator.nextFencingToken);
  });
});
