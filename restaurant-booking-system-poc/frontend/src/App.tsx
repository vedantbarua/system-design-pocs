import { FormEvent, useEffect, useMemo, useState } from "react";

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

type SlotAvailability = {
  time: string;
  availableTables: DiningTable[];
  heldTables: number;
  reservedTables: number;
  capacity: number;
  bookedSeats: number;
  heldSeats: number;
  utilizationPct: number;
};

type Snapshot = {
  date: string;
  settings: {
    openTime: string;
    closeTime: string;
    slotMinutes: number;
    turnMinutes: number;
    holdTtlMs: number;
  };
  tables: DiningTable[];
  holds: Hold[];
  reservations: Reservation[];
  waitlist: WaitlistEntry[];
  availability: SlotAvailability[];
  events: BookingEvent[];
  metrics: {
    tables: number;
    activeTables: number;
    activeHolds: number;
    activeReservations: number;
    todaysReservations: number;
    waitlistWaiting: number;
    totalCapacity: number;
    idempotencyKeys: number;
    averagePartySize: number;
  };
};

type BookingForm = {
  date: string;
  time: string;
  partySize: string;
  guestName: string;
  guestPhone: string;
  notes: string;
};

const today = new Date().toISOString().slice(0, 10);

const DEFAULT_FORM: BookingForm = {
  date: today,
  time: "18:00",
  partySize: "2",
  guestName: "Jordan Lee",
  guestPhone: "555-0142",
  notes: "Prefers a quiet table"
};

const STATUS_OPTIONS: ReservationStatus[] = [
  "confirmed",
  "seated",
  "completed",
  "no_show",
  "cancelled"
];

function tableName(tables: DiningTable[], id: string) {
  return tables.find((table) => table.id === id)?.name || id;
}

