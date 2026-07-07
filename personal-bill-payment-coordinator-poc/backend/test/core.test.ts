import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, billEventKey, billFingerprint, createSeededCoordinator } from "../src/core.js";

const NOW = new Date("2026-07-07T15:00:00Z");

describe("BillPaymentCoordinator", () => {
  it("seeds bills, payments, alerts, and reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.bills.length, 6);
    assert.equal(coordinator.payments.length, 2);
    assert.ok(coordinator.alerts.length > 0);
    assert.ok(coordinator.reminders.length > 0);
  });

  it("uses stable event keys and bill fingerprints", () => {
    assert.equal(billEventKey({ billId: "bill-1", eventId: "abc" }), "bill-1:abc");
    assert.equal(billFingerprint(" City   Electric ", "8841", "2026-07-08T15:00:00Z"), "city electric:8841:2026-07-08");
  });

  it("deduplicates bill events", () => {
    const coordinator = createSeededCoordinator(NOW);
    const input = { eventId: "dup", billId: "bill-electric", type: "BILL_UPDATED" as const, amountCents: 15000 };
    assert.equal(coordinator.ingest(input).duplicate, false);
    assert.equal(coordinator.ingest(input).duplicate, true);
  });

  it("updates statement metadata and flags amount changes", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "statement", billId: "bill-phone", type: "STATEMENT_RECEIVED", amountCents: 13000, dueAt: addMinutes(8 * 24 * 60, NOW) });
    const bill = coordinator.billById("bill-phone");
    assert.equal(bill.amountCents, 13000);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "AMOUNT_CHANGED" && alert.billId === "bill-phone"));
  });

  it("ignores out-of-order payment updates", () => {
    const coordinator = createSeededCoordinator(NOW);
    const before = coordinator.billById("bill-internet").status;
    const result = coordinator.ingest({ eventId: "old", billId: "bill-internet", type: "PAYMENT_CONFIRMED", occurredAt: addMinutes(-5 * 60, NOW), confirmationCode: "OLD" });
    assert.equal(result.stale, true);
    assert.equal(coordinator.billById("bill-internet").status, before);
  });

  it("detects duplicate bills", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "DUPLICATE_BILL"));
  });

  it("queues due soon reminders", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "DUE_SOON"));
    assert.ok(coordinator.reminders.some((reminder) => reminder.dedupeKey.includes("DUE_SOON")));
  });

  it("detects overdue bills", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.billById("bill-card").status, "OVERDUE");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "OVERDUE" && alert.billId === "bill-card"));
  });

  it("handles autopay failures", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "fail", billId: "bill-electric", type: "AUTOPAY_FAILED", occurredAt: NOW.toISOString() });
    assert.equal(coordinator.billById("bill-electric").status, "AUTOPAY_FAILED");
    assert.ok(coordinator.alerts.some((alert) => alert.kind === "AUTOPAY_FAILED" && alert.billId === "bill-electric"));
  });

  it("schedules and confirms payments", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ingest({ eventId: "schedule", billId: "bill-rent", type: "PAYMENT_SCHEDULED", occurredAt: NOW.toISOString(), dueAt: addMinutes(12 * 60, NOW), paymentMethod: "Checking" });
    assert.equal(coordinator.billById("bill-rent").status, "SCHEDULED");
    coordinator.ingest({ eventId: "confirm", billId: "bill-rent", type: "PAYMENT_CONFIRMED", occurredAt: addMinutes(60, NOW), confirmationCode: "ACH-100" });
    assert.equal(coordinator.billById("bill-rent").status, "PAID");
    assert.equal(coordinator.billById("bill-rent").confirmationCode, "ACH-100");
  });

  it("deduplicates reminders across scans", () => {
    const coordinator = createSeededCoordinator(NOW);
    const before = coordinator.reminders.length;
    coordinator.scanBills(NOW);
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
    coordinator.ingest({ eventId: "old-event", billId: "bill-phone", type: "BILL_UPDATED", occurredAt: addMinutes(-500 * 24 * 60, NOW), amountCents: 11100 });
    const result = coordinator.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(coordinator.events.length, coordinator.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const coordinator = createSeededCoordinator(NOW);
    coordinator.ensureJob("BILL_SCAN");
    coordinator.failNextJob = true;
    assert.equal(coordinator.dispatchNextJob().job?.status, "RETRY");
    assert.equal(coordinator.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const coordinator = createSeededCoordinator(NOW);
    assert.equal(coordinator.ensureJob("ALERT_DISPATCH").id, coordinator.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededCoordinator(NOW);
    restored.importState(coordinator.exportState());
    assert.equal(restored.bills.length, coordinator.bills.length);
    assert.equal(restored.payments.length, coordinator.payments.length);
  });
});
