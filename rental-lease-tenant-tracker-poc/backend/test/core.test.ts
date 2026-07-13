import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededRentalTracker, leaseEventKey, leaseRecordFingerprint } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("RentalLeaseTracker", () => {
  it("seeds lease records and alerts", () => {
    const tracker = createSeededRentalTracker(NOW);
    assert.equal(tracker.records.length, 7);
    assert.ok(tracker.alerts.length > 0);
  });

  it("uses stable event keys and record fingerprints", () => {
    assert.equal(leaseEventKey({ recordId: "rec-1", eventId: "abc" }), "rec-1:abc");
    assert.equal(leaseRecordFingerprint("lease-1", "NOTICE", " Rent  Increase ", " Landlord "), "lease-1:NOTICE:rent increase:landlord");
  });

  it("deduplicates lease events", () => {
    const tracker = createSeededRentalTracker(NOW);
    const input = { eventId: "dup", recordId: "rec-rent", type: "RENT_POSTED" as const, occurredAt: NOW.toISOString() };
    assert.equal(tracker.ingest(input).duplicate, false);
    assert.equal(tracker.ingest(input).duplicate, true);
  });

  it("updates rent records when paid", () => {
    const tracker = createSeededRentalTracker(NOW);
    tracker.ingest({ eventId: "paid", recordId: "rec-rent", type: "RENT_PAID", amount: 2250, occurredAt: NOW.toISOString() });
    assert.equal(tracker.recordById("rec-rent").status, "PAID");
  });

  it("ignores stale lease updates", () => {
    const tracker = createSeededRentalTracker(NOW);
    const before = tracker.recordById("rec-rent").amount;
    const result = tracker.ingest({ eventId: "old", recordId: "rec-rent", type: "RENT_POSTED", amount: 1, occurredAt: addMinutes(-30 * 24 * 60, NOW) });
    assert.equal(result.stale, true);
    assert.equal(tracker.recordById("rec-rent").amount, before);
  });

  it("creates new maintenance requests", () => {
    const tracker = createSeededRentalTracker(NOW);
    tracker.ingest({ eventId: "repair", recordId: "rec-heat", type: "MAINTENANCE_REQUESTED", title: "No heat", area: "MAINTENANCE", party: "Landlord", evidenceRef: "photos://thermostat", occurredAt: NOW.toISOString() });
    assert.equal(tracker.recordById("rec-heat").status, "OPEN");
  });

  it("detects duplicate uploaded notices", () => {
    const tracker = createSeededRentalTracker(NOW);
    tracker.ingest({ eventId: "notice-copy", recordId: "rec-notice-copy", type: "NOTICE_RECEIVED", leaseId: "lease-apt-42", title: "Rent increase notice", area: "NOTICE", party: "Landlord", evidenceRef: "inbox://copy.pdf", occurredAt: NOW.toISOString() });
    assert.equal(tracker.recordById("rec-notice-copy").status, "DUPLICATE");
    assert.ok(tracker.alerts.some((alert) => alert.kind === "DUPLICATE_DOCUMENT"));
  });

  it("detects rent due soon", () => {
    const tracker = createSeededRentalTracker(NOW);
    assert.equal(tracker.recordById("rec-rent").status, "DUE_SOON");
    assert.ok(tracker.alerts.some((alert) => alert.kind === "RENT_DUE"));
  });

  it("detects overdue repair response", () => {
    const tracker = createSeededRentalTracker(NOW);
    assert.equal(tracker.recordById("rec-repair").status, "OVERDUE");
    assert.ok(tracker.alerts.some((alert) => alert.kind === "REPAIR_OVERDUE"));
    assert.ok(tracker.alerts.some((alert) => alert.kind === "LANDLORD_RESPONSE_DUE"));
  });

  it("detects deposit return deadline", () => {
    const tracker = createSeededRentalTracker(NOW);
    assert.equal(tracker.recordById("rec-deposit").status, "DUE_SOON");
    assert.ok(tracker.alerts.some((alert) => alert.kind === "DEPOSIT_RETURN_DUE"));
  });

  it("detects renewal and move-out windows", () => {
    const tracker = createSeededRentalTracker(NOW);
    assert.ok(tracker.alerts.some((alert) => alert.kind === "RENEWAL_WINDOW"));
    assert.ok(tracker.alerts.some((alert) => alert.kind === "MOVE_OUT_NOTICE"));
  });

  it("marks landlord responses and evidence review as resolved", () => {
    const tracker = createSeededRentalTracker(NOW);
    tracker.ingest({ eventId: "respond", recordId: "rec-repair", type: "LANDLORD_RESPONDED", occurredAt: NOW.toISOString(), notes: "Plumber scheduled." });
    assert.equal(tracker.recordById("rec-repair").status, "RESPONDED");
    assert.equal(tracker.reviewEvidence(), 1);
    assert.equal(tracker.recordById("rec-repair").status, "RESOLVED");
  });

  it("records deposit disputes and returns", () => {
    const tracker = createSeededRentalTracker(NOW);
    tracker.ingest({ eventId: "deduction", recordId: "rec-deposit", type: "DEPOSIT_DEDUCTION_REPORTED", amount: 300, occurredAt: NOW.toISOString() });
    assert.equal(tracker.recordById("rec-deposit").status, "DISPUTED");
    tracker.ingest({ eventId: "returned", recordId: "rec-deposit", type: "DEPOSIT_RETURNED", amount: 1950, occurredAt: addMinutes(1, NOW) });
    assert.equal(tracker.recordById("rec-deposit").status, "RESOLVED");
  });

  it("dispatches alerts", () => {
    const tracker = createSeededRentalTracker(NOW);
    assert.ok(tracker.dispatchAlerts() > 0);
    assert.ok(tracker.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const tracker = createSeededRentalTracker(NOW);
    tracker.ingest({ eventId: "old-event", recordId: "rec-rent", type: "RENT_POSTED", occurredAt: addMinutes(-3000 * 24 * 60, NOW), amount: 2000 });
    const result = tracker.retain(365 * 7, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(tracker.events.length, tracker.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const tracker = createSeededRentalTracker(NOW);
    tracker.ensureJob("LEASE_SCAN");
    tracker.failNextJob = true;
    assert.equal(tracker.dispatchNextJob().job?.status, "RETRY");
    assert.equal(tracker.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const tracker = createSeededRentalTracker(NOW);
    assert.equal(tracker.ensureJob("ALERT_DISPATCH").id, tracker.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededRentalTracker(NOW);
    restored.importState(tracker.exportState());
    assert.equal(restored.records.length, tracker.records.length);
    assert.equal(restored.alerts.length, tracker.alerts.length);
  });
});
