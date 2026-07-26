import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededFraudWatch, fraudEventKey, transactionFingerprint } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("TransactionFraudWatch", () => {
  it("seeds cards, transactions, alerts, and metrics", () => {
    const watch = createSeededFraudWatch(NOW);
    assert.equal(watch.cards.length, 2);
    assert.equal(watch.transactions.length, 5);
    assert.ok(watch.alerts.length > 0);
    assert.ok(watch.snapshot().metrics.highRisk > 0);
  });

  it("uses stable event keys and transaction fingerprints", () => {
    assert.equal(fraudEventKey({ transactionId: "tx-1", eventId: "abc" }), "tx-1:abc");
    const fingerprint = transactionFingerprint({ cardId: "card-1", merchant: " Big  Shop ", amount: 12.5, currency: "USD", occurredAt: NOW.toISOString() });
    assert.equal(fingerprint, "card-1:big shop:12.50:USD:2026-07-09T15:00");
  });

  it("deduplicates transaction events", () => {
    const watch = createSeededFraudWatch(NOW);
    const input = { eventId: "dup", transactionId: "tx-grocery", type: "TRANSACTION_SETTLED" as const, occurredAt: NOW.toISOString() };
    assert.equal(watch.ingest(input).duplicate, false);
    assert.equal(watch.ingest(input).duplicate, true);
  });

  it("authorizes new transactions", () => {
    const watch = createSeededFraudWatch(NOW);
    watch.ingest({ eventId: "auth", transactionId: "tx-shoes", type: "TRANSACTION_AUTHORIZED", cardId: "card-primary", merchant: "Shoe Store", category: "OTHER", amount: 120, currency: "USD", city: "Chicago", country: "US", occurredAt: NOW.toISOString() });
    assert.equal(watch.transactionById("tx-shoes").merchant, "Shoe Store");
  });

  it("ignores stale transaction updates", () => {
    const watch = createSeededFraudWatch(NOW);
    const before = watch.transactionById("tx-laptop").merchant;
    const result = watch.ingest({ eventId: "old", transactionId: "tx-laptop", type: "TRANSACTION_AUTHORIZED", merchant: "Old Merchant", occurredAt: addMinutes(-90, NOW) });
    assert.equal(result.stale, true);
    assert.equal(watch.transactionById("tx-laptop").merchant, before);
  });

  it("detects large and high-risk category transactions", () => {
    const watch = createSeededFraudWatch(NOW);
    const tx = watch.transactionById("tx-laptop");
    assert.ok(tx.riskScore >= 50);
    assert.ok(watch.alerts.some((alert) => alert.kind === "LARGE_TRANSACTION"));
    assert.ok(watch.alerts.some((alert) => alert.kind === "MERCHANT_ANOMALY"));
  });

  it("detects location anomalies", () => {
    const watch = createSeededFraudWatch(NOW);
    assert.ok(watch.transactionById("tx-paris").riskReasons.includes("foreign location"));
    assert.ok(watch.alerts.some((alert) => alert.kind === "LOCATION_ANOMALY"));
  });

  it("detects duplicate transactions", () => {
    const watch = createSeededFraudWatch(NOW);
    const occurredAt = addMinutes(1, NOW);
    watch.ingest({ eventId: "one", transactionId: "tx-dupe-1", type: "TRANSACTION_AUTHORIZED", cardId: "card-primary", merchant: "Corner Shop", category: "GROCERY", amount: 42.1, currency: "USD", city: "Chicago", country: "US", occurredAt });
    watch.ingest({ eventId: "two", transactionId: "tx-dupe-2", type: "TRANSACTION_AUTHORIZED", cardId: "card-primary", merchant: "Corner  Shop", category: "GROCERY", amount: 42.1, currency: "USD", city: "Chicago", country: "US", occurredAt: addMinutes(0.2, occurredAt) });
    assert.ok(watch.alerts.some((alert) => alert.kind === "DUPLICATE_TRANSACTION"));
  });

  it("detects velocity spikes", () => {
    const watch = createSeededFraudWatch(NOW);
    for (let index = 0; index < 3; index += 1) {
      watch.ingest({ eventId: `vel-${index}`, transactionId: `tx-vel-${index}`, type: "TRANSACTION_AUTHORIZED", cardId: "card-travel", merchant: `Kiosk ${index}`, category: "DINING", amount: 12 + index, currency: "USD", city: "Milwaukee", country: "US", occurredAt: addMinutes(index, NOW) });
    }
    assert.ok(watch.alerts.some((alert) => alert.kind === "VELOCITY_SPIKE"));
  });

  it("marks transactions safe", () => {
    const watch = createSeededFraudWatch(NOW);
    watch.ingest({ eventId: "safe", transactionId: "tx-paris", type: "TRANSACTION_MARKED_SAFE", occurredAt: NOW.toISOString() });
    const tx = watch.transactionById("tx-paris");
    assert.equal(tx.status, "SAFE");
    assert.equal(tx.riskScore, 0);
  });

  it("opens disputes", () => {
    const watch = createSeededFraudWatch(NOW);
    watch.ingest({ eventId: "dispute", transactionId: "tx-laptop", type: "DISPUTE_OPENED", occurredAt: NOW.toISOString() });
    assert.equal(watch.transactionById("tx-laptop").status, "DISPUTED");
    assert.ok(watch.alerts.some((alert) => alert.kind === "DISPUTE_OPEN"));
  });

  it("freezes and unfreezes cards", () => {
    const watch = createSeededFraudWatch(NOW);
    watch.ingest({ eventId: "freeze", transactionId: "tx-paris", type: "CARD_FROZEN", cardId: "card-primary", occurredAt: NOW.toISOString() });
    assert.equal(watch.cardById("card-primary").frozen, true);
    assert.ok(watch.alerts.some((alert) => alert.kind === "CARD_FROZEN"));
    watch.ingest({ eventId: "unfreeze", transactionId: "tx-paris", type: "CARD_UNFROZEN", cardId: "card-primary", occurredAt: addMinutes(1, NOW) });
    assert.equal(watch.cardById("card-primary").frozen, false);
  });

  it("dispatches alerts", () => {
    const watch = createSeededFraudWatch(NOW);
    assert.ok(watch.dispatchAlerts() > 0);
    assert.ok(watch.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const watch = createSeededFraudWatch(NOW);
    watch.ingest({ eventId: "old-event", transactionId: "tx-gas", type: "TRANSACTION_SETTLED", occurredAt: addMinutes(-800 * 24 * 60, NOW) });
    const result = watch.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(watch.events.length, watch.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const watch = createSeededFraudWatch(NOW);
    watch.ensureJob("RISK_SCAN");
    watch.failNextJob = true;
    assert.equal(watch.dispatchNextJob().job?.status, "RETRY");
    assert.equal(watch.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const watch = createSeededFraudWatch(NOW);
    assert.equal(watch.ensureJob("ALERT_DISPATCH").id, watch.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededFraudWatch(NOW);
    restored.importState(watch.exportState());
    assert.equal(restored.cards.length, watch.cards.length);
    assert.equal(restored.transactions.length, watch.transactions.length);
    assert.equal(restored.alerts.length, watch.alerts.length);
  });
});
