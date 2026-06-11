import assert from "node:assert/strict";
import test from "node:test";
import {
  DeliveryStore,
  canTransition,
  eventKey,
  normalizeCarrierStatus
} from "../src/core.js";
import { MemoryRepository } from "../src/repository.js";

test("normalizes carrier-specific statuses", () => {
  assert.equal(normalizeCarrierStatus("UPS", "O"), "OUT_FOR_DELIVERY");
  assert.equal(normalizeCarrierStatus("fedex", "DL"), "DELIVERED");
  assert.equal(normalizeCarrierStatus("USPS", "Alert"), "EXCEPTION");
});

test("rejects unsupported carrier statuses", () => {
  assert.throws(() => normalizeCarrierStatus("UPS", "UNKNOWN"), /unsupported UPS status/);
});

test("event keys prefer stable carrier event identifiers", () => {
  assert.equal(eventKey({ carrier: "ups", eventId: "abc" }), "UPS:abc");
});

test("state machine blocks delivery regression", () => {
  assert.equal(canTransition("DELIVERED", "IN_TRANSIT"), false);
  assert.equal(canTransition("EXCEPTION", "IN_TRANSIT"), true);
});

test("duplicate events are idempotent", () => {
  const store = new DeliveryStore();
  store.seed();
  const input = {
    eventId: "duplicate-1",
    carrier: "FEDEX",
    trackingNumber: "784512930184",
    carrierStatus: "OD",
    occurredAt: "2026-06-10T14:00:00Z"
  };
  assert.equal(store.ingestEvent(input).duplicate, false);
  assert.equal(store.ingestEvent(input).duplicate, true);
  assert.equal(store.events.filter((event) => event.eventId === "duplicate-1").length, 1);
});

test("out-of-order events remain in audit history without regressing projection", () => {
  const store = new DeliveryStore();
  store.seed();
  const result = store.ingestEvent({
    eventId: "late-old-event",
    carrier: "UPS",
    trackingNumber: "1Z84A20E0391208841",
    carrierStatus: "I",
    occurredAt: "2026-06-09T10:00:00Z",
    location: "Nashville, TN"
  });
  assert.equal(result.event.projectionApplied, false);
  assert.equal(result.event.ignoredReason, "OUT_OF_ORDER");
  assert.equal(result.package.state, "OUT_FOR_DELIVERY");
  assert.equal(result.package.lastLocation, "Chicago, IL");
});

test("valid event updates delivery projection and queues notification", () => {
  const store = new DeliveryStore();
  store.seed();
  const result = store.ingestEvent({
    eventId: "delivered-headphones",
    carrier: "FEDEX",
    trackingNumber: "784512930184",
    carrierStatus: "DL",
    occurredAt: "2026-06-11T19:00:00Z",
    location: "Mailroom"
  });
  assert.equal(result.package.state, "DELIVERED");
  assert.equal(result.package.deliveredAt, "2026-06-11T19:00:00.000Z");
  assert.equal(store.notifications[0].type, "DELIVERED");
});

test("disabled notification preference suppresses matching alert", () => {
  const store = new DeliveryStore();
  store.seed();
  store.updatePreferences("pkg-headphones", { outForDelivery: false });
  store.ingestEvent({
    eventId: "ofd-muted",
    carrier: "FEDEX",
    trackingNumber: "784512930184",
    carrierStatus: "OD",
    occurredAt: "2026-06-10T14:00:00Z"
  });
  assert.equal(store.notifications.length, 0);
});

test("polling creates carrier updates and is idempotent per day", () => {
  const store = new DeliveryStore();
  store.seed();
  const first = store.runPoll("household-maple", "2026-06-10T14:00:00Z");
  const second = store.runPoll("household-maple", "2026-06-10T15:00:00Z");
  assert.equal(first.events.length, 2);
  assert.equal(second.events.length, 0);
  assert.equal(store.parcel("pkg-skincare").state, "IN_TRANSIT");
});

test("snapshot exposes operational counts and carrier reliability", () => {
  const store = new DeliveryStore();
  store.seed();
  const snapshot = store.snapshot("household-maple", "2026-06-10T14:00:00Z");
  assert.equal(snapshot.metrics.active, 4);
  assert.equal(snapshot.metrics.arrivingToday, 1);
  assert.equal(snapshot.metrics.exceptions, 1);
  assert.equal(snapshot.metrics.deliveredRecently, 1);
  assert.ok(snapshot.carrierMetrics.some((item) => item.carrier === "UPS"));
});

test("memory repository supports atomic event claims and state persistence", async () => {
  const repository = new MemoryRepository();
  assert.equal(await repository.claimEvent("UPS:event-1"), true);
  assert.equal(await repository.claimEvent("UPS:event-1"), false);
  await repository.save({ packages: [{ id: "pkg-1" }] });
  assert.deepEqual(await repository.load(), { packages: [{ id: "pkg-1" }] });
});
