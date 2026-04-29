import crypto from "node:crypto";
import cors from "cors";
import express from "express";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8144;
const EVENT_LIMIT = 180;
const SLOT_MINUTES = 30;
const TURN_MINUTES = 90;
const HOLD_TTL_MS = 2 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 12 * 60 * 60 * 1000;

type TableStatus = "active" | "maintenance";
type HoldStatus = "active" | "expired" | "confirmed" | "released";
type ReservationStatus = "confirmed" | "cancelled" | "seated" | "completed" | "no_show";
type WaitlistStatus = "waiting" | "offered" | "booked" | "cancelled" | "expired";
type EventSeverity = "info" | "success" | "warning" | "danger";

type DiningTable = {
  id: string;
  name: string;
  room: string;
  seats: number;
  status: TableStatus;
};

type Hold = {
  id: string;
  tableId: string;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  expiresAt: number;
  createdAt: number;
  status: HoldStatus;
};

type Reservation = {
  id: string;
  tableId: string;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  notes: string;
  status: ReservationStatus;
  createdAt: number;
  updatedAt: number;
};

type WaitlistEntry = {
  id: string;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  flexibilityMinutes: number;
  status: WaitlistStatus;
  offeredTableId?: string;
  offeredTime?: string;
  createdAt: number;
  updatedAt: number;
};

type BookingEvent = {
  id: string;
  type: string;
  severity: EventSeverity;
  message: string;
  payload: Record<string, unknown>;
  at: number;
};

type CreateHoldRequest = {
  date?: string;
  time?: string;
  partySize?: number;
  guestName?: string;
  guestPhone?: string;
};

type ConfirmHoldRequest = {
  notes?: string;
};

type CreateWaitlistRequest = CreateHoldRequest & {
  flexibilityMinutes?: number;
};

type IdempotencyRecord = {
  response: unknown;
  createdAt: number;
};

const settings = {
  openTime: "17:00",
  closeTime: "22:00",
  slotMinutes: SLOT_MINUTES,
  turnMinutes: TURN_MINUTES,
  holdTtlMs: HOLD_TTL_MS
};

