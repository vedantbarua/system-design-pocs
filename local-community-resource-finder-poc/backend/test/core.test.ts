import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededFinder, resourceEventKey, resourceFingerprint } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("CommunityResourceFinder", () => {
  it("seeds resources, saved resources, and alerts", () => {
    const finder = createSeededFinder(NOW);
    assert.equal(finder.resources.length, 6);
    assert.equal(finder.saved.length, 2);
    assert.ok(finder.alerts.length > 0);
  });

  it("uses stable event keys and fingerprints", () => {
    assert.equal(resourceEventKey({ resourceId: "res-1", eventId: "abc" }), "res-1:abc");
    assert.equal(resourceFingerprint(" Food  Pantry ", "60618", " 120 MAPLE Ave "), "food pantry:60618:120 maple ave");
  });

  it("deduplicates provider events", () => {
    const finder = createSeededFinder(NOW);
    const input = { eventId: "dup", resourceId: "res-food-bank", type: "CAPACITY_CHANGED" as const, available: 14, occurredAt: NOW.toISOString() };
    assert.equal(finder.ingest(input).duplicate, false);
    assert.equal(finder.ingest(input).duplicate, true);
  });

  it("updates resource metadata", () => {
    const finder = createSeededFinder(NOW);
    finder.ingest({ eventId: "hours", resourceId: "res-clinic", type: "HOURS_CHANGED", hours: "Daily 7-7", phone: "312-555-0000", occurredAt: NOW.toISOString() });
    const resource = finder.resourceById("res-clinic");
    assert.equal(resource.hours, "Daily 7-7");
    assert.equal(resource.phone, "312-555-0000");
  });

  it("ignores stale provider updates", () => {
    const finder = createSeededFinder(NOW);
    const before = finder.resourceById("res-utility").available;
    const result = finder.ingest({ eventId: "old", resourceId: "res-utility", type: "CAPACITY_CHANGED", available: 10, occurredAt: addMinutes(-3 * 60, NOW) });
    assert.equal(result.stale, true);
    assert.equal(finder.resourceById("res-utility").available, before);
  });

  it("creates new resources from provider events", () => {
    const finder = createSeededFinder(NOW);
    finder.ingest({ eventId: "new", resourceId: "res-childcare", type: "RESOURCE_CREATED", name: "Drop-in Childcare Desk", category: "CHILDCARE", zipCode: "60618", address: "5 Family Way", available: 6, capacity: 10, occurredAt: NOW.toISOString() });
    assert.equal(finder.resourceById("res-childcare").category, "CHILDCARE");
  });

  it("searches by need, zip, language, and documents", () => {
    const finder = createSeededFinder(NOW);
    const result = finder.search({ zipCode: "60618", language: "Spanish", needsOpenNow: true, maxDocuments: 2 });
    assert.ok(result.results.some((resource) => resource.id === "res-clinic"));
    assert.ok(result.results.every((resource) => resource.zipCode === "60618"));
  });

  it("caches repeated searches", () => {
    const finder = createSeededFinder(NOW);
    assert.equal(finder.search({ category: "CLINIC" }).cached, false);
    assert.equal(finder.search({ category: "CLINIC" }).cached, true);
  });

  it("clears search cache after updates", () => {
    const finder = createSeededFinder(NOW);
    finder.search({ category: "FOOD" });
    assert.equal(finder.searchCache.size, 1);
    finder.ingest({ eventId: "food-capacity", resourceId: "res-food-bank", type: "CAPACITY_CHANGED", available: 30, occurredAt: NOW.toISOString() });
    assert.equal(finder.searchCache.size, 0);
  });

  it("detects low capacity and full resources", () => {
    const finder = createSeededFinder(NOW);
    assert.equal(finder.resourceById("res-food-bank").status, "LIMITED");
    assert.equal(finder.resourceById("res-utility").status, "FULL");
    assert.ok(finder.alerts.some((alert) => alert.kind === "CAPACITY_LOW"));
    assert.ok(finder.alerts.some((alert) => alert.kind === "RESOURCE_FULL"));
  });

  it("notifies saved users when a resource closes", () => {
    const finder = createSeededFinder(NOW);
    finder.ingest({ eventId: "close", resourceId: "res-food-bank", type: "RESOURCE_CLOSED", occurredAt: NOW.toISOString() });
    assert.equal(finder.resourceById("res-food-bank").status, "CLOSED");
    assert.ok(finder.alerts.some((alert) => alert.kind === "RESOURCE_CLOSED" && alert.userId === "user-demo"));
  });

  it("saves resources idempotently", () => {
    const finder = createSeededFinder(NOW);
    const first = finder.saveResource("user-2", "res-clinic", "clinic search");
    const second = finder.saveResource("user-2", "res-clinic", "clinic search");
    assert.equal(first.id, second.id);
  });

  it("detects stale listings", () => {
    const finder = createSeededFinder(NOW);
    assert.equal(finder.resourceById("res-legal").status, "STALE");
    assert.ok(finder.alerts.some((alert) => alert.kind === "STALE_LISTING" && alert.resourceId === "res-legal"));
  });

  it("dispatches alerts", () => {
    const finder = createSeededFinder(NOW);
    assert.ok(finder.dispatchAlerts() > 0);
    assert.ok(finder.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const finder = createSeededFinder(NOW);
    finder.ingest({ eventId: "old-event", resourceId: "res-clinic", type: "RESOURCE_UPDATED", occurredAt: addMinutes(-500 * 24 * 60, NOW), phone: "old" });
    const result = finder.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(finder.events.length, finder.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const finder = createSeededFinder(NOW);
    finder.ensureJob("RESOURCE_SCAN");
    finder.failNextJob = true;
    assert.equal(finder.dispatchNextJob().job?.status, "RETRY");
    assert.equal(finder.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const finder = createSeededFinder(NOW);
    assert.equal(finder.ensureJob("ALERT_DISPATCH").id, finder.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededFinder(NOW);
    restored.importState(finder.exportState());
    assert.equal(restored.resources.length, finder.resources.length);
    assert.equal(restored.saved.length, finder.saved.length);
  });
});
