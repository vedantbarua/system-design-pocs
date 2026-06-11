import assert from "node:assert/strict";
import test from "node:test";
import {
  ReturnsStore,
  canTransition,
  refundState,
  slaStatus,
  webhookKey
} from "../src/core.js";
import { MemoryRepository } from "../src/repository.js";

test("return state machine permits forward workflow and blocks refunded regression", () => {
  assert.equal(canTransition("REQUESTED", "AUTHORIZED"), true);
  assert.equal(canTransition("REFUNDED", "IN_TRANSIT"), false);
});

test("refund state derives pending, partial, and complete states", () => {
  assert.equal(refundState(10000, 0), "REFUND_PENDING");
  assert.equal(refundState(10000, 4500), "PARTIALLY_REFUNDED");
  assert.equal(refundState(10000, 10000), "REFUNDED");
});

test("webhook keys prefer stable provider event ids", () => {
  assert.equal(webhookKey({ provider: "stripe", eventId: "evt-1" }), "stripe:evt-1");
});

test("SLA status derives at-risk and breached deadlines", () => {
  const item = { state: "REFUND_PENDING", refundDueOn: "2026-06-13" };
  assert.equal(slaStatus(item, "2026-06-11"), "AT_RISK");
  assert.equal(slaStatus(item, "2026-06-14"), "BREACHED");
});

test("creating a multi-item return uses integer-cent line totals", () => {
  const store = new ReturnsStore();
  store.seed();
  const created = store.createReturn({
    purchaseId: "purchase-blender",
    reason: "Changed mind",
    requestedAt: "2026-06-01T12:00:00Z",
    items: [
      { itemId: "item-blender", quantity: 1 },
      { itemId: "item-cups", quantity: 1 }
    ]
  });
  assert.equal(created.expectedRefundCents, 12999);
  assert.equal(created.items.length, 2);
});

test("approval supports partial item quantities and restocking fees", () => {
  const store = new ReturnsStore();
  store.seed();
  const created = store.createReturn({
    purchaseId: "purchase-blender",
    requestedAt: "2026-06-01T12:00:00Z",
    items: [{ itemId: "item-blender", quantity: 1 }]
  });
  store.transition(created.id, "AUTHORIZED", { occurredAt: "2026-06-01T13:00:00Z" });
  store.transition(created.id, "RECEIVED", { occurredAt: "2026-06-03T13:00:00Z" });
  const approved = store.transition(created.id, "APPROVED", {
    occurredAt: "2026-06-04T13:00:00Z",
    approvedItems: [{ itemId: "item-blender", quantity: 1 }],
    feeCents: 999
  });
  assert.equal(approved.expectedRefundCents, 9000);
  assert.equal(approved.feeCents, 999);
});

test("payment webhook reconciles partial then full refund without over-refunding", () => {
  const store = new ReturnsStore();
  store.seed();
  const partial = store.ingestRefundWebhook({
    eventId: "stripe-extra-1",
    provider: "stripe",
    providerRefundId: "re_extra_1",
    returnId: "return-blender",
    amountCents: 2000,
    occurredAt: "2026-06-11T12:00:00Z"
  });
  assert.equal(partial.return.state, "PARTIALLY_REFUNDED");
  const final = store.ingestRefundWebhook({
    eventId: "stripe-extra-2",
    provider: "stripe",
    providerRefundId: "re_extra_2",
    returnId: "return-blender",
    amountCents: 999,
    occurredAt: "2026-06-11T13:00:00Z"
  });
  assert.equal(final.return.state, "REFUNDED");
  assert.throws(
    () => store.ingestRefundWebhook({
      eventId: "stripe-over",
      provider: "stripe",
      returnId: "return-blender",
      amountCents: 1,
      occurredAt: "2026-06-11T14:00:00Z"
    }),
    /not ready for a refund/
  );
});

test("duplicate refund webhook is idempotent", () => {
  const store = new ReturnsStore();
  store.seed();
  const input = {
    eventId: "stripe-dup",
    provider: "stripe",
    providerRefundId: "re_dup",
    returnId: "return-blender",
    amountCents: 500,
    occurredAt: "2026-06-11T12:00:00Z"
  };
  assert.equal(store.ingestRefundWebhook(input).duplicate, false);
  assert.equal(store.ingestRefundWebhook(input).duplicate, true);
  assert.equal(store.returnCase("return-blender").refundedCents, 7500);
});

test("out-of-order merchant webhook is audited without state regression", () => {
  const store = new ReturnsStore();
  store.seed();
  const result = store.ingestMerchantWebhook({
    eventId: "late-auth",
    provider: "nike",
    returnId: "return-shoes",
    status: "authorized",
    occurredAt: "2026-05-28T10:00:00Z"
  });
  assert.equal(result.event.applied, false);
  assert.equal(result.event.ignoredReason, "OUT_OF_ORDER");
  assert.equal(result.return.state, "REFUND_PENDING");
});

test("snapshot reconciles outstanding refund exposure and SLA alerts", () => {
  const store = new ReturnsStore();
  store.seed();
  const snapshot = store.snapshot("2026-06-11");
  assert.equal(snapshot.metrics.openReturns, 3);
  assert.equal(snapshot.metrics.awaitingRefund, 2);
  assert.equal(snapshot.metrics.outstandingCents, 52899);
  assert.equal(snapshot.metrics.atRisk, 3);
  assert.ok(snapshot.alerts.some((alert) => alert.returnId === "return-blender" && alert.status === "BREACHED"));
});

test("memory repository persists state and atomically claims webhook keys", async () => {
  const repository = new MemoryRepository();
  assert.equal(await repository.claim("stripe:evt-1"), true);
  assert.equal(await repository.claim("stripe:evt-1"), false);
  await repository.save({ returns: [{ id: "return-1" }] });
  assert.deepEqual(await repository.load(), { returns: [{ id: "return-1" }] });
});