let tables: DiningTable[] = [];
let holds: Hold[] = [];
let reservations: Reservation[] = [];
let waitlist: WaitlistEntry[] = [];
let events: BookingEvent[] = [];
const idempotencyStore = new Map<string, IdempotencyRecord>();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toMinutes(time: string) {
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function addMinutes(time: string, minutes: number) {
  const total = toMinutes(time) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(
    2,
    "0"
  )}`;
}

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function buildSlots() {
  const slots: string[] = [];
  let cursor = settings.openTime;
  while (toMinutes(cursor) <= toMinutes(settings.closeTime) - settings.turnMinutes) {
    slots.push(cursor);
    cursor = addMinutes(cursor, settings.slotMinutes);
  }
  return slots;
}

function overlaps(left: { time: string }, right: { time: string }) {
  const leftStart = toMinutes(left.time);
  const rightStart = toMinutes(right.time);
  return leftStart < rightStart + settings.turnMinutes && rightStart < leftStart + settings.turnMinutes;
}

function sanitizeText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 120);
}

function requireString(value: unknown, field: string) {
  const normalized = sanitizeText(value);
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function requirePositiveInt(value: unknown, field: string, max: number) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return numeric;
}

function validateDate(value: unknown) {
  const date = requireString(value, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must use YYYY-MM-DD");
  return date;
}

function validateTime(value: unknown) {
  const time = requireString(value, "time");
  const slots = buildSlots();
  if (!/^\d{2}:\d{2}$/.test(time) || !slots.includes(time)) {
    throw new Error(`time must be one of ${slots.join(", ")}`);
  }
  return time;
}

function logEvent(
  type: string,
  severity: EventSeverity,
  message: string,
  payload: Record<string, unknown> = {}
) {
  events.unshift({
    id: id("evt"),
    type,
    severity,
    message,
    payload,
    at: Date.now()
  });
  if (events.length > EVENT_LIMIT) events = events.slice(0, EVENT_LIMIT);
}

function activeHolds(now = Date.now()) {
  return holds.filter((hold) => hold.status === "active" && hold.expiresAt > now);
}

function cleanupIdempotency() {
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  for (const [key, value] of idempotencyStore.entries()) {
    if (value.createdAt < cutoff) idempotencyStore.delete(key);
  }
}

function confirmedReservationsFor(date: string) {
  return reservations.filter(
    (reservation) =>
      reservation.date === date &&
      ["confirmed", "seated"].includes(reservation.status)
  );
}

function isTableAvailable(tableId: string, date: string, time: string, ignoreHoldId?: string) {
  const table = tables.find((candidate) => candidate.id === tableId);
  if (!table || table.status !== "active") return false;

  const reservationConflict = confirmedReservationsFor(date).some(
    (reservation) => reservation.tableId === tableId && overlaps(reservation, { time })
  );
  if (reservationConflict) return false;

  return !activeHolds().some(
    (hold) =>
      hold.tableId === tableId &&
      hold.date === date &&
      hold.id !== ignoreHoldId &&
      overlaps(hold, { time })
  );
}

function findTable(date: string, time: string, partySize: number, ignoreHoldId?: string) {
  return tables
    .filter((table) => table.status === "active" && table.seats >= partySize)
    .filter((table) => isTableAvailable(table.id, date, time, ignoreHoldId))
    .sort((left, right) => left.seats - right.seats || left.name.localeCompare(right.name))[0];
}

function expireHolds(now = Date.now()) {
  let expired = 0;
  holds = holds.map((hold) => {
    if (hold.status === "active" && hold.expiresAt <= now) {
      expired += 1;
      return { ...hold, status: "expired" };
    }
    return hold;
  });
  if (expired > 0) {
    logEvent("hold.expired", "warning", `${expired} temporary hold(s) expired`, { expired });
    promoteWaitlist();
  }
  return expired;
}

function availabilityForDate(date: string) {
  expireHolds();
  return buildSlots().map((time) => {
    const activeTables = tables.filter((table) => table.status === "active");
    const availableTables = activeTables
      .filter((table) => isTableAvailable(table.id, date, time))
      .sort((left, right) => left.seats - right.seats);
    const reserved = confirmedReservationsFor(date).filter((reservation) =>
      overlaps(reservation, { time })
    );
    const held = activeHolds().filter((hold) => hold.date === date && overlaps(hold, { time }));
    const capacity = activeTables.reduce((sum, table) => sum + table.seats, 0);
    const bookedSeats = reserved.reduce((sum, reservation) => sum + reservation.partySize, 0);
    const heldSeats = held.reduce((sum, hold) => sum + hold.partySize, 0);

    return {
      time,
      availableTables,
      heldTables: held.length,
      reservedTables: reserved.length,
      capacity,
      bookedSeats,
      heldSeats,
      utilizationPct: capacity > 0 ? round(((bookedSeats + heldSeats) / capacity) * 100) : 0
    };
  });
}

function metrics() {
  const today = todayIso();
  const activeReservations = reservations.filter((reservation) =>
    ["confirmed", "seated"].includes(reservation.status)
  );
  const totalCapacity = tables
    .filter((table) => table.status === "active")
    .reduce((sum, table) => sum + table.seats, 0);

  return {
    tables: tables.length,
    activeTables: tables.filter((table) => table.status === "active").length,
    activeHolds: activeHolds().length,
    activeReservations: activeReservations.length,
    todaysReservations: reservations.filter((reservation) => reservation.date === today).length,
    waitlistWaiting: waitlist.filter((entry) => entry.status === "waiting").length,
    totalCapacity,
    idempotencyKeys: idempotencyStore.size,
    averagePartySize:
      activeReservations.length > 0
        ? round(
            activeReservations.reduce((sum, reservation) => sum + reservation.partySize, 0) /
              activeReservations.length
          )
        : 0
  };
}

function promoteWaitlist() {
  const waiting = waitlist
    .filter((entry) => entry.status === "waiting")
    .sort((left, right) => left.createdAt - right.createdAt);

  for (const entry of waiting) {
    const target = toMinutes(entry.time);
    const possibleTimes = buildSlots()
      .filter((slot) => Math.abs(toMinutes(slot) - target) <= entry.flexibilityMinutes)
      .sort((left, right) => Math.abs(toMinutes(left) - target) - Math.abs(toMinutes(right) - target));

    for (const time of possibleTimes) {
      const table = findTable(entry.date, time, entry.partySize);
      if (!table) continue;
      entry.status = "offered";
      entry.offeredTableId = table.id;
      entry.offeredTime = time;
      entry.updatedAt = Date.now();
      logEvent("waitlist.offered", "success", `${entry.guestName} was offered ${time}`, {
        waitlistId: entry.id,
        tableId: table.id,
        time
      });
      break;
    }
  }
}

function createWaitlist(input: CreateWaitlistRequest) {
  const date = validateDate(input.date);
  const time = validateTime(input.time);
  const partySize = requirePositiveInt(input.partySize, "partySize", 12);
  const guestName = requireString(input.guestName, "guestName");
  const guestPhone = requireString(input.guestPhone, "guestPhone");
  const flexibilityMinutes = Math.min(180, Math.max(0, Number(input.flexibilityMinutes ?? 60)));

  const entry: WaitlistEntry = {
    id: id("wait"),
    date,
    time,
    partySize,
    guestName,
    guestPhone,
    flexibilityMinutes,
    status: "waiting",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  waitlist.unshift(entry);
  logEvent("waitlist.created", "info", `${guestName} joined the waitlist`, {
    waitlistId: entry.id,
    date,
    time,
    partySize
  });
  promoteWaitlist();
  return entry;
}

function createHold(input: CreateHoldRequest) {
  expireHolds();
  const date = validateDate(input.date);
  const time = validateTime(input.time);
  const partySize = requirePositiveInt(input.partySize, "partySize", 12);
  const guestName = requireString(input.guestName, "guestName");
  const guestPhone = requireString(input.guestPhone, "guestPhone");
  const table = findTable(date, time, partySize);

  if (!table) {
    const entry = createWaitlist({ date, time, partySize, guestName, guestPhone, flexibilityMinutes: 60 });
    logEvent("hold.denied", "warning", `No table available for ${guestName}; waitlist entry created`, {
      date,
      time,
      partySize,
      waitlistId: entry.id
    });
    return {
      held: false,
      waitlistEntry: entry,
      message: "No matching table is available. Guest was added to the waitlist."
    };
  }

  const hold: Hold = {
    id: id("hold"),
    tableId: table.id,
    date,
    time,
    partySize,
    guestName,
    guestPhone,
    expiresAt: Date.now() + settings.holdTtlMs,
    createdAt: Date.now(),
    status: "active"
  };
  holds.unshift(hold);
  logEvent("hold.created", "info", `${guestName} is holding ${table.name} at ${time}`, {
    holdId: hold.id,
    tableId: table.id,
    expiresAt: hold.expiresAt
  });
  return { held: true, hold, table };
}

function confirmHold(holdId: string, input: ConfirmHoldRequest) {
  expireHolds();
  const hold = holds.find((candidate) => candidate.id === holdId);
  if (!hold) throw new Error("hold not found");
  if (hold.status !== "active") throw new Error(`hold is ${hold.status}`);
  if (!isTableAvailable(hold.tableId, hold.date, hold.time, hold.id)) {
    hold.status = "released";
    throw new Error("table is no longer available for this hold");
  }

  hold.status = "confirmed";
  const reservation: Reservation = {
    id: id("res"),
    tableId: hold.tableId,
    date: hold.date,
    time: hold.time,
    partySize: hold.partySize,
    guestName: hold.guestName,
    guestPhone: hold.guestPhone,
    notes: sanitizeText(input.notes),
    status: "confirmed",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  reservations.unshift(reservation);
  logEvent("reservation.confirmed", "success", `${reservation.guestName} confirmed ${reservation.time}`, {
    reservationId: reservation.id,
    holdId: hold.id,
    tableId: reservation.tableId
  });
  return reservation;
}

function cancelReservation(reservationId: string) {
  const reservation = reservations.find((candidate) => candidate.id === reservationId);
  if (!reservation) throw new Error("reservation not found");
  if (reservation.status === "cancelled") return reservation;
  reservation.status = "cancelled";
  reservation.updatedAt = Date.now();
  logEvent("reservation.cancelled", "warning", `${reservation.guestName} cancelled ${reservation.time}`, {
    reservationId: reservation.id,
    tableId: reservation.tableId
  });
  promoteWaitlist();
  return reservation;
}

function updateReservationStatus(reservationId: string, status: ReservationStatus) {
  const reservation = reservations.find((candidate) => candidate.id === reservationId);
  if (!reservation) throw new Error("reservation not found");
  reservation.status = status;
  reservation.updatedAt = Date.now();
  logEvent("reservation.status", "info", `${reservation.guestName} marked ${status}`, {
    reservationId: reservation.id,
    status
  });
  if (["cancelled", "no_show", "completed"].includes(status)) promoteWaitlist();
  return reservation;
}

function bookWaitlistOffer(waitlistId: string) {
  expireHolds();
  const entry = waitlist.find((candidate) => candidate.id === waitlistId);
  if (!entry) throw new Error("waitlist entry not found");
  if (entry.status !== "offered" || !entry.offeredTableId || !entry.offeredTime) {
    throw new Error("waitlist entry does not have an active offer");
  }
  if (!isTableAvailable(entry.offeredTableId, entry.date, entry.offeredTime)) {
    entry.status = "waiting";
    entry.offeredTableId = undefined;
    entry.offeredTime = undefined;
    entry.updatedAt = Date.now();
    promoteWaitlist();
    throw new Error("offered slot is no longer available");
  }

  const reservation: Reservation = {
    id: id("res"),
    tableId: entry.offeredTableId,
    date: entry.date,
    time: entry.offeredTime,
    partySize: entry.partySize,
    guestName: entry.guestName,
    guestPhone: entry.guestPhone,
    notes: "Booked from waitlist offer",
    status: "confirmed",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  reservations.unshift(reservation);
  entry.status = "booked";
  entry.updatedAt = Date.now();
  logEvent("waitlist.booked", "success", `${entry.guestName} booked from the waitlist`, {
    waitlistId: entry.id,
    reservationId: reservation.id
  });
  return reservation;
}

function seedData() {
  const today = todayIso();
  tables = [
    { id: "tbl-2a", name: "T2", room: "Main", seats: 2, status: "active" },
    { id: "tbl-2b", name: "T4", room: "Window", seats: 2, status: "active" },
    { id: "tbl-4a", name: "T6", room: "Main", seats: 4, status: "active" },
    { id: "tbl-4b", name: "T8", room: "Patio", seats: 4, status: "active" },
    { id: "tbl-6a", name: "T10", room: "Main", seats: 6, status: "active" },
    { id: "tbl-8a", name: "Chef Table", room: "Private", seats: 8, status: "active" }
  ];
  holds = [];
  waitlist = [];
  reservations = [
    {
      id: id("res"),
      tableId: "tbl-4a",
      date: today,
      time: "18:00",
      partySize: 4,
      guestName: "Maya Chen",
      guestPhone: "555-0130",
      notes: "Anniversary dinner",
      status: "confirmed",
      createdAt: Date.now() - 1000 * 60 * 28,
      updatedAt: Date.now() - 1000 * 60 * 28
    },
    {
      id: id("res"),
      tableId: "tbl-2a",
      date: today,
      time: "18:30",
      partySize: 2,
      guestName: "Sam Rivera",
      guestPhone: "555-0199",
      notes: "Window if possible",
      status: "confirmed",
      createdAt: Date.now() - 1000 * 60 * 21,
      updatedAt: Date.now() - 1000 * 60 * 21
    },
    {
      id: id("res"),
      tableId: "tbl-6a",
      date: today,
      time: "19:30",
      partySize: 6,
      guestName: "Priya Shah",
      guestPhone: "555-0177",
      notes: "High chair needed",
      status: "confirmed",
      createdAt: Date.now() - 1000 * 60 * 16,
      updatedAt: Date.now() - 1000 * 60 * 16
    }
  ];
  events = [];
  idempotencyStore.clear();
  logEvent("system.seeded", "success", "Restaurant booking state was reset", {
    tables: tables.length,
    reservations: reservations.length
  });
}

function snapshot(date = todayIso()) {
  expireHolds();
  cleanupIdempotency();
  return {
    date,
    settings,
    tables,
    holds,
    reservations,
    waitlist,
    availability: availabilityForDate(date),
    events,
    metrics: metrics()
  };
}

function handleIdempotent<T>(req: express.Request, operation: () => T): T {
  cleanupIdempotency();
  const key = req.header("Idempotency-Key");
  if (!key) return operation();
  const scopedKey = `${req.method}:${req.path}:${key}`;
  const existing = idempotencyStore.get(scopedKey);
  if (existing) {
    logEvent("idempotency.replay", "info", "Returned cached response for repeated request", { key });
    return existing.response as T;
  }
  const response = operation();
  idempotencyStore.set(scopedKey, { response, createdAt: Date.now() });
  return response;
}

function route(handler: (req: express.Request, res: express.Response) => void) {
  return (req: express.Request, res: express.Response) => {
    try {
      handler(req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      res.status(400).json({ error: message });
    }
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "restaurant-booking-system", now: Date.now() });
});

app.get(
  "/api/snapshot",
  route((req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : todayIso();
    res.json(snapshot(date));
  })
);

app.post(
  "/api/holds",
  route((req, res) => {
    const response = handleIdempotent(req, () => createHold(req.body));
    res.status(201).json(response);
  })
);

app.post(
  "/api/holds/:id/confirm",
  route((req, res) => {
    const response = handleIdempotent(req, () => confirmHold(req.params.id, req.body));
    res.status(201).json(response);
  })
);

app.post(
  "/api/waitlist",
  route((req, res) => {
    const response = handleIdempotent(req, () => createWaitlist(req.body));
    res.status(201).json(response);
  })
);

app.post(
  "/api/waitlist/:id/book",
  route((req, res) => {
    const response = handleIdempotent(req, () => bookWaitlistOffer(req.params.id));
    res.status(201).json(response);
  })
);

app.patch(
  "/api/reservations/:id/status",
  route((req, res) => {
    const status = requireString(req.body.status, "status") as ReservationStatus;
    if (!["confirmed", "cancelled", "seated", "completed", "no_show"].includes(status)) {
      throw new Error("invalid reservation status");
    }
    res.json(updateReservationStatus(req.params.id, status));
  })
);

app.delete(
  "/api/reservations/:id",
  route((req, res) => {
    res.json(cancelReservation(req.params.id));
  })
);

app.post(
  "/api/simulate/expire-holds",
  route((_req, res) => {
    holds = holds.map((hold) =>
      hold.status === "active" ? { ...hold, expiresAt: Date.now() - 1 } : hold
    );
    const expired = expireHolds();
    res.json({ expired, snapshot: snapshot() });
  })
);

app.post(
  "/api/simulate/walk-in-rush",
  route((_req, res) => {
    const today = todayIso();
    const parties = [
      { guestName: "Walk-in Cruz", guestPhone: "555-0101", partySize: 2, time: "18:00" },
      { guestName: "Walk-in Novak", guestPhone: "555-0102", partySize: 4, time: "18:00" },
      { guestName: "Walk-in Olsen", guestPhone: "555-0103", partySize: 6, time: "18:30" },
      { guestName: "Walk-in Adeyemi", guestPhone: "555-0104", partySize: 5, time: "19:00" }
    ];
    const results = parties.map((party) => createHold({ ...party, date: today }));
    res.json({ results, snapshot: snapshot(today) });
  })
);

app.post(
  "/api/seed",
  route((_req, res) => {
    seedData();
    res.json(snapshot());
  })
);

seedData();

app.listen(PORT, () => {
  console.log(`Restaurant booking backend listening on http://localhost:${PORT}`);
});
