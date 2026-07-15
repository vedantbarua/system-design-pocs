import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededMove, moveEventKey, moveTaskFingerprint } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("MovingCoordinator", () => {
  it("seeds move tasks, boxes, vendors, and alerts", () => {
    const move = createSeededMove(NOW);
    assert.equal(move.tasks.length, 7);
    assert.equal(move.boxes.length, 4);
    assert.equal(move.vendors.length, 2);
    assert.ok(move.alerts.length > 0);
  });

  it("uses stable event keys and task fingerprints", () => {
    assert.equal(moveEventKey({ taskId: "task-1", eventId: "abc" }), "task-1:abc");
    assert.equal(moveTaskFingerprint("UTILITY", " Start  Power ", " Ava "), "UTILITY:start power:ava");
  });

  it("deduplicates move events", () => {
    const move = createSeededMove(NOW);
    const input = { eventId: "dup", taskId: "task-mail", type: "TASK_UPDATED" as const, occurredAt: NOW.toISOString() };
    assert.equal(move.ingest(input).duplicate, false);
    assert.equal(move.ingest(input).duplicate, true);
  });

  it("updates task metadata", () => {
    const move = createSeededMove(NOW);
    move.ingest({ eventId: "update", taskId: "task-keys", type: "TASK_UPDATED", owner: "Noah", notes: "Bring both IDs.", occurredAt: NOW.toISOString() });
    const task = move.taskById("task-keys");
    assert.equal(task.owner, "Noah");
    assert.equal(task.notes, "Bring both IDs.");
  });

  it("ignores stale move updates", () => {
    const move = createSeededMove(NOW);
    const before = move.taskById("task-movers").owner;
    const result = move.ingest({ eventId: "old", taskId: "task-movers", type: "TASK_UPDATED", owner: "Late update", occurredAt: addMinutes(-20 * 24 * 60, NOW) });
    assert.equal(result.stale, true);
    assert.equal(move.taskById("task-movers").owner, before);
  });

  it("creates and completes new move tasks", () => {
    const move = createSeededMove(NOW);
    move.ingest({ eventId: "create", taskId: "task-school", type: "TASK_CREATED", title: "Update school address", area: "ADDRESS_CHANGE", owner: "Ava", dueAt: addMinutes(5 * 24 * 60, NOW), occurredAt: NOW.toISOString() });
    move.ingest({ eventId: "done", taskId: "task-school", type: "ADDRESS_UPDATED", occurredAt: addMinutes(1, NOW) });
    assert.equal(move.taskById("task-school").status, "DONE");
  });

  it("detects duplicate move tasks", () => {
    const move = createSeededMove(NOW);
    move.ingest({ eventId: "dupe", taskId: "task-mail-copy", type: "TASK_CREATED", title: "Set mail forwarding", area: "ADDRESS_CHANGE", owner: "Noah", dueAt: addMinutes(3 * 24 * 60, NOW), occurredAt: NOW.toISOString() });
    assert.equal(move.taskById("task-mail-copy").status, "DUPLICATE");
    assert.ok(move.alerts.some((alert) => alert.kind === "DUPLICATE_TASK"));
  });

  it("packs boxes and updates packing tasks", () => {
    const move = createSeededMove(NOW);
    move.ingest({ eventId: "pack", taskId: "task-pack-kitchen", type: "BOX_PACKED", relatedRef: "box-kitchen-essentials", room: "Kitchen", boxLabel: "Kitchen essentials", fragile: true, essentials: true, occurredAt: NOW.toISOString() });
    assert.equal(move.taskById("task-pack-kitchen").status, "PACKED");
    assert.equal(move.boxes.find((box) => box.id === "box-kitchen-essentials")?.packed, true);
  });

  it("books movers and can confirm vendors", () => {
    const move = createSeededMove(NOW);
    move.ingest({ eventId: "book", taskId: "task-storage", type: "MOVER_BOOKED", title: "Book storage unit", area: "MOVER", relatedRef: "vendor-storage", vendorName: "BoxStorage", vendorKind: "STORAGE", arrivalWindow: addMinutes(4 * 24 * 60, NOW), deposit: 120, occurredAt: NOW.toISOString() });
    assert.equal(move.vendors.find((vendor) => vendor.id === "vendor-storage")?.status, "BOOKED");
    assert.ok(move.confirmVendors() > 0);
  });

  it("detects overdue and due-soon tasks", () => {
    const move = createSeededMove(NOW);
    assert.equal(move.taskById("task-inspection").status, "OVERDUE");
    assert.equal(move.taskById("task-power").status, "DUE_SOON");
    assert.ok(move.alerts.some((alert) => alert.kind === "DEADLINE_DUE"));
  });

  it("detects missing essentials and unpacked high-priority boxes", () => {
    const move = createSeededMove(NOW);
    assert.ok(move.alerts.some((alert) => alert.kind === "MISSING_ESSENTIALS"));
    assert.ok(move.alerts.some((alert) => alert.kind === "UNPACKED_PRIORITY"));
  });

  it("detects unconfirmed vendors", () => {
    const move = createSeededMove(NOW);
    assert.ok(move.alerts.some((alert) => alert.kind === "VENDOR_UNCONFIRMED"));
  });

  it("tracks and resolves move issues", () => {
    const move = createSeededMove(NOW);
    move.ingest({ eventId: "issue", taskId: "task-movers", type: "ISSUE_REPORTED", notes: "Mover changed window.", occurredAt: NOW.toISOString() });
    assert.equal(move.taskById("task-movers").status, "BLOCKED");
    assert.ok(move.alerts.some((alert) => alert.kind === "ISSUE_OPEN"));
    move.ingest({ eventId: "resolved", taskId: "task-movers", type: "ISSUE_RESOLVED", occurredAt: addMinutes(1, NOW) });
    assert.equal(move.taskById("task-movers").status, "DONE");
  });

  it("dispatches alerts", () => {
    const move = createSeededMove(NOW);
    assert.ok(move.dispatchAlerts() > 0);
    assert.ok(move.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const move = createSeededMove(NOW);
    move.ingest({ eventId: "old-event", taskId: "task-mail", type: "TASK_UPDATED", occurredAt: addMinutes(-500 * 24 * 60, NOW) });
    const result = move.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(move.events.length, move.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const move = createSeededMove(NOW);
    move.ensureJob("MOVE_SCAN");
    move.failNextJob = true;
    assert.equal(move.dispatchNextJob().job?.status, "RETRY");
    assert.equal(move.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const move = createSeededMove(NOW);
    assert.equal(move.ensureJob("REMINDER_DISPATCH").id, move.ensureJob("REMINDER_DISPATCH").id);
    const restored = createSeededMove(NOW);
    restored.importState(move.exportState());
    assert.equal(restored.tasks.length, move.tasks.length);
    assert.equal(restored.boxes.length, move.boxes.length);
    assert.equal(restored.alerts.length, move.alerts.length);
  });
});
