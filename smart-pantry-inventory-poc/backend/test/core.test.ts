import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, createSeededPantry, stockEventKey } from "../src/core.js";

describe("SmartPantry", () => {
  it("seeds products, lots, and low-stock projections", () => {
    const pantry = createSeededPantry();
    const snapshot = pantry.snapshot() as { metrics: { products: number; unitsOnHand: number; lowStock: number } };
    assert.equal(snapshot.metrics.products, 5);
    assert.equal(snapshot.metrics.unitsOnHand, 15);
    assert.equal(snapshot.metrics.lowStock, 2);
  });

  it("uses product and event ids for idempotency", () => {
    assert.equal(stockEventKey({ productId: "prod-rice", eventId: "evt-1" }), "prod-rice:evt-1");
  });

  it("deduplicates repeated stock events", () => {
    const pantry = createSeededPantry();
    const input = { eventId: "receive-1", productId: "prod-rice", type: "RECEIVE" as const, quantity: 1 };
    assert.equal(pantry.applyStockEvent(input).duplicate, false);
    assert.equal(pantry.applyStockEvent(input).duplicate, true);
  });

  it("receives inventory as a new lot", () => {
    const pantry = createSeededPantry();
    pantry.applyStockEvent({ eventId: "receive-2", productId: "prod-milk", type: "RECEIVE", quantity: 2, expiresAt: addDays(8), unitCost: 4 });
    assert.equal(pantry.quantityFor("prod-milk"), 4);
    assert.equal(pantry.lots.filter((lot) => lot.productId === "prod-milk").length, 2);
  });

  it("consumes from the earliest-expiring lot first", () => {
    const pantry = createSeededPantry();
    pantry.applyStockEvent({ eventId: "milk-later", productId: "prod-milk", type: "RECEIVE", quantity: 3, expiresAt: addDays(10) });
    const firstLot = pantry.lots.find((lot) => lot.productId === "prod-milk")!;
    const result = pantry.applyStockEvent({ eventId: "drink-1", productId: "prod-milk", type: "CONSUME", quantity: 1 });
    assert.equal(result.event?.allocations[0].lotId, firstLot.id);
    assert.equal(firstLot.quantity, 1);
  });

  it("rejects consumption above available stock", () => {
    const pantry = createSeededPantry();
    assert.throws(() => pantry.applyStockEvent({ eventId: "too-many", productId: "prod-rice", type: "CONSUME", quantity: 2 }), /insufficient stock/);
  });

  it("creates low-stock shopping items after consumption", () => {
    const pantry = createSeededPantry();
    pantry.applyStockEvent({ eventId: "coffee-use", productId: "prod-coffee", type: "CONSUME", quantity: 2 });
    const item = pantry.shoppingItems.find((entry) => entry.productId === "prod-coffee" && entry.reason === "LOW_STOCK");
    assert.equal(item?.status, "NEEDED");
  });

  it("resolves low-stock shopping items when inventory is replenished", () => {
    const pantry = createSeededPantry();
    const item = pantry.shoppingItems.find((entry) => entry.productId === "prod-rice" && entry.reason === "LOW_STOCK")!;
    pantry.applyStockEvent({ eventId: "rice-restock", productId: "prod-rice", type: "RECEIVE", quantity: 2 });
    assert.equal(item.status, "BOUGHT");
  });

  it("supports manual shopping items and status changes", () => {
    const pantry = createSeededPantry();
    const item = pantry.addShoppingItem("prod-coffee", 2);
    pantry.updateShoppingStatus(item.id, "IN_CART");
    assert.equal(item.status, "IN_CART");
  });

  it("finds products by barcode", () => {
    const pantry = createSeededPantry();
    assert.equal(pantry.lookupBarcode("012345000103").name, "Eggs");
  });

  it("detects expiring lots within a time window", () => {
    const pantry = createSeededPantry();
    const result = pantry.scanExpirations(7);
    assert.equal(result.expiring, 2);
    assert.equal(result.expired, 0);
  });

  it("retries failed jobs and recovers", () => {
    const pantry = createSeededPantry();
    pantry.queueExpirationScan(7);
    pantry.failNextJob = true;
    assert.equal(pantry.dispatchNextJob().job?.status, "RETRY");
    assert.equal(pantry.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates scheduled jobs for the same window", () => {
    const pantry = createSeededPantry();
    assert.equal(pantry.queueShoppingRebuild().id, pantry.queueShoppingRebuild().id);
  });

  it("exports and restores state", () => {
    const pantry = createSeededPantry();
    pantry.applyStockEvent({ eventId: "restore-test", productId: "prod-eggs", type: "CONSUME", quantity: 2 });
    const restored = createSeededPantry();
    restored.importState(pantry.exportState());
    assert.equal(restored.quantityFor("prod-eggs"), 6);
    assert.equal(restored.stockEvents.length, pantry.stockEvents.length);
  });
});
