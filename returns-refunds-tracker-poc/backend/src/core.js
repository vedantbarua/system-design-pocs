import crypto from "node:crypto";

export const RETURN_STATES = [
  "REQUESTED",
  "AUTHORIZED",
  "LABEL_ISSUED",
  "IN_TRANSIT",
  "RECEIVED",
  "INSPECTING",
  "APPROVED",
  "REFUND_PENDING",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "REJECTED"
];

const TRANSITIONS = {
  REQUESTED: new Set(["AUTHORIZED", "REJECTED"]),
  AUTHORIZED: new Set(["LABEL_ISSUED", "IN_TRANSIT", "RECEIVED", "REJECTED"]),
  LABEL_ISSUED: new Set(["IN_TRANSIT", "RECEIVED", "REJECTED"]),
  IN_TRANSIT: new Set(["RECEIVED"]),
  RECEIVED: new Set(["INSPECTING", "APPROVED", "REJECTED"]),
  INSPECTING: new Set(["APPROVED", "REJECTED"]),
  APPROVED: new Set(["REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED"]),
  REFUND_PENDING: new Set(["PARTIALLY_REFUNDED", "REFUNDED"]),
  PARTIALLY_REFUNDED: new Set(["PARTIALLY_REFUNDED", "REFUNDED"]),
  REFUNDED: new Set(["REFUNDED"]),
  REJECTED: new Set(["REJECTED"])
};

const MERCHANT_STATUS = {
  requested: "REQUESTED",
  authorized: "AUTHORIZED",
  label_issued: "LABEL_ISSUED",
  received: "RECEIVED",
  inspecting: "INSPECTING",
  approved: "APPROVED",
  refund_pending: "REFUND_PENDING",
  rejected: "REJECTED"
};

