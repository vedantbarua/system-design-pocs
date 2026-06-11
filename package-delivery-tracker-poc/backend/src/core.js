import crypto from "node:crypto";

export const DELIVERY_STATES = [
  "LABEL_CREATED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "EXCEPTION"
];

const CARRIER_CODES = {
  UPS: {
    M: "LABEL_CREATED",
    I: "IN_TRANSIT",
    O: "OUT_FOR_DELIVERY",
    D: "DELIVERED",
    X: "EXCEPTION"
  },
  FEDEX: {
    OC: "LABEL_CREATED",
    IT: "IN_TRANSIT",
    OD: "OUT_FOR_DELIVERY",
    DL: "DELIVERED",
    DE: "EXCEPTION"
  },
  USPS: {
    "PRE-SHIPMENT": "LABEL_CREATED",
    "IN TRANSIT": "IN_TRANSIT",
    "OUT FOR DELIVERY": "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    ALERT: "EXCEPTION"
  },
  AMAZON: {
    SHIPMENT_CREATED: "LABEL_CREATED",
    SHIPPED: "IN_TRANSIT",
    OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    DELAYED: "EXCEPTION"
  }
};

const ALLOWED_TRANSITIONS = {
  LABEL_CREATED: new Set(["LABEL_CREATED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"]),
  IN_TRANSIT: new Set(["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"]),
  OUT_FOR_DELIVERY: new Set(["OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"]),
  EXCEPTION: new Set(["EXCEPTION", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]),
  DELIVERED: new Set(["DELIVERED"])
};

