import crypto from "node:crypto";

export type ReservationKind = "FLIGHT" | "HOTEL" | "ACTIVITY" | "TRANSPORT" | "DINING" | "DOCUMENT";
export type ReservationStatus = "CONFIRMED" | "CHANGED" | "CONFLICT" | "NEEDS_ATTENTION" | "CANCELLED" | "COMPLETED";
export type ItineraryEventType = "BOOKING_IMPORTED" | "BOOKING_UPDATED" | "CHECKIN_OPENED" | "DOCUMENT_ATTACHED" | "RESERVATION_CANCELLED" | "RESERVATION_COMPLETED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Reservation = {
  id: string;
  tripId: string;
  title: string;
  provider: string;
  kind: ReservationKind;
  startAt: string;
  endAt: string;
  location: string;
  confirmationCode: string;
  status: ReservationStatus;
  traveler: string;
  checkInAt: string | null;
  documentDueAt: string | null;
  updatedAt: string;
  fingerprint: string;
};

export type ItineraryEventInput = {
  eventId: string;
  reservationId: string;
  type: ItineraryEventType;
  occurredAt?: string;
  tripId?: string;
  title?: string;
  provider?: string;
  kind?: ReservationKind;
  startAt?: string;
  endAt?: string;
  location?: string;
  confirmationCode?: string;
  traveler?: string;
  checkInAt?: string | null;
  documentDueAt?: string | null;
  notes?: string;
  source?: string;
};

export type ItineraryEvent = Required<Omit<ItineraryEventInput, "occurredAt" | "tripId" | "title" | "provider" | "kind" | "startAt" | "endAt" | "location" | "confirmationCode" | "traveler" | "checkInAt" | "documentDueAt" | "notes" | "source">> & {
  id: string;
  eventKey: string;
  occurredAt: string;
  tripId: string;
  title: string;
  provider: string;
  kind: ReservationKind;
  startAt: string;
  endAt: string;
  location: string;
  confirmationCode: string;
  traveler: string;
  checkInAt: string | null;
  documentDueAt: string | null;
  notes: string;
  source: string;
};

export type Alert = {
  id: string;
  reservationId: string;
  kind: "CHECKIN_OPEN" | "DOCUMENT_DEADLINE" | "SCHEDULE_CONFLICT" | "DEPARTURE_SOON" | "STALE_BOOKING_UPDATE";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
};

export type Reminder = {
  id: string;
  reservationId: string;
  channel: "PUSH" | "EMAIL";
  status: "QUEUED" | "SENT";
  dedupeKey: string;
  scheduledFor: string;
  sentAt: string | null;
};

export type Job = {
  id: string;
  kind: "ITINERARY_SCAN" | "REMINDER_DISPATCH" | "ALERT_DISPATCH" | "RETENTION";
  status: JobStatus;
  attempts: number;
  dedupeKey: string;
  queuedAt: string;
  completedAt: string | null;
  lastError: string | null;
};