function id(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function integer(value, field, min = 0) {
  const parsed = Number(value);
  assert(Number.isInteger(parsed) && parsed >= min, `${field} must be an integer >= ${min}`);
  return parsed;
}

function iso(value = new Date()) {
  const parsed = new Date(value);
  assert(!Number.isNaN(parsed.getTime()), "invalid timestamp");
  return parsed.toISOString();
}

function dateOnly(value = new Date()) {
  return iso(value).slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${dateOnly(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return dateOnly(date);
}

function daysBetween(from, to) {
  return Math.floor(
    (new Date(`${dateOnly(to)}T00:00:00Z`) - new Date(`${dateOnly(from)}T00:00:00Z`)) / 86400000
  );
}

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.has(to));
}

export function webhookKey(input) {
  if (input.eventId) return `${input.provider || input.source || "provider"}:${input.eventId}`;
  return [input.provider || input.source, input.returnId, input.type, input.occurredAt, input.amountCents || ""].join(":");
}

export function refundState(expectedCents, refundedCents) {
  if (refundedCents <= 0) return "REFUND_PENDING";
  if (refundedCents < expectedCents) return "PARTIALLY_REFUNDED";
  return "REFUNDED";
}

export function slaStatus(returnCase, asOf = dateOnly()) {
  if (["REFUNDED", "REJECTED"].includes(returnCase.state)) return "CLOSED";
  const deadline = returnCase.refundDueOn || returnCase.shipBy || returnCase.returnWindowEndsOn;
  if (!deadline) return "ON_TRACK";
  const remaining = daysBetween(asOf, deadline);
  if (remaining < 0) return "BREACHED";
  if (remaining <= 2) return "AT_RISK";
  return "ON_TRACK";
}

export class ReturnsStore {
  constructor() {
    this.purchases = [];
    this.returns = [];
    this.events = [];
    this.refunds = [];
    this.alerts = [];
    this.processedKeys = new Set();
  }

  seed() {
    this.purchases = [
      {
        id: "purchase-headphones",
        merchant: "B&H Photo",
        orderNumber: "BH-9041882",
        purchasedOn: "2026-05-25",
        paymentMethod: "Visa · 4242",
        totalCents: 34900,
        receiptUrl: "receipt://BH-9041882",
        items: [
          { id: "item-headphones", name: "Sony WH-1000XM6", sku: "SONY-XM6-B", quantity: 1, unitPriceCents: 34900 }
        ]
      },
      {
        id: "purchase-shoes",
        merchant: "Nike",
        orderNumber: "NK-771045",
        purchasedOn: "2026-05-18",
        paymentMethod: "Mastercard · 9910",
        totalCents: 21000,
        receiptUrl: "receipt://NK-771045",
        items: [
          { id: "item-shoes", name: "Pegasus 42", sku: "PEG42-10", quantity: 1, unitPriceCents: 15000 },
          { id: "item-socks", name: "Running socks 3-pack", sku: "SOCK-3-W", quantity: 1, unitPriceCents: 6000 }
        ]
      },
      {
        id: "purchase-blender",
        merchant: "Target",
        orderNumber: "TGT-291842",
        purchasedOn: "2026-05-03",
        paymentMethod: "Visa · 4242",
        totalCents: 12999,
        receiptUrl: "receipt://TGT-291842",
        items: [
          { id: "item-blender", name: "Ninja Professional Blender", sku: "NINJA-BL610", quantity: 1, unitPriceCents: 9999 },
          { id: "item-cups", name: "To-go cup set", sku: "NINJA-CUPS", quantity: 1, unitPriceCents: 3000 }
        ]
      },
      {
        id: "purchase-jacket",
        merchant: "REI",
        orderNumber: "REI-559102",
        purchasedOn: "2026-04-12",
        paymentMethod: "Amex · 1007",
        totalCents: 18900,
        receiptUrl: "receipt://REI-559102",
        items: [
          { id: "item-jacket", name: "Rainier Rain Jacket", sku: "REI-RNJ-M", quantity: 1, unitPriceCents: 18900 }
        ]
      },
      {
        id: "purchase-kettle",
        merchant: "Amazon",
        orderNumber: "AMZ-114902",
        purchasedOn: "2026-06-04",
        paymentMethod: "Visa · 4242",
        totalCents: 4599,
        receiptUrl: "receipt://AMZ-114902",
        items: [
          { id: "item-kettle", name: "Electric gooseneck kettle", sku: "KETTLE-GN-B", quantity: 1, unitPriceCents: 4599 }
        ]
      }
    ];

    this.returns = [
      {
        id: "return-headphones",
        purchaseId: "purchase-headphones",
        rma: "RMA-BH-18304",
        state: "IN_TRANSIT",
        reason: "Uncomfortable fit",
        requestedAt: "2026-06-02T15:10:00Z",
        lastEventAt: "2026-06-09T18:22:00Z",
        returnWindowEndsOn: "2026-06-24",
        shipBy: "2026-06-12",
        refundDueOn: null,
        carrier: "UPS",
        trackingNumber: "1ZRET09012844",
        expectedRefundCents: 34900,
        refundedCents: 0,
        feeCents: 0,
        items: [{ itemId: "item-headphones", quantity: 1, approvedQuantity: 0, expectedCents: 34900 }],
        lastLocation: "Louisville, KY",
        rejectionReason: null
      },
      {
        id: "return-shoes",
        purchaseId: "purchase-shoes",
        rma: "RMA-NK-88014",
        state: "REFUND_PENDING",
        reason: "Wrong size",
        requestedAt: "2026-05-27T14:00:00Z",
        lastEventAt: "2026-06-08T16:35:00Z",
        returnWindowEndsOn: "2026-06-17",
        shipBy: "2026-06-03",
        refundDueOn: "2026-06-13",
        carrier: "USPS",
        trackingNumber: "9400RET110284",
        expectedRefundCents: 15000,
        refundedCents: 0,
        feeCents: 0,
        items: [{ itemId: "item-shoes", quantity: 1, approvedQuantity: 1, expectedCents: 15000 }],
        lastLocation: "Nike returns center",
        rejectionReason: null
      },
      {
        id: "return-blender",
        purchaseId: "purchase-blender",
        rma: "RMA-TGT-41129",
        state: "PARTIALLY_REFUNDED",
        reason: "Damaged pitcher",
        requestedAt: "2026-05-20T12:00:00Z",
        lastEventAt: "2026-06-06T19:10:00Z",
        returnWindowEndsOn: "2026-06-02",
        shipBy: "2026-05-27",
        refundDueOn: "2026-06-09",
        carrier: "FEDEX",
        trackingNumber: "FDXRET90182",
        expectedRefundCents: 9999,
        refundedCents: 7000,
        feeCents: 0,
        items: [{ itemId: "item-blender", quantity: 1, approvedQuantity: 1, expectedCents: 9999 }],
        lastLocation: "Refund processor",
        rejectionReason: null
      },
      {
        id: "return-jacket",
        purchaseId: "purchase-jacket",
        rma: "RMA-REI-29210",
        state: "REFUNDED",
        reason: "Color not as expected",
        requestedAt: "2026-04-25T10:15:00Z",
        lastEventAt: "2026-05-07T17:42:00Z",
        returnWindowEndsOn: "2026-05-12",
        shipBy: "2026-05-02",
        refundDueOn: "2026-05-10",
        carrier: "UPS",
        trackingNumber: "1ZRET4410921",
        expectedRefundCents: 18900,
        refundedCents: 18900,
        feeCents: 0,
        items: [{ itemId: "item-jacket", quantity: 1, approvedQuantity: 1, expectedCents: 18900 }],
        lastLocation: "Original payment method",
        rejectionReason: null
      }
    ];

    const seedEvents = [
      ["evt-hp-request", "return-headphones", "merchant", "REQUESTED", "2026-06-02T15:10:00Z", "Return requested"],
      ["evt-hp-auth", "return-headphones", "merchant", "AUTHORIZED", "2026-06-02T15:18:00Z", "Return authorized"],
      ["evt-hp-transit", "return-headphones", "carrier", "IN_TRANSIT", "2026-06-09T18:22:00Z", "Package departed facility"],
      ["evt-shoes-received", "return-shoes", "merchant", "RECEIVED", "2026-06-05T14:25:00Z", "Return received"],
      ["evt-shoes-approved", "return-shoes", "merchant", "REFUND_PENDING", "2026-06-08T16:35:00Z", "Refund approved"],
      ["evt-blender-partial", "return-blender", "payment", "PARTIALLY_REFUNDED", "2026-06-06T19:10:00Z", "Partial refund posted"],
      ["evt-jacket-refunded", "return-jacket", "payment", "REFUNDED", "2026-05-07T17:42:00Z", "Refund posted"]
    ];
    for (const [eventId, returnId, source, type, occurredAt, message] of seedEvents) {
      const key = `${source}:${eventId}`;
      this.events.push({
        id: id("event"),
        eventKey: key,
        eventId,
        returnId,
        source,
        type,
        occurredAt: iso(occurredAt),
        receivedAt: iso(occurredAt),
        message,
        applied: true,
        ignoredReason: null
      });
      this.processedKeys.add(key);
    }
    this.refunds = [
      {
        id: "refund-blender-1",
        returnId: "return-blender",
        provider: "stripe",
        providerRefundId: "re_blender_1",
        amountCents: 7000,
        postedAt: "2026-06-06T19:10:00.000Z",
        status: "POSTED"
      },
      {
        id: "refund-jacket-1",
        returnId: "return-jacket",
        provider: "adyen",
        providerRefundId: "refund_jacket_1",
        amountCents: 18900,
        postedAt: "2026-05-07T17:42:00.000Z",
        status: "POSTED"
      }
    ];
    this.refreshAlerts("2026-06-11");
  }

  purchase(purchaseId) {
    const purchase = this.purchases.find((item) => item.id === purchaseId);
    assert(purchase, "purchase not found");
    return purchase;
  }

  returnCase(returnId) {
    const item = this.returns.find((entry) => entry.id === returnId);
    assert(item, "return not found");
    return item;
  }

  hasEvent(key) {
    return this.processedKeys.has(key);
  }

  createReturn(input) {
    const purchase = this.purchase(input.purchaseId);
    assert(Array.isArray(input.items) && input.items.length > 0, "at least one return item is required");
    const selected = input.items.map((entry) => {
      const purchaseItem = purchase.items.find((item) => item.id === entry.itemId);
      assert(purchaseItem, "purchase item not found");
      const quantity = integer(entry.quantity, "quantity", 1);
      assert(quantity <= purchaseItem.quantity, "return quantity exceeds purchased quantity");
      return {
        itemId: purchaseItem.id,
        quantity,
        approvedQuantity: 0,
        expectedCents: purchaseItem.unitPriceCents * quantity
      };
    });
    const requestedAt = iso(input.requestedAt);
    const returnCase = {
      id: id("return"),
      purchaseId: purchase.id,
      rma: `RMA-${purchase.merchant.replaceAll(" ", "").slice(0, 4).toUpperCase()}-${crypto.randomInt(10000, 99999)}`,
      state: "REQUESTED",
      reason: input.reason || "No longer needed",
      requestedAt,
      lastEventAt: requestedAt,
      returnWindowEndsOn: input.returnWindowEndsOn || addDays(purchase.purchasedOn, 30),
      shipBy: null,
      refundDueOn: null,
      carrier: null,
      trackingNumber: null,
      expectedRefundCents: selected.reduce((sum, item) => sum + item.expectedCents, 0),
      refundedCents: 0,
      feeCents: 0,
      items: selected,
      lastLocation: null,
      rejectionReason: null
    };
    this.returns.push(returnCase);
    this.recordEvent({
      eventId: id("request"),
      returnId: returnCase.id,
      source: "customer",
      type: "REQUESTED",
      occurredAt: requestedAt,
      message: "Return requested"
    });
    return this.returnView(returnCase.id);
  }

  transition(returnId, nextState, input = {}) {
    const returnCase = this.returnCase(returnId);
    assert(RETURN_STATES.includes(nextState), "unsupported return state");
    assert(canTransition(returnCase.state, nextState), `cannot transition from ${returnCase.state} to ${nextState}`);
    returnCase.state = nextState;
    returnCase.lastEventAt = iso(input.occurredAt);
    if (input.shipBy) returnCase.shipBy = input.shipBy;
    if (input.refundDueOn) returnCase.refundDueOn = input.refundDueOn;
    if (input.carrier) returnCase.carrier = input.carrier.toUpperCase();
    if (input.trackingNumber) returnCase.trackingNumber = input.trackingNumber;
    if (input.location) returnCase.lastLocation = input.location;
    if (nextState === "APPROVED") {
      const approvedItems = input.approvedItems || returnCase.items.map((item) => ({ itemId: item.itemId, quantity: item.quantity }));
      let approvedTotal = 0;
      for (const item of returnCase.items) {
        const approved = approvedItems.find((entry) => entry.itemId === item.itemId);
        item.approvedQuantity = approved ? integer(approved.quantity, "approved quantity") : 0;
        assert(item.approvedQuantity <= item.quantity, "approved quantity exceeds returned quantity");
        approvedTotal += Math.round((item.expectedCents / item.quantity) * item.approvedQuantity);
      }
      returnCase.expectedRefundCents = approvedTotal - integer(input.feeCents || 0, "feeCents");
      returnCase.feeCents = integer(input.feeCents || 0, "feeCents");
      assert(returnCase.expectedRefundCents >= 0, "fees cannot exceed approved value");
      returnCase.refundDueOn = input.refundDueOn || addDays(returnCase.lastEventAt, 7);
    }
    if (nextState === "REJECTED") returnCase.rejectionReason = input.reason || "Return rejected after inspection";
    this.recordEvent({
      eventId: input.eventId || id("transition"),
      returnId,
      source: input.source || "operator",
      type: nextState,
      occurredAt: returnCase.lastEventAt,
      message: input.message || nextState.replaceAll("_", " ").toLowerCase()
    });
    return this.returnView(returnId);
  }

  recordEvent(input) {
    const key = webhookKey(input);
    if (this.processedKeys.has(key)) {
      return { duplicate: true, event: this.events.find((event) => event.eventKey === key) };
    }
    const returnCase = this.returnCase(input.returnId);
    const occurredAt = iso(input.occurredAt);
    const event = {
      id: id("event"),
      eventKey: key,
      eventId: input.eventId || null,
      returnId: returnCase.id,
      source: input.source || input.provider || "merchant",
      type: input.type,
      occurredAt,
      receivedAt: iso(input.receivedAt),
      message: input.message || input.type,
      applied: true,
      ignoredReason: null
    };
    if (new Date(occurredAt) < new Date(returnCase.lastEventAt)) {
      event.applied = false;
      event.ignoredReason = "OUT_OF_ORDER";
    }
    this.events.unshift(event);
    this.processedKeys.add(key);
    return { duplicate: false, event };
  }

  ingestMerchantWebhook(input) {
    const type = MERCHANT_STATUS[String(input.status || "").toLowerCase()] || input.status;
    assert(RETURN_STATES.includes(type), "unsupported merchant status");
    const key = webhookKey({ ...input, type, source: input.provider || "merchant" });
    if (this.processedKeys.has(key)) {
      return { duplicate: true, event: this.events.find((event) => event.eventKey === key), return: this.returnView(input.returnId) };
    }
    const returnCase = this.returnCase(input.returnId);
    const occurredAt = iso(input.occurredAt);
    const stale = new Date(occurredAt) < new Date(returnCase.lastEventAt);
    const valid = canTransition(returnCase.state, type);
    const result = this.recordEvent({
      ...input,
      source: input.provider || "merchant",
      type,
      message: input.message || `Merchant reported ${type.replaceAll("_", " ").toLowerCase()}`
    });
    if (stale) {
      result.event.applied = false;
      result.event.ignoredReason = "OUT_OF_ORDER";
    } else if (!valid) {
      result.event.applied = false;
      result.event.ignoredReason = "INVALID_TRANSITION";
    } else {
      returnCase.state = type;
      returnCase.lastEventAt = occurredAt;
      if (input.shipBy) returnCase.shipBy = input.shipBy;
      if (input.refundDueOn) returnCase.refundDueOn = input.refundDueOn;
      if (input.carrier) returnCase.carrier = input.carrier.toUpperCase();
      if (input.trackingNumber) returnCase.trackingNumber = input.trackingNumber;
      if (type === "REJECTED") returnCase.rejectionReason = input.reason || input.message;
    }
    return { duplicate: false, event: result.event, return: this.returnView(input.returnId) };
  }

  ingestCarrierWebhook(input) {
    const carrierState = {
      LABEL_CREATED: "LABEL_ISSUED",
      IN_TRANSIT: "IN_TRANSIT",
      DELIVERED: "RECEIVED"
    }[String(input.status).toUpperCase()];
    assert(carrierState, "unsupported carrier status");
    return this.ingestMerchantWebhook({
      ...input,
      provider: input.carrier || "carrier",
      status: carrierState,
      message: input.message || `Carrier reported ${carrierState.replaceAll("_", " ").toLowerCase()}`
    });
  }

  ingestRefundWebhook(input) {
    const key = webhookKey({ ...input, type: "REFUND_POSTED", source: input.provider });
    if (this.processedKeys.has(key)) {
      return { duplicate: true, refund: this.refunds.find((item) => item.providerRefundId === input.providerRefundId) };
    }
    const returnCase = this.returnCase(input.returnId);
    assert(["APPROVED", "REFUND_PENDING", "PARTIALLY_REFUNDED"].includes(returnCase.state), "return is not ready for a refund");
    const amountCents = integer(input.amountCents, "amountCents", 1);
    assert(returnCase.refundedCents + amountCents <= returnCase.expectedRefundCents, "refund exceeds approved amount");
    const occurredAt = iso(input.occurredAt);
    const refund = {
      id: id("refund"),
      returnId: returnCase.id,
      provider: input.provider || "payment",
      providerRefundId: input.providerRefundId || input.eventId || id("provider"),
      amountCents,
      postedAt: occurredAt,
      status: "POSTED"
    };
    this.refunds.push(refund);
    returnCase.refundedCents += amountCents;
    returnCase.state = refundState(returnCase.expectedRefundCents, returnCase.refundedCents);
    returnCase.lastEventAt = occurredAt;
    const event = this.recordEvent({
      eventId: input.eventId,
      returnId: returnCase.id,
      source: input.provider || "payment",
      type: returnCase.state,
      occurredAt,
      amountCents,
      message: `${returnCase.state === "REFUNDED" ? "Full" : "Partial"} refund posted`
    }).event;
    this.refreshAlerts(dateOnly(occurredAt));
    return { duplicate: false, refund, event, return: this.returnView(returnCase.id) };
  }

  refreshAlerts(asOf = dateOnly()) {
    this.alerts = this.returns
      .map((returnCase) => {
        const status = slaStatus(returnCase, asOf);
        if (!["AT_RISK", "BREACHED"].includes(status)) return null;
        const purchase = this.purchase(returnCase.purchaseId);
        return {
          id: `alert-${returnCase.id}-${status}`,
          returnId: returnCase.id,
          severity: status === "BREACHED" ? "HIGH" : "MEDIUM",
          status,
          title: status === "BREACHED" ? `Refund SLA breached at ${purchase.merchant}` : `Deadline approaching at ${purchase.merchant}`,
          createdAt: `${asOf}T12:00:00.000Z`
        };
      })
      .filter(Boolean);
    return this.alerts;
  }

  returnView(returnId, asOf = "2026-06-11") {
    const returnCase = this.returnCase(returnId);
    const purchase = this.purchase(returnCase.purchaseId);
    return {
      ...returnCase,
      purchase,
      items: returnCase.items.map((line) => ({
        ...line,
        purchaseItem: purchase.items.find((item) => item.id === line.itemId)
      })),
      events: this.events.filter((event) => event.returnId === returnId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      refunds: this.refunds.filter((refund) => refund.returnId === returnId).sort((a, b) => b.postedAt.localeCompare(a.postedAt)),
      sla: slaStatus(returnCase, asOf),
      outstandingCents: Math.max(0, returnCase.expectedRefundCents - returnCase.refundedCents)
    };
  }

  snapshot(asOf = "2026-06-11") {
    this.refreshAlerts(asOf);
    const returns = this.returns
      .map((item) => this.returnView(item.id, asOf))
      .sort((a, b) => {
        const rank = { BREACHED: 0, AT_RISK: 1, ON_TRACK: 2, CLOSED: 3 };
        return rank[a.sla] - rank[b.sla] || b.requestedAt.localeCompare(a.requestedAt);
      });
    return {
      purchases: this.purchases,
      returns,
      events: this.events.slice().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 40),
      refunds: this.refunds.slice().sort((a, b) => b.postedAt.localeCompare(a.postedAt)),
      alerts: this.alerts,
      metrics: {
        openReturns: returns.filter((item) => !["REFUNDED", "REJECTED"].includes(item.state)).length,
        awaitingRefund: returns.filter((item) => ["APPROVED", "REFUND_PENDING", "PARTIALLY_REFUNDED"].includes(item.state)).length,
        atRisk: returns.filter((item) => ["AT_RISK", "BREACHED"].includes(item.sla)).length,
        outstandingCents: returns.reduce((sum, item) => sum + item.outstandingCents, 0),
        refundedCents: this.refunds.reduce((sum, item) => sum + item.amountCents, 0),
        ignoredEvents: this.events.filter((event) => !event.applied).length
      }
    };
  }

  exportState() {
    return {
      purchases: this.purchases,
      returns: this.returns,
      events: this.events,
      refunds: this.refunds,
      alerts: this.alerts,
      processedKeys: [...this.processedKeys]
    };
  }

  importState(state) {
    this.purchases = state.purchases || [];
    this.returns = state.returns || [];
    this.events = state.events || [];
    this.refunds = state.refunds || [];
    this.alerts = state.alerts || [];
    this.processedKeys = new Set(state.processedKeys || this.events.map((event) => event.eventKey));
  }
}

export function createSeededStore() {
  const store = new ReturnsStore();
  store.seed();
  return store;
}

export { addDays, dateOnly, daysBetween };
