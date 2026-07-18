import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, checksum, createSeededHomeInventory, inventoryEventKey, itemFingerprint } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("HomeInventoryInsurance", () => {
  it("seeds items, proofs, policies, and alerts", () => {
    const inventory = createSeededHomeInventory(NOW);
    assert.equal(inventory.items.length, 5);
    assert.equal(inventory.proofs.length, 4);
    assert.equal(inventory.policies.length, 2);
    assert.ok(inventory.alerts.length > 0);
  });

  it("uses stable event keys, fingerprints, and checksums", () => {
    assert.equal(inventoryEventKey({ itemId: "item-1", eventId: "abc" }), "item-1:abc");
    assert.equal(itemFingerprint({ name: " Laptop  Bag ", category: "OTHER", serialNumber: "" }), "OTHER:laptop bag");
    assert.equal(itemFingerprint({ name: "Laptop", category: "ELECTRONICS", serialNumber: " ABC-123 " }), "ELECTRONICS:abc-123");
    assert.equal(checksum({ a: 1 }).length, 16);
  });

  it("deduplicates inventory events", () => {
    const inventory = createSeededHomeInventory(NOW);
    const input = { eventId: "dup", itemId: "item-tv", type: "ITEM_UPDATED" as const, occurredAt: NOW.toISOString() };
    assert.equal(inventory.ingest(input).duplicate, false);
    assert.equal(inventory.ingest(input).duplicate, true);
  });

  it("updates item metadata", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ingest({ eventId: "update", itemId: "item-tv", type: "ITEM_UPDATED", owner: "Ava", notes: "Mounted above console.", occurredAt: NOW.toISOString() });
    const item = inventory.itemById("item-tv");
    assert.equal(item.owner, "Ava");
    assert.equal(item.notes, "Mounted above console.");
  });

  it("ignores stale item updates", () => {
    const inventory = createSeededHomeInventory(NOW);
    const before = inventory.itemById("item-laptop").room;
    const result = inventory.ingest({ eventId: "old", itemId: "item-laptop", type: "LOCATION_MOVED", room: "Attic", occurredAt: addMinutes(-500 * 24 * 60, NOW) });
    assert.equal(result.stale, true);
    assert.equal(inventory.itemById("item-laptop").room, before);
  });

  it("creates new household items", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ingest({ eventId: "create", itemId: "item-camera", type: "ITEM_ADDED", name: "Mirrorless camera", category: "ELECTRONICS", room: "Office", value: 1200, replacementValue: 1400, serialNumber: "CAM-9", policyId: "policy-home", coverageLimit: 1500, occurredAt: NOW.toISOString() });
    assert.equal(inventory.itemById("item-camera").name, "Mirrorless camera");
  });

  it("moves items between rooms", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ingest({ eventId: "move", itemId: "item-bike", type: "LOCATION_MOVED", room: "Shed", occurredAt: NOW.toISOString() });
    assert.equal(inventory.itemById("item-bike").room, "Shed");
  });

  it("attaches proof and clears missing proof on scan", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ingest({ eventId: "proof", itemId: "item-bike", type: "PROOF_ATTACHED", proofKind: "RECEIPT", proofLabel: "Bike shop receipt", occurredAt: NOW.toISOString() });
    const item = inventory.itemById("item-bike");
    assert.ok(item.proofIds.length > 0);
    assert.notEqual(item.status, "MISSING_PROOF");
  });

  it("updates valuation and detects underinsurance", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ingest({ eventId: "value", itemId: "item-laptop", type: "VALUATION_UPDATED", value: 2600, replacementValue: 3200, occurredAt: NOW.toISOString() });
    assert.equal(inventory.itemById("item-laptop").status, "UNDERINSURED");
    assert.ok(inventory.alerts.some((alert) => alert.kind === "UNDERINSURED"));
  });

  it("updates coverage and can clear underinsurance", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ingest({ eventId: "coverage", itemId: "item-tv", type: "COVERAGE_UPDATED", policyId: "policy-home", coverageLimit: 2200, occurredAt: NOW.toISOString() });
    assert.equal(inventory.itemById("item-tv").status, "ACTIVE");
  });

  it("detects duplicate inventory items", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ingest({ eventId: "dupe", itemId: "item-laptop-copy", type: "ITEM_ADDED", name: "MacBook Pro", category: "ELECTRONICS", room: "Office", value: 1700, replacementValue: 2100, serialNumber: "MBP-2024-A1", policyId: "policy-home", coverageLimit: 2500, occurredAt: NOW.toISOString() });
    assert.equal(inventory.itemById("item-laptop-copy").status, "DUPLICATE");
    assert.ok(inventory.alerts.some((alert) => alert.kind === "DUPLICATE_ITEM"));
  });

  it("detects policy gaps", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ingest({ eventId: "gap", itemId: "item-art", type: "ITEM_ADDED", name: "Signed print", category: "COLLECTIBLE", value: 900, replacementValue: 1000, policyId: "policy-home", coverageLimit: 1200, occurredAt: NOW.toISOString() });
    assert.ok(inventory.alerts.some((alert) => alert.kind === "POLICY_GAP"));
  });

  it("detects stale valuations", () => {
    const inventory = createSeededHomeInventory(NOW);
    assert.ok(inventory.alerts.some((alert) => alert.kind === "VALUATION_STALE"));
  });

  it("generates insurance-ready exports", () => {
    const inventory = createSeededHomeInventory(NOW);
    const bundle = inventory.generateExport(NOW);
    assert.equal(bundle.status, "READY");
    assert.equal(bundle.itemCount, 5);
    assert.ok(inventory.alerts.some((alert) => alert.kind === "EXPORT_READY"));
  });

  it("dispatches alerts", () => {
    const inventory = createSeededHomeInventory(NOW);
    assert.ok(inventory.dispatchAlerts() > 0);
    assert.ok(inventory.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ingest({ eventId: "old-event", itemId: "item-sofa", type: "ITEM_UPDATED", occurredAt: addMinutes(-800 * 24 * 60, NOW) });
    const result = inventory.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(inventory.events.length, inventory.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const inventory = createSeededHomeInventory(NOW);
    inventory.ensureJob("EXPORT_GENERATION");
    inventory.failNextJob = true;
    assert.equal(inventory.dispatchNextJob().job?.status, "RETRY");
    assert.equal(inventory.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const inventory = createSeededHomeInventory(NOW);
    assert.equal(inventory.ensureJob("REMINDER_DISPATCH").id, inventory.ensureJob("REMINDER_DISPATCH").id);
    const restored = createSeededHomeInventory(NOW);
    restored.importState(inventory.exportState());
    assert.equal(restored.items.length, inventory.items.length);
    assert.equal(restored.proofs.length, inventory.proofs.length);
    assert.equal(restored.alerts.length, inventory.alerts.length);
  });
});
