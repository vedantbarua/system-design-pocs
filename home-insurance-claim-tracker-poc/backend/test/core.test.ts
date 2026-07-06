import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, claimEventKey, createSeededTracker, evidenceFingerprint } from "../src/core.js";

const NOW = new Date("2026-07-06T15:00:00Z");

describe("InsuranceClaimTracker", () => {
  it("seeds claims, evidence, alerts, and reminders", () => {
    const tracker = createSeededTracker(NOW);
    assert.equal(tracker.claims.length, 4);
    assert.equal(tracker.evidence.length, 4);
    assert.ok(tracker.alerts.length > 0);
    assert.ok(tracker.reminders.length > 0);
  });

  it("uses stable event keys and evidence fingerprints", () => {
    assert.equal(claimEventKey({ claimId: "claim-1", eventId: "abc" }), "claim-1:abc");
    assert.equal(evidenceFingerprint("PHOTO", " Water   Damage ", "HASH-1"), "PHOTO:water damage:hash-1");
  });

  it("deduplicates claim events", () => {
    const tracker = createSeededTracker(NOW);
    const input = { eventId: "dup", claimId: "claim-water", type: "PROVIDER_UPDATED" as const, adjuster: "New Adjuster" };
    assert.equal(tracker.ingest(input).duplicate, false);
    assert.equal(tracker.ingest(input).duplicate, true);
  });

  it("updates provider claim metadata", () => {
    const tracker = createSeededTracker(NOW);
    tracker.ingest({ eventId: "update", claimId: "claim-water", type: "PROVIDER_UPDATED", status: "INSPECTION_SCHEDULED", adjuster: "Lena Ortiz", expectedPaymentCents: 500000 });
    const claim = tracker.claimById("claim-water");
    assert.equal(claim.status, "INSPECTION_SCHEDULED");
    assert.equal(claim.adjuster, "Lena Ortiz");
    assert.equal(claim.expectedPaymentCents, 500000);
  });

  it("ignores out-of-order provider updates", () => {
    const tracker = createSeededTracker(NOW);
    const before = tracker.claimById("claim-fire").status;
    const result = tracker.ingest({ eventId: "old", claimId: "claim-fire", type: "PROVIDER_UPDATED", occurredAt: addMinutes(-6 * 60, NOW), status: "WAITING_ON_DOCS" });
    assert.equal(result.stale, true);
    assert.equal(tracker.claimById("claim-fire").status, before);
  });

  it("detects duplicate evidence", () => {
    const tracker = createSeededTracker(NOW);
    assert.ok(tracker.alerts.some((alert) => alert.kind === "DUPLICATE_EVIDENCE"));
    assert.ok(tracker.evidence.some((item) => item.duplicateOf));
  });

  it("adds evidence and flags duplicate uploads", () => {
    const tracker = createSeededTracker(NOW);
    tracker.ingest({ eventId: "ev", claimId: "claim-water", type: "EVIDENCE_ADDED", evidenceKind: "PHOTO", evidenceLabel: "Basement standing water", evidenceHash: "hash-water-1" });
    assert.ok(tracker.evidence[0].duplicateOf);
    assert.ok(tracker.alerts.some((alert) => alert.kind === "DUPLICATE_EVIDENCE" && alert.claimId === "claim-water"));
  });

  it("queues document deadline reminders", () => {
    const tracker = createSeededTracker(NOW);
    assert.ok(tracker.alerts.some((alert) => alert.kind === "DOCUMENT_DEADLINE"));
    assert.ok(tracker.reminders.some((reminder) => reminder.dedupeKey.includes("DOCUMENT_DEADLINE")));
  });

  it("queues inspection reminders", () => {
    const tracker = createSeededTracker(NOW);
    assert.ok(tracker.alerts.some((alert) => alert.kind === "INSPECTION_SOON"));
    assert.ok(tracker.reminders.some((reminder) => reminder.dedupeKey.includes("INSPECTION_SOON")));
  });

  it("detects stale claims", () => {
    const tracker = createSeededTracker(NOW);
    assert.ok(tracker.alerts.some((alert) => alert.kind === "STALE_CLAIM" && alert.claimId === "claim-roof"));
    assert.equal(tracker.claimById("claim-roof").status, "STALE");
  });

  it("transitions payment and closure states", () => {
    const tracker = createSeededTracker(NOW);
    tracker.ingest({ eventId: "pay", claimId: "claim-water", type: "PAYMENT_ISSUED", occurredAt: NOW.toISOString(), expectedPaymentCents: 410000 });
    tracker.ingest({ eventId: "close", claimId: "claim-theft", type: "CLAIM_CLOSED", occurredAt: addMinutes(30, NOW), status: "DENIED" });
    assert.equal(tracker.claimById("claim-water").status, "PAID");
    assert.equal(tracker.claimById("claim-theft").status, "DENIED");
    assert.ok(tracker.alerts.some((alert) => alert.kind === "PAYMENT_READY"));
  });

  it("deduplicates reminders across scans", () => {
    const tracker = createSeededTracker(NOW);
    const before = tracker.reminders.length;
    tracker.scanClaims(NOW);
    assert.equal(tracker.reminders.length, before);
  });

  it("dispatches alerts and reminders", () => {
    const tracker = createSeededTracker(NOW);
    assert.ok(tracker.dispatchAlerts() > 0);
    assert.ok(tracker.dispatchReminders() > 0);
    assert.ok(tracker.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(tracker.reminders.every((reminder) => reminder.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const tracker = createSeededTracker(NOW);
    tracker.ingest({ eventId: "old-event", claimId: "claim-water", type: "PROVIDER_UPDATED", occurredAt: addMinutes(-500 * 24 * 60, NOW), adjuster: "Old Adjuster" });
    const result = tracker.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(tracker.events.length, tracker.processed.size);
  });

  it("retries failed jobs and restores state", () => {
    const tracker = createSeededTracker(NOW);
    tracker.ensureJob("CLAIM_SCAN");
    tracker.failNextJob = true;
    assert.equal(tracker.dispatchNextJob().job?.status, "RETRY");
    assert.equal(tracker.dispatchNextJob().job?.status, "COMPLETED");
    const restored = createSeededTracker(NOW);
    restored.importState(tracker.exportState());
    assert.equal(restored.claims.length, tracker.claims.length);
    assert.equal(restored.evidence.length, tracker.evidence.length);
  });
});