function id(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function iso(value = new Date()) {
  const parsed = new Date(value);
  assert(!Number.isNaN(parsed.getTime()), "invalid timestamp");
  return parsed.toISOString();
}

function dateOnly(value = new Date()) {
  return iso(value).slice(0, 10);
}

function startOfDay(value) {
  return new Date(`${dateOnly(value)}T00:00:00.000Z`).getTime();
}

export function normalizeCarrierStatus(carrier, carrierStatus) {
  const normalizedCarrier = String(carrier || "").toUpperCase();
  const raw = String(carrierStatus || "").trim().toUpperCase();
  const status = CARRIER_CODES[normalizedCarrier]?.[raw] || (DELIVERY_STATES.includes(raw) ? raw : null);
  assert(status, `unsupported ${normalizedCarrier || "carrier"} status: ${carrierStatus}`);
  return status;
}

export function eventKey(input) {
  if (input.eventId) return `${String(input.carrier).toUpperCase()}:${input.eventId}`;
  return [
    String(input.carrier).toUpperCase(),
    input.trackingNumber,
    input.carrierStatus,
    iso(input.occurredAt),
    input.location || ""
  ].join(":");
}

export function canTransition(from, to) {
  return Boolean(ALLOWED_TRANSITIONS[from]?.has(to));
}

export class DeliveryStore {
  constructor() {
    this.households = [];
    this.packages = [];
    this.events = [];
    this.notifications = [];
    this.pollRuns = [];
    this.processedEventKeys = new Set();
  }

  seed() {
    this.households = [
      {
        id: "household-maple",
        name: "Maple Street",
        address: "1428 Maple Street, Chicago, IL 60614",
        members: ["Vedant", "Maya"]
      }
    ];
    this.packages = [
      {
        id: "pkg-coffee",
        householdId: "household-maple",
        trackingNumber: "1Z84A20E0391208841",
        carrier: "UPS",
        merchant: "Trade Coffee",
        description: "Coffee subscription",
        recipient: "Vedant",
        state: "OUT_FOR_DELIVERY",
        eta: "2026-06-10",
        deliveryWindow: "1:15 PM - 4:15 PM",
        lastEventAt: "2026-06-10T12:42:00.000Z",
        lastLocation: "Chicago, IL",
        createdAt: "2026-06-07T15:10:00.000Z",
        deliveredAt: null,
        expectedOn: "2026-06-10",
        promisedOn: "2026-06-10",
        notificationPreferences: { outForDelivery: true, delivered: true, exception: true }
      },
      {
        id: "pkg-headphones",
        householdId: "household-maple",
        trackingNumber: "784512930184",
        carrier: "FEDEX",
        merchant: "B&H Photo",
        description: "Noise-canceling headphones",
        recipient: "Maya",
        state: "IN_TRANSIT",
        eta: "2026-06-11",
        deliveryWindow: null,
        lastEventAt: "2026-06-10T10:18:00.000Z",
        lastLocation: "Indianapolis, IN",
        createdAt: "2026-06-08T14:00:00.000Z",
        deliveredAt: null,
        expectedOn: "2026-06-11",
        promisedOn: "2026-06-11",
        notificationPreferences: { outForDelivery: true, delivered: true, exception: true }
      },
      {
        id: "pkg-skincare",
        householdId: "household-maple",
        trackingNumber: "9400111899562840192014",
        carrier: "USPS",
        merchant: "Dermstore",
        description: "Skincare order",
        recipient: "Maya",
        state: "EXCEPTION",
        eta: "2026-06-12",
        deliveryWindow: null,
        lastEventAt: "2026-06-10T09:06:00.000Z",
        lastLocation: "Elk Grove Village, IL",
        createdAt: "2026-06-06T16:20:00.000Z",
        deliveredAt: null,
        expectedOn: "2026-06-10",
        promisedOn: "2026-06-10",
        exceptionReason: "Weather delay",
        notificationPreferences: { outForDelivery: true, delivered: true, exception: true }
      },
      {
        id: "pkg-books",
        householdId: "household-maple",
        trackingNumber: "TBA324091827000",
        carrier: "AMAZON",
        merchant: "Amazon",
        description: "System design books",
        recipient: "Vedant",
        state: "IN_TRANSIT",
        eta: "2026-06-13",
        deliveryWindow: null,
        lastEventAt: "2026-06-10T07:45:00.000Z",
        lastLocation: "Kenosha, WI",
        createdAt: "2026-06-09T13:05:00.000Z",
        deliveredAt: null,
        expectedOn: "2026-06-13",
        promisedOn: "2026-06-13",
        notificationPreferences: { outForDelivery: true, delivered: true, exception: true }
      },
      {
        id: "pkg-filter",
        householdId: "household-maple",
        trackingNumber: "1Z42V90E0312291042",
        carrier: "UPS",
        merchant: "FilterBuy",
        description: "HVAC replacement filters",
        recipient: "Vedant",
        state: "DELIVERED",
        eta: "2026-06-09",
        deliveryWindow: null,
        lastEventAt: "2026-06-09T20:18:00.000Z",
        lastLocation: "Front porch",
        createdAt: "2026-06-05T12:00:00.000Z",
        deliveredAt: "2026-06-09T20:18:00.000Z",
        expectedOn: "2026-06-09",
        promisedOn: "2026-06-09",
        notificationPreferences: { outForDelivery: true, delivered: true, exception: true }
      }
    ];
    const seedEvents = [
      ["evt-coffee-1", "pkg-coffee", "I", "2026-06-09T14:12:00Z", "Louisville, KY", "Departed carrier facility"],
      ["evt-coffee-2", "pkg-coffee", "O", "2026-06-10T12:42:00Z", "Chicago, IL", "Loaded on delivery vehicle"],
      ["evt-headphones-1", "pkg-headphones", "IT", "2026-06-10T10:18:00Z", "Indianapolis, IN", "In transit"],
      ["evt-skincare-1", "pkg-skincare", "ALERT", "2026-06-10T09:06:00Z", "Elk Grove Village, IL", "Weather delay"],
      ["evt-books-1", "pkg-books", "SHIPPED", "2026-06-10T07:45:00Z", "Kenosha, WI", "Package departed facility"],
      ["evt-filter-1", "pkg-filter", "D", "2026-06-09T20:18:00Z", "Front porch", "Delivered"]
    ];
    for (const [eventId, packageId, carrierStatus, occurredAt, location, message] of seedEvents) {
      const parcel = this.packages.find((item) => item.id === packageId);
      const key = `${parcel.carrier}:${eventId}`;
      this.events.push({
        id: id("event"),
        eventKey: key,
        eventId,
        packageId,
        trackingNumber: parcel.trackingNumber,
        carrier: parcel.carrier,
        carrierStatus,
        normalizedStatus: normalizeCarrierStatus(parcel.carrier, carrierStatus),
        occurredAt: iso(occurredAt),
        receivedAt: iso("2026-06-10T13:00:00Z"),
        location,
        message,
        projectionApplied: true,
        ignoredReason: null,
        source: "seed"
      });
      this.processedEventKeys.add(key);
    }
  }

  household(householdId) {
    const household = this.households.find((item) => item.id === householdId);
    assert(household, "household not found");
    return household;
  }

  parcel(packageId) {
    const parcel = this.packages.find((item) => item.id === packageId);
    assert(parcel, "package not found");
    return parcel;
  }

  findByTracking(carrier, trackingNumber) {
    return this.packages.find(
      (item) => item.carrier === String(carrier).toUpperCase() && item.trackingNumber === trackingNumber
    );
  }

  addPackage(input) {
    this.household(input.householdId);
    assert(input.trackingNumber?.trim(), "trackingNumber is required");
    assert(input.carrier?.trim(), "carrier is required");
    assert(!this.findByTracking(input.carrier, input.trackingNumber), "tracking number already exists");
    const parcel = {
      id: id("pkg"),
      householdId: input.householdId,
      trackingNumber: input.trackingNumber.trim(),
      carrier: input.carrier.trim().toUpperCase(),
      merchant: input.merchant?.trim() || "Unknown merchant",
      description: input.description?.trim() || "Package",
      recipient: input.recipient?.trim() || "Household",
      state: "LABEL_CREATED",
      eta: input.eta || null,
      deliveryWindow: null,
      lastEventAt: null,
      lastLocation: null,
      createdAt: iso(input.createdAt),
      deliveredAt: null,
      expectedOn: input.eta || null,
      promisedOn: input.promisedOn || input.eta || null,
      exceptionReason: null,
      notificationPreferences: { outForDelivery: true, delivered: true, exception: true }
    };
    this.packages.push(parcel);
    return this.packageView(parcel.id);
  }

  hasEvent(eventKeyValue) {
    return this.processedEventKeys.has(eventKeyValue);
  }

  ingestEvent(input, options = {}) {
    assert(input.trackingNumber, "trackingNumber is required");
    assert(input.carrier, "carrier is required");
    assert(input.occurredAt, "occurredAt is required");
    const parcel = this.findByTracking(input.carrier, input.trackingNumber);
    assert(parcel, "package not found for carrier and tracking number");
    const key = eventKey(input);
    if (this.processedEventKeys.has(key)) {
      return { duplicate: true, event: this.events.find((item) => item.eventKey === key), package: this.packageView(parcel.id) };
    }

    const normalizedStatus = normalizeCarrierStatus(parcel.carrier, input.carrierStatus);
    const occurredAt = iso(input.occurredAt);
    let projectionApplied = true;
    let ignoredReason = null;
    if (parcel.lastEventAt && new Date(occurredAt) < new Date(parcel.lastEventAt)) {
      projectionApplied = false;
      ignoredReason = "OUT_OF_ORDER";
    } else if (!canTransition(parcel.state, normalizedStatus)) {
      projectionApplied = false;
      ignoredReason = "INVALID_TRANSITION";
    }

    const event = {
      id: id("event"),
      eventKey: key,
      eventId: input.eventId || null,
      packageId: parcel.id,
      trackingNumber: parcel.trackingNumber,
      carrier: parcel.carrier,
      carrierStatus: input.carrierStatus,
      normalizedStatus,
      occurredAt,
      receivedAt: iso(input.receivedAt),
      location: input.location || null,
      message: input.message || normalizedStatus.replaceAll("_", " ").toLowerCase(),
      projectionApplied,
      ignoredReason,
      source: options.source || input.source || "webhook"
    };
    this.events.unshift(event);
    this.processedEventKeys.add(key);

    if (projectionApplied) {
      parcel.state = normalizedStatus;
      parcel.lastEventAt = occurredAt;
      parcel.lastLocation = input.location || parcel.lastLocation;
      parcel.eta = input.eta || parcel.eta;
      parcel.deliveryWindow = input.deliveryWindow ?? parcel.deliveryWindow;
      parcel.exceptionReason = normalizedStatus === "EXCEPTION" ? event.message : null;
      if (normalizedStatus === "DELIVERED") parcel.deliveredAt = occurredAt;
      this.maybeNotify(parcel, event);
    }
    return { duplicate: false, event, package: this.packageView(parcel.id) };
  }

  maybeNotify(parcel, event) {
    const preference = {
      OUT_FOR_DELIVERY: "outForDelivery",
      DELIVERED: "delivered",
      EXCEPTION: "exception"
    }[event.normalizedStatus];
    if (!preference || !parcel.notificationPreferences[preference]) return;
    this.notifications.unshift({
      id: id("notification"),
      packageId: parcel.id,
      householdId: parcel.householdId,
      type: event.normalizedStatus,
      channel: "push",
      status: "QUEUED",
      title:
        event.normalizedStatus === "DELIVERED"
          ? `${parcel.description} was delivered`
          : event.normalizedStatus === "EXCEPTION"
            ? `Delivery issue: ${parcel.description}`
            : `${parcel.description} is out for delivery`,
      createdAt: event.receivedAt
    });
  }

  updatePreferences(packageId, input) {
    const parcel = this.parcel(packageId);
    parcel.notificationPreferences = {
      ...parcel.notificationPreferences,
      ...Object.fromEntries(
        ["outForDelivery", "delivered", "exception"]
          .filter((key) => typeof input[key] === "boolean")
          .map((key) => [key, input[key]])
      )
    };
    return this.packageView(packageId);
  }

  runPoll(householdId, asOf = "2026-06-10T14:00:00Z") {
    this.household(householdId);
    const candidates = this.packages.filter(
      (item) => item.householdId === householdId && !["DELIVERED"].includes(item.state)
    );
    const generated = [];
    for (const parcel of candidates) {
      const scenario =
        parcel.id === "pkg-headphones"
          ? { status: "OD", message: "On vehicle for delivery", location: "Chicago, IL", window: "2:00 PM - 6:00 PM" }
          : parcel.id === "pkg-skincare"
            ? { status: "IN TRANSIT", message: "Delay cleared; moving through network", location: "Chicago, IL" }
            : null;
      if (!scenario) continue;
      const result = this.ingestEvent(
        {
          eventId: `poll-${parcel.id}-${dateOnly(asOf)}`,
          trackingNumber: parcel.trackingNumber,
          carrier: parcel.carrier,
          carrierStatus: scenario.status,
          occurredAt: asOf,
          receivedAt: asOf,
          location: scenario.location,
          message: scenario.message,
          deliveryWindow: scenario.window
        },
        { source: "poll" }
      );
      if (!result.duplicate) generated.push(result.event);
    }
    const run = {
      id: id("poll"),
      householdId,
      startedAt: iso(asOf),
      carriersChecked: [...new Set(candidates.map((item) => item.carrier))],
      packagesChecked: candidates.length,
      eventsCreated: generated.length
    };
    this.pollRuns.unshift(run);
    return { run, events: generated };
  }

  packageView(packageId) {
    const parcel = this.parcel(packageId);
    return {
      ...parcel,
      events: this.events.filter((event) => event.packageId === packageId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    };
  }

  carrierMetrics(householdId) {
    const carriers = [...new Set(this.packages.filter((item) => item.householdId === householdId).map((item) => item.carrier))];
    return carriers.map((carrier) => {
      const packages = this.packages.filter((item) => item.householdId === householdId && item.carrier === carrier);
      const delivered = packages.filter((item) => item.state === "DELIVERED");
      const onTime = delivered.filter((item) => !item.promisedOn || dateOnly(item.deliveredAt) <= item.promisedOn).length;
      return {
        carrier,
        active: packages.filter((item) => item.state !== "DELIVERED").length,
        delivered: delivered.length,
        exceptions: packages.filter((item) => item.state === "EXCEPTION").length,
        onTimeRate: delivered.length ? Math.round((onTime / delivered.length) * 100) : carrier === "USPS" ? 86 : 94
      };
    });
  }

  snapshot(householdId = this.households[0]?.id, asOf = "2026-06-10T14:00:00Z") {
    const household = this.household(householdId);
    const packages = this.packages
      .filter((item) => item.householdId === householdId)
      .map((item) => this.packageView(item.id))
      .sort((a, b) => {
        const rank = { EXCEPTION: 0, OUT_FOR_DELIVERY: 1, IN_TRANSIT: 2, LABEL_CREATED: 3, DELIVERED: 4 };
        return rank[a.state] - rank[b.state] || (a.eta || "9999").localeCompare(b.eta || "9999");
      });
    const sevenDaysAgo = startOfDay(asOf) - 6 * 24 * 60 * 60 * 1000;
    const statusCounts = packages.reduce((counts, parcel) => {
      counts[parcel.state] = (counts[parcel.state] || 0) + 1;
      return counts;
    }, {});
    const deliveredRecently = packages.filter(
      (item) => item.deliveredAt && new Date(item.deliveredAt).getTime() >= sevenDaysAgo
    ).length;
    const ignoredEvents = this.events.filter(
      (item) => packages.some((parcel) => parcel.id === item.packageId) && !item.projectionApplied
    ).length;
    return {
      household,
      households: this.households,
      packages,
      events: this.events.filter((item) => packages.some((parcel) => parcel.id === item.packageId)).slice(0, 30),
      notifications: this.notifications.filter((item) => item.householdId === householdId).slice(0, 20),
      pollRuns: this.pollRuns.filter((item) => item.householdId === householdId).slice(0, 10),
      carrierMetrics: this.carrierMetrics(householdId),
      metrics: {
        active: packages.filter((item) => item.state !== "DELIVERED").length,
        arrivingToday: packages.filter((item) => item.eta === dateOnly(asOf) && item.state !== "DELIVERED").length,
        exceptions: statusCounts.EXCEPTION || 0,
        deliveredRecently,
        notificationsQueued: this.notifications.filter(
          (item) => item.householdId === householdId && item.status === "QUEUED"
        ).length,
        ignoredEvents
      }
    };
  }

  exportState() {
    return {
      households: this.households,
      packages: this.packages,
      events: this.events,
      notifications: this.notifications,
      pollRuns: this.pollRuns,
      processedEventKeys: [...this.processedEventKeys]
    };
  }

  importState(state) {
    this.households = state.households || [];
    this.packages = state.packages || [];
    this.events = state.events || [];
    this.notifications = state.notifications || [];
    this.pollRuns = state.pollRuns || [];
    this.processedEventKeys = new Set(state.processedEventKeys || this.events.map((event) => event.eventKey));
  }
}

export function createSeededStore() {
  const store = new DeliveryStore();
  store.seed();
  return store;
}