export type Audit = { id: string; action: string; details: Record<string, unknown>; at: string };

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export function iso(value: string | number | Date = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

export function addMinutes(minutes: number, value: string | number | Date = new Date()) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

export function itineraryEventKey(input: Pick<ItineraryEventInput, "reservationId" | "eventId">) {
  if (!input.reservationId || !input.eventId) throw new Error("reservationId and eventId are required");
  return `${input.reservationId}:${input.eventId}`;
}

export function fingerprint(provider: string, confirmationCode: string, startAt: string) {
  return `${provider.trim().toLowerCase()}:${confirmationCode.trim().toUpperCase()}:${iso(startAt)}`;
}

export class TravelItinerary {
  reservations: Reservation[] = [];
  events: ItineraryEvent[] = [];
  alerts: Alert[] = [];
  reminders: Reminder[] = [];
  jobs: Job[] = [];
  audit: Audit[] = [];
  processed = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()) {
    this.reservations = [
      this.reservation("res-flight-out", "trip-portugal", "Outbound flight to Lisbon", "BlueJet", "FLIGHT", addMinutes(20 * 60, now), addMinutes(28 * 60, now), "JFK -> LIS", "BJ4821", "CONFIRMED", "Ava", addMinutes(-4 * 60, now), addMinutes(7 * 24 * 60, now), addMinutes(-60, now)),
      this.reservation("res-hotel", "trip-portugal", "Alfama apartment check-in", "StayNest", "HOTEL", addMinutes(32 * 60, now), addMinutes(5 * 24 * 60, now), "Lisbon", "SN9102", "CONFIRMED", "Ava", null, null, addMinutes(-2 * 24 * 60, now)),
      this.reservation("res-food-tour", "trip-portugal", "Evening food tour", "LocalTable", "ACTIVITY", addMinutes(52 * 60, now), addMinutes(55 * 60, now), "Baixa", "LT331", "CONFIRMED", "Noah", null, null, addMinutes(-9 * 24 * 60, now)),
      this.reservation("res-dinner", "trip-portugal", "Fado dinner reservation", "Casa Fado", "DINING", addMinutes(53 * 60, now), addMinutes(56 * 60, now), "Alfama", "CF771", "CONFIRMED", "Ava", null, null, addMinutes(-3 * 24 * 60, now)),
      this.reservation("res-train", "trip-portugal", "Train to Porto", "RailPT", "TRANSPORT", addMinutes(4 * 24 * 60, now), addMinutes(4 * 24 * 60 + 180, now), "Lisbon -> Porto", "RP556", "CONFIRMED", "Ava", null, null, addMinutes(-11 * 24 * 60, now)),
      this.reservation("res-passport", "trip-portugal", "Passport validity check", "Travel Docs", "DOCUMENT", addMinutes(18 * 60, now), addMinutes(18 * 60, now), "Home", "DOC-PASS", "NEEDS_ATTENTION", "Ava", null, addMinutes(12 * 60, now), addMinutes(-30 * 24 * 60, now))
    ];
    this.events = [];
    this.alerts = [];
    this.reminders = [];
    this.jobs = [];
    this.audit = [];
    this.processed = new Set();
    this.failNextJob = false;
    this.scanItinerary(now);
    this.audit = [];
    this.createAudit("DEMO_SEEDED", { reservations: this.reservations.length, alerts: this.alerts.length });
  }

  reservation(idValue: string, tripId: string, title: string, provider: string, kind: ReservationKind, startAt: string, endAt: string, location: string, confirmationCode: string, status: ReservationStatus, traveler: string, checkInAt: string | null, documentDueAt: string | null, updatedAt: string): Reservation {
    const start = iso(startAt);
    return {
      id: idValue,
      tripId,
      title,
      provider,
      kind,
      startAt: start,
      endAt: iso(endAt),
      location,
      confirmationCode,
      status,
      traveler,
      checkInAt: checkInAt ? iso(checkInAt) : null,
      documentDueAt: documentDueAt ? iso(documentDueAt) : null,
      updatedAt: iso(updatedAt),
      fingerprint: fingerprint(provider, confirmationCode, start)
    };
  }

  createAudit(action: string, details: Record<string, unknown>) {
    const audit = { id: id("audit"), action, details, at: iso() };
    this.audit.unshift(audit);
    return audit;
  }

  reservationById(reservationId: string) {
    const reservation = this.reservations.find((candidate) => candidate.id === reservationId);
    if (!reservation) throw new Error("reservation not found");
    return reservation;
  }

  ingest(input: ItineraryEventInput) {
    const reservation = this.reservationById(input.reservationId);
    const eventKey = itineraryEventKey(input);
    if (this.processed.has(eventKey)) return { duplicate: true };
    const occurredAt = iso(input.occurredAt || new Date());
    const event: ItineraryEvent = {
      id: id("event"),
      eventId: input.eventId,
      eventKey,
      reservationId: input.reservationId,
      type: input.type,
      occurredAt,
      tripId: input.tripId || reservation.tripId,
      title: input.title || reservation.title,
      provider: input.provider || reservation.provider,
      kind: input.kind || reservation.kind,
      startAt: input.startAt ? iso(input.startAt) : reservation.startAt,
      endAt: input.endAt ? iso(input.endAt) : reservation.endAt,
      location: input.location || reservation.location,
      confirmationCode: input.confirmationCode || reservation.confirmationCode,
      traveler: input.traveler || reservation.traveler,
      checkInAt: input.checkInAt === undefined ? reservation.checkInAt : input.checkInAt ? iso(input.checkInAt) : null,
      documentDueAt: input.documentDueAt === undefined ? reservation.documentDueAt : input.documentDueAt ? iso(input.documentDueAt) : null,
      notes: input.notes || "",
      source: input.source || "api"
    };

    this.events.push(event);
    this.processed.add(eventKey);

    const staleUpdate = new Date(occurredAt).getTime() < new Date(reservation.updatedAt).getTime();
    if (!staleUpdate && ["BOOKING_IMPORTED", "BOOKING_UPDATED", "CHECKIN_OPENED", "DOCUMENT_ATTACHED"].includes(event.type)) {
      reservation.tripId = event.tripId;
      reservation.title = event.title;
      reservation.provider = event.provider;
      reservation.kind = event.kind;
      reservation.startAt = event.startAt;
      reservation.endAt = event.endAt;
      reservation.location = event.location;
      reservation.confirmationCode = event.confirmationCode;
      reservation.traveler = event.traveler;
      reservation.checkInAt = event.checkInAt;
      reservation.documentDueAt = event.documentDueAt;
      reservation.updatedAt = occurredAt;
      reservation.fingerprint = fingerprint(reservation.provider, reservation.confirmationCode, reservation.startAt);
      reservation.status = event.type === "BOOKING_UPDATED" ? "CHANGED" : "CONFIRMED";
    }
    if (!staleUpdate && event.type === "RESERVATION_CANCELLED") {
      reservation.status = "CANCELLED";
      reservation.updatedAt = occurredAt;
    }
    if (!staleUpdate && event.type === "RESERVATION_COMPLETED") {
      reservation.status = "COMPLETED";
      reservation.updatedAt = occurredAt;
    }

    this.scanItinerary(occurredAt);
    this.createAudit(staleUpdate ? "STALE_BOOKING_EVENT_IGNORED" : "ITINERARY_EVENT_INGESTED", { eventId: event.id, reservationId: reservation.id, type: event.type });
    return { duplicate: false, stale: staleUpdate, event };
  }

  scanItinerary(asOf: string | Date = new Date()) {
    const now = new Date(asOf).getTime();
    for (const reservation of this.reservations) {
      if (reservation.status === "CANCELLED" || reservation.status === "COMPLETED") continue;
      if (new Date(reservation.updatedAt).getTime() < now - 7 * 24 * 60 * 60_000 && new Date(reservation.startAt).getTime() > now) {
        this.ensureAlert(reservation, "STALE_BOOKING_UPDATE", `stale:${reservation.id}`);
      }
      if (reservation.checkInAt) {
        const minutesUntilCheckin = (new Date(reservation.checkInAt).getTime() - now) / 60_000;
        if (minutesUntilCheckin <= 24 * 60 && minutesUntilCheckin >= -12 * 60) {
          this.ensureAlert(reservation, "CHECKIN_OPEN", `checkin:${reservation.id}`);
          this.ensureReminder(reservation, "CHECKIN_OPEN", reservation.checkInAt);
        }
      }
      if (reservation.documentDueAt) {
        const minutesUntilDoc = (new Date(reservation.documentDueAt).getTime() - now) / 60_000;
        if (minutesUntilDoc <= 14 * 24 * 60 && minutesUntilDoc >= 0) {
          this.ensureAlert(reservation, "DOCUMENT_DEADLINE", `doc:${reservation.id}`);
          this.ensureReminder(reservation, "DOCUMENT_DEADLINE", addMinutes(-2 * 60, reservation.documentDueAt));
        }
      }
      const minutesUntilStart = (new Date(reservation.startAt).getTime() - now) / 60_000;
      if (minutesUntilStart <= 48 * 60 && minutesUntilStart >= 0) {
        this.ensureAlert(reservation, "DEPARTURE_SOON", `departure:${reservation.id}`);
        this.ensureReminder(reservation, "DEPARTURE_SOON", addMinutes(-3 * 60, reservation.startAt));
      }
    }

    for (let i = 0; i < this.reservations.length; i += 1) {
      for (let j = i + 1; j < this.reservations.length; j += 1) {
        const left = this.reservations[i];
        const right = this.reservations[j];
        if (left.tripId !== right.tripId || left.status === "CANCELLED" || right.status === "CANCELLED" || left.status === "COMPLETED" || right.status === "COMPLETED") continue;
        if (left.kind === "DOCUMENT" || right.kind === "DOCUMENT") continue;
        if (this.overlaps(left, right)) {
          left.status = "CONFLICT";
          right.status = "CONFLICT";
          this.ensureAlert(right, "SCHEDULE_CONFLICT", `conflict:${left.id}:${right.id}`);
        }
      }
    }
    return { alerts: this.alerts.length, reminders: this.reminders.length };
  }

  overlaps(left: Reservation, right: Reservation) {
    return new Date(left.startAt).getTime() < new Date(right.endAt).getTime() && new Date(right.startAt).getTime() < new Date(left.endAt).getTime();
  }

  ensureAlert(reservation: Reservation, kind: Alert["kind"], dedupeKey: string) {
    let alert = this.alerts.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!alert) {
      alert = { id: id("alert"), reservationId: reservation.id, kind, status: "QUEUED", dedupeKey, createdAt: iso(), sentAt: null };
      this.alerts.unshift(alert);
    }
    return alert;
  }

  ensureReminder(reservation: Reservation, kind: Alert["kind"], scheduledFor: string) {
    const dedupeKey = `reminder:${reservation.id}:${kind}`;
    let reminder = this.reminders.find((candidate) => candidate.dedupeKey === dedupeKey);
    if (!reminder) {
      reminder = { id: id("reminder"), reservationId: reservation.id, channel: "PUSH", status: "QUEUED", dedupeKey, scheduledFor: iso(scheduledFor), sentAt: null };
      this.reminders.unshift(reminder);
    }
    return reminder;
  }

  dispatchAlerts() { let sent = 0; for (const alert of this.alerts.filter((candidate) => candidate.status === "QUEUED")) { alert.status = "SENT"; alert.sentAt = iso(); sent += 1; } return sent; }
  dispatchReminders() { let sent = 0; for (const reminder of this.reminders.filter((candidate) => candidate.status === "QUEUED")) { reminder.status = "SENT"; reminder.sentAt = iso(); sent += 1; } return sent; }
  retain(days = 180, asOf: string | Date = new Date()) { const cutoff = new Date(asOf).getTime() - days * 24 * 60 * 60_000; const before = this.events.length; this.events = this.events.filter((event) => new Date(event.occurredAt).getTime() >= cutoff); this.processed = new Set(this.events.map((event) => event.eventKey)); return { deleted: before - this.events.length }; }
  ensureJob(kind: Job["kind"]) { const dedupeKey = `${kind}:${iso().slice(0, 13)}`; const existing = this.jobs.find((job) => job.dedupeKey === dedupeKey); if (existing) return existing; const job: Job = { id: id("job"), kind, status: "QUEUED", attempts: 0, dedupeKey, queuedAt: iso(), completedAt: null, lastError: null }; this.jobs.unshift(job); return job; }
  dispatchNextJob() {
    const job = this.jobs.find((candidate) => candidate.status === "QUEUED" || candidate.status === "RETRY");
    if (!job) return { processed: false };
    job.attempts += 1;
    if (this.failNextJob) { this.failNextJob = false; job.status = job.attempts >= 3 ? "DEAD" : "RETRY"; job.lastError = "simulated travel provider timeout"; return { processed: true, job }; }
    if (job.kind === "ITINERARY_SCAN") this.scanItinerary();
    if (job.kind === "REMINDER_DISPATCH") this.dispatchReminders();
    if (job.kind === "ALERT_DISPATCH") this.dispatchAlerts();
    if (job.kind === "RETENTION") this.retain(180);
    job.status = "COMPLETED"; job.completedAt = iso(); job.lastError = null; return { processed: true, job };
  }
  drainJobs() { let processed = 0, completed = 0; while (true) { const result = this.dispatchNextJob(); if (!result.processed || !result.job) break; processed += 1; if (result.job.status === "COMPLETED") completed += 1; } return { processed, completed }; }
  snapshot() { return { reservations: [...this.reservations].sort((a, b) => a.startAt.localeCompare(b.startAt)), events: [...this.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, metrics: { trips: new Set(this.reservations.map((reservation) => reservation.tripId)).size, reservations: this.reservations.filter((reservation) => reservation.status !== "CANCELLED").length, conflicts: this.reservations.filter((reservation) => reservation.status === "CONFLICT").length, needsAttention: this.reservations.filter((reservation) => reservation.status === "NEEDS_ATTENTION").length, reminders: this.reminders.length, queuedAlerts: this.alerts.filter((alert) => alert.status === "QUEUED").length, queuedReminders: this.reminders.filter((reminder) => reminder.status === "QUEUED").length, queuedJobs: this.jobs.filter((job) => job.status === "QUEUED" || job.status === "RETRY").length } }; }
  exportState() { return { reservations: this.reservations, events: this.events, alerts: this.alerts, reminders: this.reminders, jobs: this.jobs, audit: this.audit, processed: [...this.processed] }; }
  importState(state: Record<string, unknown>) { this.reservations = state.reservations as Reservation[]; this.events = state.events as ItineraryEvent[]; this.alerts = state.alerts as Alert[]; this.reminders = state.reminders as Reminder[]; this.jobs = state.jobs as Job[]; this.audit = state.audit as Audit[]; this.processed = new Set(state.processed as string[]); }
}

export function createSeededItinerary(now: Date = new Date()) { const itinerary = new TravelItinerary(); itinerary.seed(now); return itinerary; }
