import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountEventKey, accountFingerprint, addMinutes, checksum, createSeededAccountSecurity } from "../src/core.js";

const NOW = new Date("2026-07-09T15:00:00Z");

describe("AccountSecurityCheckup", () => {
  it("seeds accounts, breaches, alerts, and risk metrics", () => {
    const security = createSeededAccountSecurity(NOW);
    assert.equal(security.accounts.length, 5);
    assert.equal(security.breaches.length, 1);
    assert.ok(security.alerts.length > 0);
    assert.ok(security.snapshot().metrics.highRisk > 0);
  });

  it("uses stable event keys, fingerprints, and checksums", () => {
    assert.equal(accountEventKey({ accountId: "acct-1", eventId: "abc" }), "acct-1:abc");
    assert.equal(accountFingerprint({ domain: " Example.COM ", username: " Ava@Example.com " }), "example.com:ava@example.com");
    assert.equal(checksum({ ok: true }).length, 16);
  });

  it("deduplicates account events", () => {
    const security = createSeededAccountSecurity(NOW);
    const input = { eventId: "dup", accountId: "acct-bank", type: "ACCOUNT_UPDATED" as const, occurredAt: NOW.toISOString() };
    assert.equal(security.ingest(input).duplicate, false);
    assert.equal(security.ingest(input).duplicate, true);
  });

  it("updates account metadata", () => {
    const security = createSeededAccountSecurity(NOW);
    security.ingest({ eventId: "update", accountId: "acct-cloud", type: "ACCOUNT_UPDATED", importance: "CRITICAL", notes: "Main cloud account.", occurredAt: NOW.toISOString() });
    const account = security.accountById("acct-cloud");
    assert.equal(account.importance, "CRITICAL");
    assert.equal(account.notes, "Main cloud account.");
  });

  it("ignores stale account updates", () => {
    const security = createSeededAccountSecurity(NOW);
    const before = security.accountById("acct-email").provider;
    const result = security.ingest({ eventId: "old", accountId: "acct-email", type: "ACCOUNT_UPDATED", provider: "Old Mail", occurredAt: addMinutes(-30 * 24 * 60, NOW) });
    assert.equal(result.stale, true);
    assert.equal(security.accountById("acct-email").provider, before);
  });

  it("creates new accounts", () => {
    const security = createSeededAccountSecurity(NOW);
    security.ingest({ eventId: "create", accountId: "acct-health", type: "ACCOUNT_ADDED", provider: "Health Portal", username: "ava", category: "HEALTH", domain: "health.test", importance: "HIGH", occurredAt: NOW.toISOString() });
    assert.equal(security.accountById("acct-health").provider, "Health Portal");
  });

  it("enables MFA and lowers risk posture", () => {
    const security = createSeededAccountSecurity(NOW);
    const before = security.accountById("acct-bank").riskScore;
    security.ingest({ eventId: "mfa", accountId: "acct-bank", type: "MFA_ENABLED", mfaMethod: "TOTP", occurredAt: NOW.toISOString() });
    assert.equal(security.accountById("acct-bank").mfaEnabled, true);
    assert.ok(security.accountById("acct-bank").riskScore < before);
  });

  it("updates recovery methods", () => {
    const security = createSeededAccountSecurity(NOW);
    security.ingest({ eventId: "recovery", accountId: "acct-shop", type: "RECOVERY_UPDATED", recoveryEmail: "backup@example.com", recoveryPhone: "+15550000000", occurredAt: NOW.toISOString() });
    assert.equal(security.accountById("acct-shop").recoveryPhone, "+15550000000");
  });

  it("rotates stale passwords", () => {
    const security = createSeededAccountSecurity(NOW);
    security.ingest({ eventId: "rotate", accountId: "acct-social", type: "PASSWORD_ROTATED", occurredAt: NOW.toISOString() });
    assert.equal(security.accountById("acct-social").passwordLastChangedAt, NOW.toISOString());
  });

  it("revokes sessions", () => {
    const security = createSeededAccountSecurity(NOW);
    security.ingest({ eventId: "session", accountId: "acct-cloud", type: "SESSION_REVOKED", occurredAt: NOW.toISOString() });
    assert.equal(security.accountById("acct-cloud").activeSessions, 8);
  });

  it("imports breach findings", () => {
    const security = createSeededAccountSecurity(NOW);
    security.ingest({ eventId: "breach", accountId: "acct-email", type: "BREACH_IMPORTED", breachSource: "sample feed", breachSeverity: "CRITICAL", occurredAt: NOW.toISOString() });
    assert.equal(security.accountById("acct-email").status, "BREACHED");
    assert.ok(security.alerts.some((alert) => alert.kind === "BREACH_OPEN"));
  });

  it("detects duplicate accounts", () => {
    const security = createSeededAccountSecurity(NOW);
    security.ingest({ eventId: "dupe", accountId: "acct-email-copy", type: "ACCOUNT_ADDED", provider: "Google duplicate", username: "ava@example.com", category: "EMAIL", domain: "google.com", occurredAt: NOW.toISOString() });
    assert.equal(security.accountById("acct-email-copy").status, "DUPLICATE");
    assert.ok(security.alerts.some((alert) => alert.kind === "DUPLICATE_ACCOUNT"));
  });

  it("detects security scan alerts", () => {
    const security = createSeededAccountSecurity(NOW);
    assert.ok(security.alerts.some((alert) => alert.kind === "MFA_MISSING"));
    assert.ok(security.alerts.some((alert) => alert.kind === "RECOVERY_INCOMPLETE"));
    assert.ok(security.alerts.some((alert) => alert.kind === "PASSWORD_STALE"));
    assert.ok(security.alerts.some((alert) => alert.kind === "SESSION_SPIKE"));
  });

  it("generates account recovery checklists", () => {
    const security = createSeededAccountSecurity(NOW);
    const checklist = security.generateChecklist(NOW);
    assert.equal(checklist.status, "READY");
    assert.equal(checklist.accountCount, 5);
    assert.ok(security.alerts.some((alert) => alert.kind === "CHECKLIST_READY"));
  });

  it("dispatches alerts", () => {
    const security = createSeededAccountSecurity(NOW);
    assert.ok(security.dispatchAlerts() > 0);
    assert.ok(security.alerts.every((alert) => alert.status === "SENT"));
  });

  it("retains recent events and resets processed keys", () => {
    const security = createSeededAccountSecurity(NOW);
    security.ingest({ eventId: "old-event", accountId: "acct-social", type: "ACCOUNT_UPDATED", occurredAt: addMinutes(-800 * 24 * 60, NOW) });
    const result = security.retain(365, NOW);
    assert.ok(result.deleted > 0);
    assert.equal(security.events.length, security.processed.size);
  });

  it("retries failed jobs and then completes them", () => {
    const security = createSeededAccountSecurity(NOW);
    security.ensureJob("BREACH_IMPORT");
    security.failNextJob = true;
    assert.equal(security.dispatchNextJob().job?.status, "RETRY");
    assert.equal(security.dispatchNextJob().job?.status, "COMPLETED");
  });

  it("deduplicates hourly jobs and restores state", () => {
    const security = createSeededAccountSecurity(NOW);
    assert.equal(security.ensureJob("REMINDER_DISPATCH").id, security.ensureJob("REMINDER_DISPATCH").id);
    const restored = createSeededAccountSecurity(NOW);
    restored.importState(security.exportState());
    assert.equal(restored.accounts.length, security.accounts.length);
    assert.equal(restored.breaches.length, security.breaches.length);
    assert.equal(restored.alerts.length, security.alerts.length);
  });
});