function formatTime(epochMs: number) {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function secondsLeft(epochMs: number) {
  return Math.max(0, Math.ceil((epochMs - Date.now()) / 1000));
}

function statusClass(status: string) {
  return `pill ${status.replace("_", "-")}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data as T;
}

function idempotencyKey() {
  return `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingForm>(DEFAULT_FORM);
  const [selectedDate, setSelectedDate] = useState(today);
  const [pendingHoldId, setPendingHoldId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading booking state...");
  const [error, setError] = useState<string | null>(null);

  const slots = snapshot?.availability.map((slot) => slot.time) || [];
  const activeHolds = useMemo(
    () => snapshot?.holds.filter((hold) => hold.status === "active") || [],
    [snapshot]
  );
  const offeredWaitlist = useMemo(
    () => snapshot?.waitlist.filter((entry) => entry.status === "offered") || [],
    [snapshot]
  );

  async function refresh(date = selectedDate) {
    const data = await fetchJson<Snapshot>(`/api/snapshot?date=${date}`);
    setSnapshot(data);
    setSelectedDate(date);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
    const timer = window.setInterval(() => {
      refresh().catch((err) => setError(err.message));
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  async function createHold(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetchJson<{ held: boolean; hold?: Hold; message?: string }>(
        "/api/holds",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey()
          },
          body: JSON.stringify({
            date: bookingForm.date,
            time: bookingForm.time,
            partySize: Number(bookingForm.partySize),
            guestName: bookingForm.guestName,
            guestPhone: bookingForm.guestPhone
          })
        }
      );
      if (response.held && response.hold) {
        setPendingHoldId(response.hold.id);
        setStatus(`Hold created for ${response.hold.guestName}. Confirm before it expires.`);
      } else {
        setPendingHoldId(null);
        setStatus(response.message || "No matching table was available.");
      }
      await refresh(bookingForm.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create hold");
    }
  }

  async function confirmHold(holdId: string) {
    setError(null);
    try {
      const reservation = await fetchJson<Reservation>(`/api/holds/${holdId}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey()
        },
        body: JSON.stringify({ notes: bookingForm.notes })
      });
      setPendingHoldId(null);
      setStatus(`Reservation confirmed for ${reservation.guestName} at ${reservation.time}.`);
      await refresh(reservation.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to confirm hold");
    }
  }

  async function createWaitlistEntry() {
    setError(null);
    try {
      await fetchJson<WaitlistEntry>("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey()
        },
        body: JSON.stringify({
          date: bookingForm.date,
          time: bookingForm.time,
          partySize: Number(bookingForm.partySize),
          guestName: bookingForm.guestName,
          guestPhone: bookingForm.guestPhone,
          flexibilityMinutes: 90
        })
      });
      setStatus(`${bookingForm.guestName} was added to the waitlist.`);
      await refresh(bookingForm.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create waitlist entry");
    }
  }

  async function bookOffer(waitlistId: string) {
    setError(null);
    try {
      const reservation = await fetchJson<Reservation>(`/api/waitlist/${waitlistId}/book`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey() }
      });
      setStatus(`Waitlist offer booked for ${reservation.guestName}.`);
      await refresh(reservation.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to book waitlist offer");
    }
  }

  async function updateReservation(reservationId: string, statusValue: ReservationStatus) {
    setError(null);
    try {
      const reservation = await fetchJson<Reservation>(`/api/reservations/${reservationId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusValue })
      });
      setStatus(`${reservation.guestName} is now ${statusValue}.`);
      await refresh(reservation.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update reservation");
    }
  }

  async function cancelReservation(reservationId: string) {
    setError(null);
    try {
      const reservation = await fetchJson<Reservation>(`/api/reservations/${reservationId}`, {
        method: "DELETE"
      });
      setStatus(`${reservation.guestName} was cancelled and waitlist promotion ran.`);
      await refresh(reservation.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel reservation");
    }
  }

  async function runSimulation(path: string, message: string) {
    setError(null);
    try {
      const data = await fetchJson<{ snapshot: Snapshot }>(path, { method: "POST" });
      setSnapshot(data.snapshot);
      setStatus(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    }
  }

  async function resetSeed() {
    setError(null);
    try {
      const data = await fetchJson<Snapshot>("/api/seed", { method: "POST" });
      setSnapshot(data);
      setSelectedDate(data.date);
      setBookingForm((current) => ({ ...current, date: data.date }));
      setPendingHoldId(null);
      setStatus("Seed data restored.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset data");
    }
  }

  if (!snapshot) {
    return (
      <main className="app loading-shell">
        <div className="loading-panel">{error || status}</div>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="topbar">
        <div>
          <p className="eyebrow">Restaurant Booking System POC</p>
          <h1>Reservations, holds, waitlist, and table capacity in one live flow</h1>
        </div>
        <div className="controls">
          <label>
            Service date
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                const date = event.target.value;
                refresh(date).catch((err) => setError(err.message));
                setBookingForm((current) => ({ ...current, date }));
              }}
            />
          </label>
          <button
            onClick={() =>
              runSimulation("/api/simulate/walk-in-rush", "Walk-in rush generated holds and waitlist entries.")
            }
          >
            Walk-in rush
          </button>
          <button
            onClick={() => runSimulation("/api/simulate/expire-holds", "Active holds were forced to expire.")}
          >
            Expire holds
          </button>
          <button className="secondary" onClick={resetSeed}>
            Reset
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        <Metric label="Active holds" value={snapshot.metrics.activeHolds} />
        <Metric label="Reservations" value={snapshot.metrics.activeReservations} />
        <Metric label="Waitlist" value={snapshot.metrics.waitlistWaiting} />
        <Metric label="Dining seats" value={snapshot.metrics.totalCapacity} />
        <Metric label="Avg party" value={snapshot.metrics.averagePartySize} />
        <Metric label="Idempotency keys" value={snapshot.metrics.idempotencyKeys} />
      </section>

      {(error || status) && <section className={error ? "notice error" : "notice"}>{error || status}</section>}

      <section className="workspace">
        <form className="booking-panel" onSubmit={createHold}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Booking intake</p>
              <h2>Create a temporary hold</h2>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Date
              <input
                type="date"
                value={bookingForm.date}
                onChange={(event) => setBookingForm((current) => ({ ...current, date: event.target.value }))}
              />
            </label>
            <label>
              Time
              <select
                value={bookingForm.time}
                onChange={(event) => setBookingForm((current) => ({ ...current, time: event.target.value }))}
              >
                {slots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Party
              <input
                type="number"
                min="1"
                max="12"
                value={bookingForm.partySize}
                onChange={(event) =>
                  setBookingForm((current) => ({ ...current, partySize: event.target.value }))
                }
              />
            </label>
            <label>
              Guest
              <input
                value={bookingForm.guestName}
                onChange={(event) =>
                  setBookingForm((current) => ({ ...current, guestName: event.target.value }))
                }
              />
            </label>
            <label>
              Phone
              <input
                value={bookingForm.guestPhone}
                onChange={(event) =>
                  setBookingForm((current) => ({ ...current, guestPhone: event.target.value }))
                }
              />
            </label>
            <label>
              Notes
              <input
                value={bookingForm.notes}
                onChange={(event) => setBookingForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
          </div>
          <div className="button-row">
            <button type="submit">Create hold</button>
            <button type="button" className="secondary" onClick={createWaitlistEntry}>
              Add waitlist
            </button>
            {pendingHoldId && (
              <button type="button" className="success" onClick={() => confirmHold(pendingHoldId)}>
                Confirm hold
              </button>
            )}
          </div>
          <div className="hold-list">
            {activeHolds.length === 0 ? (
              <p>No active holds.</p>
            ) : (
              activeHolds.map((hold) => (
                <div key={hold.id} className="hold-item">
                  <div>
                    <strong>{hold.guestName}</strong>
                    <span>
                      {hold.time} - party {hold.partySize} - {tableName(snapshot.tables, hold.tableId)}
                    </span>
                  </div>
                  <button type="button" onClick={() => confirmHold(hold.id)}>
                    {secondsLeft(hold.expiresAt)}s
                  </button>
                </div>
              ))
            )}
          </div>
        </form>

        <section className="availability-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Capacity view</p>
              <h2>Availability by slot</h2>
            </div>
          </div>
          <div className="slot-list">
            {snapshot.availability.map((slot) => (
              <article key={slot.time} className="slot-row">
                <div className="slot-time">{slot.time}</div>
                <div className="slot-bar">
                  <span style={{ width: `${Math.min(100, slot.utilizationPct)}%` }} />
                </div>
                <div className="slot-meta">
                  <strong>{slot.availableTables.length}</strong> open
                  <span>{slot.reservedTables} reserved</span>
                  <span>{slot.heldTables} held</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="lower-grid">
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Floor state</p>
              <h2>Reservations</h2>
            </div>
          </div>
          <div className="reservation-list">
            {snapshot.reservations.map((reservation) => (
              <article key={reservation.id} className="reservation-card">
                <div>
                  <strong>{reservation.guestName}</strong>
                  <span>
                    {reservation.time} - party {reservation.partySize} -{" "}
                    {tableName(snapshot.tables, reservation.tableId)}
                  </span>
                </div>
                <div className="reservation-actions">
                  <span className={statusClass(reservation.status)}>{reservation.status}</span>
                  <select
                    value={reservation.status}
                    onChange={(event) =>
                      updateReservation(reservation.id, event.target.value as ReservationStatus)
                    }
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button className="secondary" onClick={() => cancelReservation(reservation.id)}>
                    Cancel
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Backpressure</p>
              <h2>Waitlist offers</h2>
            </div>
          </div>
          <div className="waitlist">
            {snapshot.waitlist.length === 0 ? (
              <p>No waitlist entries.</p>
            ) : (
              snapshot.waitlist.map((entry) => (
                <article key={entry.id} className="waitlist-card">
                  <div>
                    <strong>{entry.guestName}</strong>
                    <span>
                      wants {entry.time} - party {entry.partySize} - +/-{entry.flexibilityMinutes}m
                    </span>
                  </div>
                  <div className="waitlist-actions">
                    <span className={statusClass(entry.status)}>{entry.status}</span>
                    {entry.status === "offered" && (
                      <button onClick={() => bookOffer(entry.id)}>Book {entry.offeredTime}</button>
                    )}
                  </div>
                </article>
              ))
            )}
            {offeredWaitlist.length > 0 && (
              <p className="inline-note">{offeredWaitlist.length} offer(s) are waiting for acceptance.</p>
            )}
          </div>
        </section>

        <section className="events-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Audit stream</p>
              <h2>Recent events</h2>
            </div>
          </div>
          <div className="events">
            {snapshot.events.map((event) => (
              <article key={event.id} className={`event ${event.severity}`}>
                <span>{formatTime(event.at)}</span>
                <strong>{event.type}</strong>
                <p>{event.message}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
