import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededTaxOrganizer, taxDocumentFingerprint, taxEventKey } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("TaxDocumentOrganizer", () => {
  it("seeds documents and alerts", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    assert.equal(organizer.documents.length, 6);
    assert.ok(organizer.alerts.length > 0);
  });

  it("uses stable event keys and document fingerprints", () => {
    assert.equal(taxEventKey({ documentId: "doc-1", eventId: "abc" }), "doc-1:abc");
    assert.equal(taxDocumentFingerprint(2026, "W2", " Northwind  Labs ", " Ava "), "2026:W2:northwind labs:ava");
  });

  it("deduplicates tax document events", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    const input = { eventId: "dup", documentId: "doc-childcare", type: "DOCUMENT_CLASSIFIED" as const, occurredAt: NOW.toISOString() };
    assert.equal(organizer.ingest(input).duplicate, false);
    assert.equal(organizer.ingest(input).duplicate, true);
  });

  it("updates document metadata", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    organizer.ingest({ eventId: "update", documentId: "doc-childcare", type: "DOCUMENT_CLASSIFIED", amount: 4200, issuer: "Bright Start Center", occurredAt: NOW.toISOString() });
    const document = organizer.documentById("doc-childcare");
    assert.equal(document.amount, 4200);
    assert.equal(document.issuer, "Bright Start Center");
    assert.equal(document.status, "CLASSIFIED");
  });

  it("ignores stale document updates", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    const before = organizer.documentById("doc-w2").amount;
    const result = organizer.ingest({ eventId: "old", documentId: "doc-w2", type: "DOCUMENT_CLASSIFIED", amount: 1, occurredAt: addMinutes(-10 * 24 * 60, NOW) });
    assert.equal(result.stale, true);
    assert.equal(organizer.documentById("doc-w2").amount, before);
  });

  it("creates new received documents", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    organizer.ingest({ eventId: "new", documentId: "doc-1099-gig", type: "DOCUMENT_RECEIVED", taxYear: 2026, taxpayer: "Ava", name: "1099-NEC from Gig App", category: "FORM_1099", issuer: "Gig App", amount: 2500, storageRef: "inbox://1099-nec.pdf", occurredAt: NOW.toISOString() });
    assert.equal(organizer.documentById("doc-1099-gig").status, "RECEIVED");
  });

  it("detects duplicate received documents", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    organizer.ingest({ eventId: "copy", documentId: "doc-w2-copy", type: "DOCUMENT_RECEIVED", taxYear: 2026, taxpayer: "Ava", name: "W-2 duplicate", category: "W2", issuer: "Northwind Labs", amount: 84250, storageRef: "inbox://copy.pdf", occurredAt: NOW.toISOString() });
    assert.equal(organizer.documentById("doc-w2-copy").status, "DUPLICATE");
    assert.ok(organizer.alerts.some((alert) => alert.kind === "DUPLICATE_DOCUMENT"));
  });

  it("detects missing documents past due dates", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    assert.equal(organizer.documentById("doc-charity").status, "MISSING");
    assert.ok(organizer.alerts.some((alert) => alert.kind === "MISSING_DOCUMENT" && alert.documentId === "doc-charity"));
  });

  it("alerts on upcoming deadlines", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    assert.ok(organizer.alerts.some((alert) => alert.kind === "DEADLINE_SOON" && alert.documentId === "doc-mortgage"));
  });

  it("alerts when received documents need review", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    assert.equal(organizer.documentById("doc-childcare").status, "RECEIVED");
    assert.ok(organizer.alerts.some((alert) => alert.kind === "REVIEW_NEEDED" && alert.documentId === "doc-childcare"));
  });

  it("classifies pending documents", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    assert.equal(organizer.classifyPending(), 1);
    assert.equal(organizer.documentById("doc-childcare").status, "CLASSIFIED");
  });

  it("reviews and archives documents", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    organizer.ingest({ eventId: "review", documentId: "doc-childcare", type: "DOCUMENT_REVIEWED", occurredAt: NOW.toISOString() });
    organizer.ingest({ eventId: "archive", documentId: "doc-childcare", type: "DOCUMENT_ARCHIVED", occurredAt: addMinutes(1, NOW) });
    assert.equal(organizer.documentById("doc-childcare").status, "ARCHIVED");
  });

  it("dispatches alerts", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    assert.ok(organizer.dispatchAlerts() > 0);
    assert.ok(organizer.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    organizer.ingest({ eventId: "old-event", documentId: "doc-childcare", type: "DOCUMENT_CLASSIFIED", occurredAt: addMinutes(-3000 * 24 * 60, NOW) });
    const result = organizer.retain(2555, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(organizer.events.length, organizer.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    organizer.ensureJob("TAX_SCAN");
    organizer.failNextJob = true;
    assert.equal(organizer.dispatchNextJob().job?.status, "RETRY");
    assert.equal(organizer.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const organizer = createSeededTaxOrganizer(NOW);
    assert.equal(organizer.ensureJob("ALERT_DISPATCH").id, organizer.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededTaxOrganizer(NOW);
    restored.importState(organizer.exportState());
    assert.equal(restored.documents.length, organizer.documents.length);
    assert.equal(restored.alerts.length, organizer.alerts.length);
  });
});
