import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededTriage, fingerprint, mailEventKey } from "../src/core.js";

const NOW = new Date("2026-07-02T15:00:00Z");

describe("MailTriage", () => {
  it("seeds mail, alerts, and reminders", () => {
    const triage = createSeededTriage(NOW);
    assert.equal(triage.mail.length, 5);
    assert.ok(triage.alerts.length > 0);
    assert.ok(triage.reminders.length > 0);
  });

  it("uses stable mail event keys and fingerprints", () => {
    assert.equal(mailEventKey({ mailId: "mail-1", eventId: "abc" }), "mail-1:abc");
    assert.equal(fingerprint(" Sender ", "Hello   World", null), "sender:hello world:none");
  });

  it("deduplicates scan events", () => {
    const triage = createSeededTriage(NOW);
    const input = { eventId: "dup", mailId: "mail-tax", type: "CLASSIFIED" as const, category: "TAX" as const, requiredAction: "FILE" as const };
    assert.equal(triage.ingest(input).duplicate, false);
    assert.equal(triage.ingest(input).duplicate, true);
  });

  it("updates classification and action status", () => {
    const triage = createSeededTriage(NOW);
    triage.ingest({ eventId: "classify", mailId: "mail-tax", type: "CLASSIFIED", category: "TAX", requiredAction: "RESPOND", dueAt: addMinutes(300, NOW) });
    const item = triage.mailById("mail-tax");
    assert.equal(item.requiredAction, "RESPOND");
    assert.equal(item.status, "ACTION_REQUIRED");
  });

  it("detects duplicate notices", () => {
    const triage = createSeededTriage(NOW);
    assert.ok(triage.alerts.some((alert) => alert.kind === "DUPLICATE_NOTICE"));
  });

  it("detects stale unreviewed mail", () => {
    const triage = createSeededTriage(NOW);
    assert.equal(triage.mailById("mail-junk").status, "STALE");
    assert.ok(triage.alerts.some((alert) => alert.kind === "STALE_UNREVIEWED"));
  });

  it("queues due-soon reminders", () => {
    const triage = createSeededTriage(NOW);
    assert.ok(triage.alerts.some((alert) => alert.kind === "DUE_SOON"));
    assert.ok(triage.reminders.length > 0);
  });

  it("detects overdue actions", () => {
    const triage = createSeededTriage(NOW);
    triage.ingest({ eventId: "overdue", mailId: "mail-tax", type: "CLASSIFIED", category: "TAX", requiredAction: "PAY", dueAt: addMinutes(-10, NOW) });
    assert.ok(triage.alerts.some((alert) => alert.kind === "OVERDUE"));
  });

  it("marks actions done and mail archived", () => {
    const triage = createSeededTriage(NOW);
    triage.ingest({ eventId: "done", mailId: "mail-electric", type: "ACTION_COMPLETED", occurredAt: NOW.toISOString() });
    triage.ingest({ eventId: "discard", mailId: "mail-junk", type: "MAIL_DISCARDED", occurredAt: NOW.toISOString() });
    assert.equal(triage.mailById("mail-electric").status, "DONE");
    assert.equal(triage.mailById("mail-junk").status, "ARCHIVED");
  });

  it("deduplicates reminders across scans", () => {
    const triage = createSeededTriage(NOW);
    const before = triage.reminders.length;
    triage.scanInbox(NOW);
    assert.equal(triage.reminders.length, before);
  });

  it("dispatches alerts and reminders", () => {
    const triage = createSeededTriage(NOW);
    assert.ok(triage.dispatchAlerts() > 0);
    assert.ok(triage.dispatchReminders() > 0);
    assert.ok(triage.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(triage.reminders.every((reminder) => reminder.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const triage = createSeededTriage(NOW);
    triage.ingest({ eventId: "old", mailId: "mail-tax", type: "CLASSIFIED", occurredAt: addMinutes(-200 * 24 * 60, NOW) });
    const result = triage.retain(90, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(triage.events.length, triage.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const triage = createSeededTriage(NOW);
    triage.ensureJob("INBOX_SCAN");
    triage.failNextJob = true;
    assert.equal(triage.dispatchNextJob().job?.status, "RETRY");
    assert.equal(triage.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs", () => {
    const triage = createSeededTriage(NOW);
    assert.equal(triage.ensureJob("ALERT_DISPATCH").id, triage.ensureJob("ALERT_DISPATCH").id);
  });

  it("exports and restores state", () => {
    const triage = createSeededTriage(NOW);
    const restored = createSeededTriage(NOW);
    restored.importState(triage.exportState());
    assert.equal(restored.mail.length, triage.mail.length);
    assert.equal(restored.alerts.length, triage.alerts.length);
  });
});
