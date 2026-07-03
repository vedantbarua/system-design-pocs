import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMinutes, createSeededVault, fingerprint, vaultEventKey } from "../src/core.js";

const NOW = new Date("2026-07-03T15:00:00Z");

describe("WarrantyVault", () => {
  it("seeds items, alerts, and reminders", () => {
    const vault = createSeededVault(NOW);
    assert.equal(vault.items.length, 6);
    assert.ok(vault.alerts.length > 0);
    assert.ok(vault.reminders.length > 0);
  });

  it("uses stable event keys and receipt fingerprints", () => {
    assert.equal(vaultEventKey({ itemId: "item-1", eventId: "abc" }), "item-1:abc");
    assert.equal(fingerprint(" Store ", "Air   Filter", "2026-07-03T10:00:00Z", 2499), "store:air filter:2026-07-03:2499");
  });

  it("deduplicates receipt events", () => {
    const vault = createSeededVault(NOW);
    const input = { eventId: "dup", itemId: "item-unknown", type: "METADATA_UPDATED" as const, category: "HOUSEHOLD" as const, priceCents: 1299, warrantyExpiresAt: addMinutes(365 * 24 * 60, NOW) };
    assert.equal(vault.ingest(input).duplicate, false);
    assert.equal(vault.ingest(input).duplicate, true);
  });

  it("updates extracted receipt metadata", () => {
    const vault = createSeededVault(NOW);
    vault.ingest({ eventId: "metadata", itemId: "item-unknown", type: "METADATA_UPDATED", name: "Smoke detector", merchant: "Hardware Hub", category: "HOME_SYSTEM", priceCents: 3499, warrantyExpiresAt: addMinutes(365 * 24 * 60, NOW) });
    const item = vault.itemById("item-unknown");
    assert.equal(item.name, "Smoke detector");
    assert.equal(item.category, "HOME_SYSTEM");
    assert.equal(item.status, "ACTIVE");
  });

  it("detects duplicate receipts", () => {
    const vault = createSeededVault(NOW);
    assert.ok(vault.alerts.some((alert) => alert.kind === "DUPLICATE_RECEIPT"));
  });

  it("detects missing receipt metadata", () => {
    const vault = createSeededVault(NOW);
    assert.ok(vault.alerts.some((alert) => alert.kind === "MISSING_METADATA" && alert.itemId === "item-unknown"));
  });

  it("queues return deadline reminders", () => {
    const vault = createSeededVault(NOW);
    assert.ok(vault.alerts.some((alert) => alert.kind === "RETURN_DEADLINE"));
    assert.ok(vault.reminders.some((reminder) => reminder.dedupeKey.includes("RETURN_DEADLINE")));
  });

  it("detects expiring and expired warranties", () => {
    const vault = createSeededVault(NOW);
    assert.ok(vault.alerts.some((alert) => alert.kind === "WARRANTY_EXPIRING"));
    assert.ok(vault.alerts.some((alert) => alert.kind === "WARRANTY_EXPIRED"));
  });

  it("opens and resolves claims", () => {
    const vault = createSeededVault(NOW);
    vault.ingest({ eventId: "open", itemId: "item-washer", type: "CLAIM_OPENED", occurredAt: NOW.toISOString() });
    assert.equal(vault.itemById("item-washer").claimStatus, "OPEN");
    assert.equal(vault.itemById("item-washer").status, "CLAIM_OPEN");
    vault.ingest({ eventId: "resolve", itemId: "item-washer", type: "CLAIM_RESOLVED", occurredAt: addMinutes(60, NOW) });
    assert.equal(vault.itemById("item-washer").claimStatus, "RESOLVED");
    assert.equal(vault.itemById("item-washer").status, "WARRANTY_SOON");
  });

  it("detects stale claims", () => {
    const vault = createSeededVault(NOW);
    assert.ok(vault.alerts.some((alert) => alert.kind === "CLAIM_STALE" && alert.itemId === "item-drill"));
  });

  it("deduplicates reminders across scans", () => {
    const vault = createSeededVault(NOW);
    const before = vault.reminders.length;
    vault.scanVault(NOW);
    assert.equal(vault.reminders.length, before);
  });

  it("dispatches alerts and reminders", () => {
    const vault = createSeededVault(NOW);
    assert.ok(vault.dispatchAlerts() > 0);
    assert.ok(vault.dispatchReminders() > 0);
    assert.ok(vault.alerts.every((alert) => alert.status === "SENT"));
    assert.ok(vault.reminders.every((reminder) => reminder.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const vault = createSeededVault(NOW);
    vault.ingest({ eventId: "old", itemId: "item-laptop", type: "METADATA_UPDATED", occurredAt: addMinutes(-300 * 24 * 60, NOW) });
    const result = vault.retain(180, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(vault.events.length, vault.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const vault = createSeededVault(NOW);
    vault.ensureJob("VAULT_SCAN");
    vault.failNextJob = true;
    assert.equal(vault.dispatchNextJob().job?.status, "RETRY");
    assert.equal(vault.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const vault = createSeededVault(NOW);
    assert.equal(vault.ensureJob("ALERT_DISPATCH").id, vault.ensureJob("ALERT_DISPATCH").id);
    const restored = createSeededVault(NOW);
    restored.importState(vault.exportState());
    assert.equal(restored.items.length, vault.items.length);
    assert.equal(restored.alerts.length, vault.alerts.length);
  });
});
