import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, applicationEventKey, createSeededJobTracker, postingFingerprint } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("JobApplicationTracker", () => {
  it("seeds applications, interviews, offers, and alerts", () => {
    const tracker = createSeededJobTracker(NOW);
    assert.equal(tracker.applications.length, 6);
    assert.equal(tracker.interviews.length, 2);
    assert.equal(tracker.offers.length, 1);
    assert.ok(tracker.alerts.length > 0);
  });

  it("uses stable event keys and posting fingerprints", () => {
    assert.equal(applicationEventKey({ applicationId: "app-1", eventId: "abc" }), "app-1:abc");
    assert.equal(postingFingerprint(" Northwind  Labs ", " Senior  Engineer ", " Remote "), "northwind labs:senior engineer:remote");
  });

  it("deduplicates application events", () => {
    const tracker = createSeededJobTracker(NOW);
    const input = { eventId: "dup", applicationId: "app-contoso", type: "STATUS_CHANGED" as const, status: "SCREEN" as const, occurredAt: NOW.toISOString() };
    assert.equal(tracker.ingest(input).duplicate, false);
    assert.equal(tracker.ingest(input).duplicate, true);
  });

  it("updates application metadata", () => {
    const tracker = createSeededJobTracker(NOW);
    tracker.ingest({ eventId: "update", applicationId: "app-contoso", type: "APPLICATION_UPDATED", salaryMax: 180000, priority: "HIGH", notes: "Recruiter replied.", occurredAt: NOW.toISOString() });
    const application = tracker.applicationById("app-contoso");
    assert.equal(application.salaryMax, 180000);
    assert.equal(application.priority, "HIGH");
    assert.equal(application.notes, "Recruiter replied.");
  });

  it("ignores stale application updates", () => {
    const tracker = createSeededJobTracker(NOW);
    const before = tracker.applicationById("app-northwind").salaryMax;
    const result = tracker.ingest({ eventId: "old", applicationId: "app-northwind", type: "APPLICATION_UPDATED", salaryMax: 1, occurredAt: addMinutes(-10 * 24 * 60, NOW) });
    assert.equal(result.stale, true);
    assert.equal(tracker.applicationById("app-northwind").salaryMax, before);
  });

  it("adds new applications", () => {
    const tracker = createSeededJobTracker(NOW);
    tracker.ingest({ eventId: "new", applicationId: "app-wingtip", type: "APPLICATION_ADDED", company: "Wingtip", role: "Backend Engineer", source: "Wellfound", location: "Remote", salaryMin: 130000, salaryMax: 165000, status: "APPLIED", occurredAt: NOW.toISOString() });
    assert.equal(tracker.applicationById("app-wingtip").company, "Wingtip");
  });

  it("detects duplicate job postings", () => {
    const tracker = createSeededJobTracker(NOW);
    tracker.ingest({ eventId: "dupe-post", applicationId: "app-northwind-copy", type: "APPLICATION_ADDED", company: "Northwind Labs", role: "Senior Frontend Engineer", source: "Indeed", location: "Remote", salaryMin: 150000, salaryMax: 185000, status: "SAVED", occurredAt: NOW.toISOString() });
    assert.equal(tracker.applicationById("app-northwind-copy").status, "DUPLICATE");
    assert.ok(tracker.alerts.some((alert) => alert.kind === "DUPLICATE_POSTING"));
  });

  it("schedules interviews and alerts for upcoming rounds", () => {
    const tracker = createSeededJobTracker(NOW);
    tracker.ingest({ eventId: "schedule", applicationId: "app-contoso", type: "INTERVIEW_SCHEDULED", round: "Hiring manager", scheduledAt: addMinutes(6 * 60, NOW), occurredAt: NOW.toISOString() });
    assert.equal(tracker.applicationById("app-contoso").status, "INTERVIEW");
    assert.ok(tracker.alerts.some((alert) => alert.kind === "INTERVIEW_UPCOMING" && alert.applicationId === "app-contoso"));
  });

  it("creates thank-you reminders after completed interviews", () => {
    const tracker = createSeededJobTracker(NOW);
    tracker.ingest({ eventId: "complete", applicationId: "app-northwind", type: "INTERVIEW_COMPLETED", round: "Panel", occurredAt: NOW.toISOString() });
    assert.ok(tracker.alerts.some((alert) => alert.kind === "THANK_YOU_DUE" && alert.applicationId === "app-northwind"));
  });

  it("tracks offers and offer deadlines", () => {
    const tracker = createSeededJobTracker(NOW);
    tracker.ingest({ eventId: "offer", applicationId: "app-contoso", type: "OFFER_RECEIVED", offerSalary: 170000, offerBonus: 15000, offerDeadlineAt: addMinutes(2 * 24 * 60, NOW), occurredAt: NOW.toISOString() });
    assert.equal(tracker.applicationById("app-contoso").status, "OFFER");
    assert.ok(tracker.offers.some((offer) => offer.applicationId === "app-contoso"));
    assert.ok(tracker.alerts.some((alert) => alert.kind === "OFFER_DEADLINE" && alert.applicationId === "app-contoso"));
  });

  it("detects follow-up due applications", () => {
    const tracker = createSeededJobTracker(NOW);
    assert.equal(tracker.applicationById("app-contoso").status, "FOLLOW_UP_DUE");
    assert.ok(tracker.alerts.some((alert) => alert.kind === "FOLLOW_UP_DUE" && alert.applicationId === "app-contoso"));
  });

  it("detects stale applications", () => {
    const tracker = createSeededJobTracker(NOW);
    assert.equal(tracker.applicationById("app-adatum").status, "STALE");
    assert.ok(tracker.alerts.some((alert) => alert.kind === "STALE_APPLICATION" && alert.applicationId === "app-adatum"));
  });

  it("logs follow-ups and resume versions", () => {
    const tracker = createSeededJobTracker(NOW);
    tracker.ingest({ eventId: "follow", applicationId: "app-contoso", type: "FOLLOW_UP_LOGGED", nextActionAt: addMinutes(5 * 24 * 60, NOW), occurredAt: NOW.toISOString() });
    tracker.ingest({ eventId: "resume", applicationId: "app-contoso", type: "RESUME_ATTACHED", resumeVersion: "platform-v3", occurredAt: addMinutes(1, NOW) });
    assert.equal(tracker.applicationById("app-contoso").resumeVersion, "platform-v3");
  });

  it("dispatches alerts", () => {
    const tracker = createSeededJobTracker(NOW);
    assert.ok(tracker.dispatchAlerts() > 0);
    assert.ok(tracker.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const tracker = createSeededJobTracker(NOW);
    tracker.ingest({ eventId: "old-event", applicationId: "app-contoso", type: "STATUS_CHANGED", status: "SCREEN", occurredAt: addMinutes(-900 * 24 * 60, NOW) });
    const result = tracker.retain(730, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(tracker.events.length, tracker.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const tracker = createSeededJobTracker(NOW);
    tracker.ensureJob("APPLICATION_SCAN");
    tracker.failNextJob = true;
    assert.equal(tracker.dispatchNextJob().job?.status, "RETRY");
    assert.equal(tracker.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const tracker = createSeededJobTracker(NOW);
    assert.equal(tracker.ensureJob("REMINDER_DISPATCH").id, tracker.ensureJob("REMINDER_DISPATCH").id);
    const restored = createSeededJobTracker(NOW);
    restored.importState(tracker.exportState());
    assert.equal(restored.applications.length, tracker.applications.length);
    assert.equal(restored.alerts.length, tracker.alerts.length);
  });
});
