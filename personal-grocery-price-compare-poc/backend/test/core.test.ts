import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededGroceryCompare, groceryFingerprint, priceEventKey } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("GroceryPriceCompare", () => {
  it("seeds items, stores, prices, recommendations, and alerts", () => {
    const compare = createSeededGroceryCompare(NOW);
    assert.equal(compare.items.length, 5);
    assert.equal(compare.stores.length, 3);
    assert.ok(compare.prices.length > 0);
    assert.equal(compare.recommendations.length, 2);
    assert.ok(compare.alerts.length > 0);
  });

  it("uses stable event keys and grocery fingerprints", () => {
    assert.equal(priceEventKey({ itemId: "item-1", eventId: "abc" }), "item-1:abc");
    assert.equal(groceryFingerprint({ name: " Milk  ", preferredBrand: " Any ", unit: "Gallon" }), "milk:any:gallon");
  });

  it("deduplicates price events", () => {
    const compare = createSeededGroceryCompare(NOW);
    const input = { eventId: "dup", itemId: "item-milk", type: "ITEM_UPDATED" as const, occurredAt: NOW.toISOString() };
    assert.equal(compare.ingest(input).duplicate, false);
    assert.equal(compare.ingest(input).duplicate, true);
  });

  it("adds new grocery items", () => {
    const compare = createSeededGroceryCompare(NOW);
    compare.ingest({ eventId: "add", itemId: "item-bananas", type: "ITEM_ADDED", name: "Bananas", category: "PRODUCE", quantity: 2, unit: "lb", preferredBrand: "Any", maxPrice: 3, occurredAt: NOW.toISOString() });
    assert.equal(compare.itemById("item-bananas").name, "Bananas");
  });

  it("ignores stale item updates", () => {
    const compare = createSeededGroceryCompare(NOW);
    const before = compare.itemById("item-eggs").quantity;
    const result = compare.ingest({ eventId: "old", itemId: "item-eggs", type: "ITEM_UPDATED", quantity: 9, occurredAt: addMinutes(-120, NOW) });
    assert.equal(result.stale, true);
    assert.equal(compare.itemById("item-eggs").quantity, before);
  });

  it("updates store prices and detects drops", () => {
    const compare = createSeededGroceryCompare(NOW);
    compare.ingest({ eventId: "price", itemId: "item-chicken", type: "PRICE_UPDATED", storeId: "store-market", brand: "Store brand", price: 4.99, unit: "lb", available: true, occurredAt: NOW.toISOString() });
    const price = compare.prices.find((candidate) => candidate.itemId === "item-chicken" && candidate.storeId === "store-market");
    assert.equal(price?.price, 4.99);
    assert.ok(compare.alerts.some((alert) => alert.kind === "PRICE_DROP"));
  });

  it("updates availability and flags unavailable items", () => {
    const compare = createSeededGroceryCompare(NOW);
    for (const store of compare.stores) {
      compare.ingest({ eventId: `unavailable-${store.id}`, itemId: "item-milk", type: "AVAILABILITY_UPDATED", storeId: store.id, brand: "Any", price: 4.29, unit: "gallon", available: false, occurredAt: NOW.toISOString() });
    }
    assert.equal(compare.itemById("item-milk").status, "UNAVAILABLE");
    assert.ok(compare.alerts.some((alert) => alert.kind === "UNAVAILABLE"));
  });

  it("detects duplicate grocery items", () => {
    const compare = createSeededGroceryCompare(NOW);
    compare.ingest({ eventId: "dupe", itemId: "item-milk-copy", type: "ITEM_ADDED", name: " milk ", category: "DAIRY", quantity: 1, unit: "gallon", preferredBrand: "any", maxPrice: 4.5, occurredAt: NOW.toISOString() });
    assert.equal(compare.itemById("item-milk-copy").status, "DUPLICATE");
    assert.ok(compare.alerts.some((alert) => alert.kind === "DUPLICATE_ITEM"));
  });

  it("tracks substitutions", () => {
    const compare = createSeededGroceryCompare(NOW);
    compare.ingest({ eventId: "sub", itemId: "item-apples", type: "SUBSTITUTION_FOUND", substituteItemId: "item-pears", notes: "Pears are cheaper today.", occurredAt: NOW.toISOString() });
    assert.equal(compare.itemById("item-apples").status, "SUBSTITUTED");
    assert.ok(compare.alerts.some((alert) => alert.kind === "SUBSTITUTION"));
  });

  it("marks items bought", () => {
    const compare = createSeededGroceryCompare(NOW);
    compare.ingest({ eventId: "bought", itemId: "item-eggs", type: "ITEM_BOUGHT", occurredAt: NOW.toISOString() });
    assert.equal(compare.itemById("item-eggs").status, "BOUGHT");
  });

  it("builds split-store recommendations with savings", () => {
    const compare = createSeededGroceryCompare(NOW);
    const split = compare.recommendations.find((rec) => rec.kind === "SPLIT_STORE");
    const single = compare.recommendations.find((rec) => rec.kind === "SINGLE_STORE");
    assert.ok(split);
    assert.ok(single);
    assert.ok(split!.total <= single!.total);
  });

  it("selects a preferred store", () => {
    const compare = createSeededGroceryCompare(NOW);
    compare.ingest({ eventId: "select", itemId: "item-milk", type: "STORE_SELECTED", storeId: "store-value", occurredAt: NOW.toISOString() });
    assert.equal(compare.selectedStoreId, "store-value");
    assert.ok(compare.alerts.some((alert) => alert.kind === "BEST_STORE_CHANGED"));
  });

  it("simulates price refresh jobs", () => {
    const compare = createSeededGroceryCompare(NOW);
    compare.simulatePriceRefresh();
    assert.ok(compare.alerts.some((alert) => alert.kind === "PRICE_DROP"));
  });

  it("dispatches alerts", () => {
    const compare = createSeededGroceryCompare(NOW);
    assert.ok(compare.dispatchAlerts() > 0);
    assert.ok(compare.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const compare = createSeededGroceryCompare(NOW);
    compare.ingest({ eventId: "old-event", itemId: "item-detergent", type: "ITEM_UPDATED", occurredAt: addMinutes(-800 * 24 * 60, NOW) });
    const result = compare.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(compare.events.length, compare.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const compare = createSeededGroceryCompare(NOW);
    compare.ensureJob("PRICE_REFRESH");
    compare.failNextJob = true;
    assert.equal(compare.dispatchNextJob().job?.status, "RETRY");
    assert.equal(compare.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const compare = createSeededGroceryCompare(NOW);
    assert.equal(compare.ensureJob("ALERT_DISPATCH").id, compare.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededGroceryCompare(NOW);
    restored.importState(compare.exportState());
    assert.equal(restored.items.length, compare.items.length);
    assert.equal(restored.stores.length, compare.stores.length);
    assert.equal(restored.alerts.length, compare.alerts.length);
  });
});
