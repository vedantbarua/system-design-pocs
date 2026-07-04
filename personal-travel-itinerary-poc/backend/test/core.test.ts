import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededItinerary, fingerprint, itineraryEventKey } from "../src/core.js";

const NOW = new Date("2026-07-04T15:00:00Z");

describe("TravelItinerary", () => {
  it("seeds reservations, alerts, and reminders", () => {
    const itinerary = createSeededItinerary(NOW);
    assert.equal(itinerary.reservations.length, 6);
    assert.ok(itinerary.alerts.length > 0);
    assert.ok(itinerary.reminders.length > 0);
  });

  it("uses stable event keys and booking fingerprints", () => {
    assert.equal(itineraryEventKey({ reservationId: "res-1", eventId: "abc" }), "res-1:abc");
    assert.equal(fingerprint(" BlueJet ", " bj4821 ", "2026-07-05T11:00:00Z"), "bluejet:BJ4821:2026-07-05T11:00:00.000Z");
  });

  it("deduplicates booking events", () => {
    const itinerary = createSeededItinerary(NOW);
    const input = { eventId: "dup", reservationId: "res-train", type: "BOOKING_UPDATED" as const, location: "Lisbon Santa Apolonia -> Porto Campanha" };
    assert.equal(itinerary.ingest(input).duplicate, false);
    assert.equal(itinerary.ingest(input).duplicate, true);
  });

  it("updates booking metadata", () => {
    const itinerary = createSeededItinerary(NOW);
    itinerary.ingest({ eventId: "change", reservationId: "res-flight-out", type: "BOOKING_UPDATED", startAt: addMinutes(20 * 60 + 30, NOW), endAt: addMinutes(28 * 60 + 30, NOW), confirmationCode: "BJ999" });
    const reservation = itinerary.reservationById("res-flight-out");
    assert.equal(reservation.confirmationCode, "BJ999");
    assert.equal(reservation.status, "CHANGED");
  });

  it("ignores out-of-order booking updates", () => {
    const itinerary = createSeededItinerary(NOW);
    const before = itinerary.reservationById("res-train").confirmationCode;
    const result = itinerary.ingest({ eventId: "old", reservationId: "res-train", type: "BOOKING_UPDATED", occurredAt: addMinutes(-30 * 24 * 60, NOW), confirmationCode: "OLD" });
    assert.equal(result.stale, true);
    assert.equal(itinerary.reservationById("res-train").confirmationCode, before);
  });

  it("detects itinerary conflicts", () => {
    const itinerary = createSeededItinerary(NOW);
    assert.ok(itinerary.alerts.some((alert) => alert.kind === "SCHEDULE_CONFLICT"));
    assert.equal(itinerary.reservationById("res-food-tour").status, "CONFLICT");
  });

  it("queues check-in reminders", () => {
    const itinerary = createSeededItinerary(NOW);
    assert.ok(itinerary.alerts.some((alert) => alert.kind === "CHECKIN_OPEN"));
    assert.ok(itinerary.reminders.some((reminder) => reminder.dedupeKey.includes("CHECKIN_OPEN")));
  });

  it("queues document deadline reminders", () => {
    const itinerary = createSeededItinerary(NOW);
    assert.ok(itinerary.alerts.some((alert) => alert.kind === "DOCUMENT_DEADLINE"));
    assert.ok(itinerary.reminders.some((reminder) => reminder.dedupeKey.includes("DOCUMENT_DEADLINE")));
  });

  it("detects stale provider updates", () => {
    const itinerary = createSeededItinerary(NOW);
    assert.ok(itinerary.alerts.some((alert) => alert.kind === "STALE_BOOKING_UPDATE" && alert.reservationId === "res-train"));
  });

  it("cancels and completes reservations", () => {
    const itinerary = createSeededItinerary(NOW);
    itinerary.ingest({ eventId: "cancel", reservationId: "res-dinner", type: "RESERVATION_CANCELLED", occurredAt: NOW.toISOString() });
    itinerary.ingest({ eventId: "done", reservationId: "res-flight-out", type: "RESERVATION_COMPLETED", occurredAt: addMinutes(30, NOW) });
    assert.equal(itinerary.reservationById("res-dinner").status, "CANCELLED");
    assert.equal(itinerary.reservationById("res-flight-out").status, "COMPLETED");
  });

  it("deduplicates reminders across scans", () => {
    const itinerary = createSeededItinerary(NOW);
    const before = itinerary.reminders.length;
    itinerary.scanItinerary(NOW);
    assert.equal(itinerary.reminders.length, before);
  });

  it("dispatches alerts and reminders", () => {
    const itinerary = createSeededItinerary(NOW);
    assert.ok(itinerary.dispatchAlerts() > 0);
    assert.ok(itinerary.dispatchReminders() > 0);
    assert.ok(itinerary.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(itinerary.reminders.every((reminder) => reminder.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const itinerary = createSeededItinerary(NOW);
    itinerary.ingest({ eventId: "old-event", reservationId: "res-train", type: "BOOKING_UPDATED", occurredAt: addMinutes(-300 * 24 * 60, NOW), confirmationCode: "OLD" });
    const result = itinerary.retain(180, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(itinerary.events.length, itinerary.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const itinerary = createSeededItinerary(NOW);
    itinerary.ensureJob("ITINERARY_SCAN");
    itinerary.failNextJob = true;
    assert.equal(itinerary.dispatchNextJob().job?.status, "RETRY");
    assert.equal(itinerary.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const itinerary = createSeededItinerary(NOW);
    assert.equal(itinerary.ensureJob("ALERT_DISPATCH").id, itinerary.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededItinerary(NOW);
    restored.importState(itinerary.exportState());
    assert.equal(restored.reservations.length, itinerary.reservations.length);
    assert.equal(restored.alerts.length, itinerary.alerts.length);
  });
});
