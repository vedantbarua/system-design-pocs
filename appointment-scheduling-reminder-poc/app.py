#!/usr/bin/env python3
"""Appointment scheduling and reminder POC.

This app models a practical appointment workflow: providers, services,
working hours, availability, expiring slot holds, conflict-safe booking,
rescheduling, cancellations, waitlist promotion, reminders, no-shows, and
utilization. It uses SQLite and Python's standard library.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import time
import urllib.parse
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
RUNTIME_DIR = ROOT / "runtime"
DEFAULT_DB_PATH = RUNTIME_DIR / "appointments.db"

APPOINTMENT_STATUSES = {"BOOKED", "COMPLETED", "CANCELED", "NO_SHOW"}
WAITLIST_STATUSES = {"WAITING", "PROMOTED", "CANCELED"}
REMINDER_TYPES = {"BOOKING_CONFIRMED", "APPOINTMENT_UPCOMING", "RESCHEDULED", "CANCELED", "WAITLIST_PROMOTED"}


def now_ts() -> int:
    return int(time.time())


def minutes(value: int) -> int:
    return value * 60


def make_id(prefix: str) -> str:
    digest = hashlib.sha256(f"{prefix}:{time.time_ns()}".encode()).hexdigest()[:12]
    return f"{prefix}-{digest}"


def token(value: Any, field: str, max_len: int = 180) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    if not re.fullmatch(r"[A-Za-z0-9._:/@+-]+", result):
        raise ValueError(f"{field} contains unsupported characters")
    return result


def optional_text(value: Any, max_len: int = 1000) -> str:
    result = "" if value is None else str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"value must be at most {max_len} characters")
    return result


def parse_hhmm(value: Any, field: str) -> int:
    text = str(value or "").strip()
    if not re.fullmatch(r"\d{2}:\d{2}", text):
        raise ValueError(f"{field} must use HH:MM")
    hour, minute = [int(part) for part in text.split(":")]
    if hour > 23 or minute > 59:
        raise ValueError(f"{field} is invalid")
    return hour * 60 + minute


def day_start(timestamp: int) -> int:
    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return int(datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc).timestamp())


class AppointmentScheduler:
    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.init_schema()

    def close(self) -> None:
        self.conn.close()

    def init_schema(self) -> None:
        self.conn.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS providers (
                provider_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                location TEXT NOT NULL,
                timezone TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS services (
                service_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL,
                price_cents INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS provider_services (
                provider_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                PRIMARY KEY(provider_id, service_id)
            );

            CREATE TABLE IF NOT EXISTS working_hours (
                provider_id TEXT NOT NULL,
                weekday INTEGER NOT NULL,
                start_minute INTEGER NOT NULL,
                end_minute INTEGER NOT NULL,
                PRIMARY KEY(provider_id, weekday)
            );

            CREATE TABLE IF NOT EXISTS customers (
                customer_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS slot_holds (
                hold_id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                start_at INTEGER NOT NULL,
                end_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS appointments (
                appointment_id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                start_at INTEGER NOT NULL,
                end_at INTEGER NOT NULL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS waitlist (
                waitlist_id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                preferred_start INTEGER NOT NULL,
                preferred_end INTEGER NOT NULL,
                status TEXT NOT NULL,
                promoted_appointment_id TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reminders (
                reminder_id TEXT PRIMARY KEY,
                appointment_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                reminder_type TEXT NOT NULL,
                channel TEXT NOT NULL,
                message TEXT NOT NULL,
                sent_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                resource TEXT NOT NULL,
                message TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def seed_if_empty(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) AS count FROM providers").fetchone()["count"]
        if count:
            return
        self.upsert_service({"service_id": "haircut", "name": "Haircut", "duration_minutes": 30, "price_cents": 3500}, actor="seed")
        self.upsert_service({"service_id": "consultation", "name": "Consultation", "duration_minutes": 60, "price_cents": 7500}, actor="seed")
        self.upsert_provider(
            {
                "provider_id": "provider-maya",
                "name": "Maya",
                "location": "Downtown",
                "timezone": "America/Chicago",
                "service_ids": ["haircut", "consultation"],
                "working_hours": [
                    {"weekday": day, "start": "09:00", "end": "17:00"} for day in range(0, 5)
                ],
            },
            actor="seed",
        )
        self.upsert_customer({"customer_id": "cust-ada", "name": "Ada", "email": "ada@example.com", "phone": "+13125550101"}, actor="seed")
        self.upsert_customer({"customer_id": "cust-ben", "name": "Ben", "email": "ben@example.com", "phone": "+13125550102"}, actor="seed")

        base = day_start(now_ts()) + minutes(9 * 60)
        while datetime.fromtimestamp(base, tz=timezone.utc).weekday() >= 5:
            base += 24 * 60 * 60
        self.book_appointment(
            {
                "appointment_id": "appt-seeded",
                "provider_id": "provider-maya",
                "service_id": "haircut",
                "customer_id": "cust-ada",
                "start_at": base + minutes(60),
                "notes": "Seed appointment.",
            },
            actor="seed",
        )

    def upsert_provider(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        provider_id = token(payload.get("provider_id"), "provider_id")
        self.conn.execute(
            """
            INSERT INTO providers(provider_id, name, location, timezone, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(provider_id) DO UPDATE SET
                name = excluded.name,
                location = excluded.location,
                timezone = excluded.timezone
            """,
            (
                provider_id,
                optional_text(payload.get("name"), 120),
                optional_text(payload.get("location"), 120),
                token(payload.get("timezone", "UTC"), "timezone"),
                now_ts(),
            ),
        )
        self.conn.execute("DELETE FROM provider_services WHERE provider_id = ?", (provider_id,))
        for service_id in payload.get("service_ids", []):
            self.get_service(token(service_id, "service_id"))
            self.conn.execute("INSERT INTO provider_services(provider_id, service_id) VALUES (?, ?)", (provider_id, service_id))
        self.conn.execute("DELETE FROM working_hours WHERE provider_id = ?", (provider_id,))
        for hours in payload.get("working_hours", []):
            weekday = int(hours.get("weekday"))
            start = parse_hhmm(hours.get("start"), "start")
            end = parse_hhmm(hours.get("end"), "end")
            if weekday < 0 or weekday > 6 or end <= start:
                raise ValueError("working hours are invalid")
            self.conn.execute(
                "INSERT INTO working_hours(provider_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?)",
                (provider_id, weekday, start, end),
            )
        self.conn.commit()
        self.audit(actor, "upsert_provider", provider_id, "Registered provider and availability.")
        return self.get_provider(provider_id)

    def upsert_service(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        service_id = token(payload.get("service_id"), "service_id")
        duration = int(payload.get("duration_minutes", 30))
        price = int(payload.get("price_cents", 0))
        if duration < 5 or duration > 480 or price < 0:
            raise ValueError("service duration or price is invalid")
        self.conn.execute(
            """
            INSERT INTO services(service_id, name, duration_minutes, price_cents, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(service_id) DO UPDATE SET
                name = excluded.name,
                duration_minutes = excluded.duration_minutes,
                price_cents = excluded.price_cents
            """,
            (service_id, optional_text(payload.get("name"), 120), duration, price, now_ts()),
        )
        self.conn.commit()
        self.audit(actor, "upsert_service", service_id, "Registered appointment service.")
        return self.get_service(service_id)

    def upsert_customer(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        customer_id = token(payload.get("customer_id"), "customer_id")
        self.conn.execute(
            """
            INSERT INTO customers(customer_id, name, email, phone, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(customer_id) DO UPDATE SET
                name = excluded.name, email = excluded.email, phone = excluded.phone
            """,
            (
                customer_id,
                optional_text(payload.get("name"), 120),
                token(payload.get("email"), "email"),
                token(payload.get("phone"), "phone"),
                now_ts(),
            ),
        )
        self.conn.commit()
        self.audit(actor, "upsert_customer", customer_id, "Registered customer.")
        return self.get_customer(customer_id)

    def available_slots(self, provider_id: str, service_id: str, date_timestamp: int, timestamp: int | None = None) -> list[dict[str, int]]:
        provider_id = token(provider_id, "provider_id")
        service_id = token(service_id, "service_id")
        self.get_provider(provider_id)
        service = self.get_service(service_id)
        self.ensure_provider_service(provider_id, service_id)
        current = int(timestamp or now_ts())
        self.expire_holds(current)
        start_of_day = day_start(int(date_timestamp))
        weekday = datetime.fromtimestamp(start_of_day, tz=timezone.utc).weekday()
        hours = self.conn.execute(
            "SELECT * FROM working_hours WHERE provider_id = ? AND weekday = ?",
            (provider_id, weekday),
        ).fetchone()
        if not hours:
            return []
        slots = []
        cursor = start_of_day + minutes(hours["start_minute"])
        work_end = start_of_day + minutes(hours["end_minute"])
        duration = minutes(service["duration_minutes"])
        while cursor + duration <= work_end:
            if cursor >= current and not self.has_conflict(provider_id, cursor, cursor + duration, current):
                slots.append({"start_at": cursor, "end_at": cursor + duration})
            cursor += minutes(15)
        return slots

    def create_hold(self, payload: dict[str, Any], actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        current = int(timestamp or now_ts())
        provider_id = token(payload.get("provider_id"), "provider_id")
        service_id = token(payload.get("service_id"), "service_id")
        customer_id = token(payload.get("customer_id"), "customer_id")
        self.get_customer(customer_id)
        service = self.get_service(service_id)
        self.ensure_provider_service(provider_id, service_id)
        start_at = int(payload.get("start_at"))
        end_at = start_at + minutes(service["duration_minutes"])
        self.ensure_within_working_hours(provider_id, start_at, end_at)
        self.expire_holds(current)
        if self.has_conflict(provider_id, start_at, end_at, current):
            raise ValueError("slot is no longer available")
        hold_id = token(payload.get("hold_id", make_id("hold")), "hold_id")
        self.conn.execute(
            """
            INSERT INTO slot_holds(hold_id, provider_id, service_id, customer_id, start_at, end_at, expires_at, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
            """,
            (hold_id, provider_id, service_id, customer_id, start_at, end_at, current + minutes(5), current),
        )
        self.conn.commit()
        self.audit(actor, "create_hold", hold_id, "Placed five-minute slot hold.")
        return self.get_hold(hold_id)

    def book_appointment(self, payload: dict[str, Any], actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        current = int(timestamp or now_ts())
        provider_id = token(payload.get("provider_id"), "provider_id")
        service_id = token(payload.get("service_id"), "service_id")
        customer_id = token(payload.get("customer_id"), "customer_id")
        self.get_customer(customer_id)
        service = self.get_service(service_id)
        self.ensure_provider_service(provider_id, service_id)
        start_at = int(payload.get("start_at"))
        end_at = start_at + minutes(service["duration_minutes"])
        self.ensure_within_working_hours(provider_id, start_at, end_at)
        hold_id = payload.get("hold_id")
        self.expire_holds(current)
        if hold_id:
            hold = self.get_hold(token(hold_id, "hold_id"))
            if hold["status"] != "ACTIVE" or hold["expires_at"] <= current:
                raise ValueError("slot hold has expired")
            if hold["provider_id"] != provider_id or hold["service_id"] != service_id or hold["customer_id"] != customer_id or hold["start_at"] != start_at:
                raise ValueError("slot hold does not match booking")
        if self.has_conflict(provider_id, start_at, end_at, current, ignored_hold_id=hold_id):
            raise ValueError("slot is no longer available")
        appointment_id = token(payload.get("appointment_id", make_id("appt")), "appointment_id")
        try:
            self.conn.execute("BEGIN IMMEDIATE")
            if self.has_conflict(provider_id, start_at, end_at, current, ignored_hold_id=hold_id):
                raise ValueError("slot is no longer available")
            self.conn.execute(
                """
                INSERT INTO appointments(
                    appointment_id, provider_id, service_id, customer_id,
                    start_at, end_at, status, notes, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?)
                """,
                (appointment_id, provider_id, service_id, customer_id, start_at, end_at, optional_text(payload.get("notes")), current, current),
            )
            if hold_id:
                self.conn.execute("UPDATE slot_holds SET status = 'CONSUMED' WHERE hold_id = ?", (hold_id,))
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise
        self.audit(actor, "book_appointment", appointment_id, "Booked appointment.")
        self.send_reminder(appointment_id, "BOOKING_CONFIRMED", actor=actor, timestamp=current)
        return self.get_appointment(appointment_id)

    def reschedule(self, appointment_id: str, new_start_at: int, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        current = int(timestamp or now_ts())
        appointment = self.get_appointment(token(appointment_id, "appointment_id"))
        if appointment["status"] != "BOOKED":
            raise ValueError("only booked appointments can be rescheduled")
        service = self.get_service(appointment["service_id"])
        new_end = int(new_start_at) + minutes(service["duration_minutes"])
        self.ensure_within_working_hours(appointment["provider_id"], int(new_start_at), new_end)
        if self.has_conflict(appointment["provider_id"], int(new_start_at), new_end, current, ignored_appointment_id=appointment_id):
            raise ValueError("new slot is unavailable")
        old_start = appointment["start_at"]
        self.conn.execute(
            "UPDATE appointments SET start_at = ?, end_at = ?, updated_at = ? WHERE appointment_id = ?",
            (int(new_start_at), new_end, current, appointment_id),
        )
        self.conn.commit()
        self.audit(actor, "reschedule", appointment_id, f"Moved appointment from {old_start} to {new_start_at}.")
        self.send_reminder(appointment_id, "RESCHEDULED", actor=actor, timestamp=current)
        self.promote_waitlist(appointment["provider_id"], appointment["service_id"], old_start, appointment["end_at"], actor=actor)
        return self.get_appointment(appointment_id)

    def cancel(self, appointment_id: str, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        current = int(timestamp or now_ts())
        appointment = self.get_appointment(token(appointment_id, "appointment_id"))
        if appointment["status"] == "CANCELED":
            return appointment
        if appointment["status"] != "BOOKED":
            raise ValueError("only booked appointments can be canceled")
        self.conn.execute(
            "UPDATE appointments SET status = 'CANCELED', updated_at = ? WHERE appointment_id = ?",
            (current, appointment_id),
        )
        self.conn.commit()
        self.audit(actor, "cancel_appointment", appointment_id, "Canceled appointment.")
        self.send_reminder(appointment_id, "CANCELED", actor=actor, timestamp=current)
        promoted = self.promote_waitlist(
            appointment["provider_id"],
            appointment["service_id"],
            appointment["start_at"],
            appointment["end_at"],
            actor=actor,
        )
        result = self.get_appointment(appointment_id)
        result["promoted_appointment"] = promoted
        return result

    def add_waitlist(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        provider_id = token(payload.get("provider_id"), "provider_id")
        service_id = token(payload.get("service_id"), "service_id")
        customer_id = token(payload.get("customer_id"), "customer_id")
        self.get_customer(customer_id)
        self.ensure_provider_service(provider_id, service_id)
        preferred_start = int(payload.get("preferred_start"))
        preferred_end = int(payload.get("preferred_end", preferred_start))
        if preferred_end < preferred_start:
            raise ValueError("preferred_end must not be before preferred_start")
        waitlist_id = token(payload.get("waitlist_id", make_id("wait")), "waitlist_id")
        self.conn.execute(
            """
            INSERT INTO waitlist(
                waitlist_id, provider_id, service_id, customer_id,
                preferred_start, preferred_end, status, promoted_appointment_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'WAITING', NULL, ?)
            """,
            (waitlist_id, provider_id, service_id, customer_id, preferred_start, preferred_end, now_ts()),
        )
        self.conn.commit()
        self.audit(actor, "join_waitlist", waitlist_id, "Added customer to waitlist.")
        return self.get_waitlist(waitlist_id)

    def promote_waitlist(self, provider_id: str, service_id: str, slot_start: int, slot_end: int, actor: str = "api") -> dict[str, Any] | None:
        row = self.conn.execute(
            """
            SELECT * FROM waitlist
            WHERE provider_id = ? AND service_id = ? AND status = 'WAITING'
            AND preferred_start <= ? AND preferred_end >= ?
            ORDER BY created_at, waitlist_id
            LIMIT 1
            """,
            (provider_id, service_id, slot_start, slot_start),
        ).fetchone()
        if not row:
            return None
        entry = waitlist_from_row(row)
        appointment = self.book_appointment(
            {
                "provider_id": provider_id,
                "service_id": service_id,
                "customer_id": entry["customer_id"],
                "start_at": slot_start,
                "notes": f"Promoted from waitlist {entry['waitlist_id']}.",
            },
            actor=actor,
        )
        self.conn.execute(
            "UPDATE waitlist SET status = 'PROMOTED', promoted_appointment_id = ? WHERE waitlist_id = ?",
            (appointment["appointment_id"], entry["waitlist_id"]),
        )
        self.conn.commit()
        self.send_reminder(appointment["appointment_id"], "WAITLIST_PROMOTED", actor=actor)
        self.audit(actor, "promote_waitlist", entry["waitlist_id"], f"Promoted to {appointment['appointment_id']}.")
        return appointment

    def update_status(self, appointment_id: str, status: str, actor: str = "api") -> dict[str, Any]:
        status = str(status).strip().upper()
        if status not in {"COMPLETED", "NO_SHOW"}:
            raise ValueError("status must be COMPLETED or NO_SHOW")
        appointment = self.get_appointment(token(appointment_id, "appointment_id"))
        if appointment["status"] != "BOOKED":
            raise ValueError("only booked appointments can be completed or marked no-show")
        self.conn.execute(
            "UPDATE appointments SET status = ?, updated_at = ? WHERE appointment_id = ?",
            (status, now_ts(), appointment_id),
        )
        self.conn.commit()
        self.audit(actor, "update_appointment_status", appointment_id, f"Appointment marked {status}.")
        return self.get_appointment(appointment_id)

    def generate_reminders(self, actor: str = "api", timestamp: int | None = None) -> list[dict[str, Any]]:
        current = int(timestamp or now_ts())
        rows = self.conn.execute(
            """
            SELECT appointment_id FROM appointments
            WHERE status = 'BOOKED' AND start_at > ? AND start_at <= ?
            ORDER BY start_at
            """,
            (current, current + 24 * 60 * 60),
        ).fetchall()
        reminders = []
        for row in rows:
            existing = self.conn.execute(
                "SELECT reminder_id FROM reminders WHERE appointment_id = ? AND reminder_type = 'APPOINTMENT_UPCOMING'",
                (row["appointment_id"],),
            ).fetchone()
            if not existing:
                reminders.append(self.send_reminder(row["appointment_id"], "APPOINTMENT_UPCOMING", actor=actor, timestamp=current))
        return reminders

    def send_reminder(self, appointment_id: str, reminder_type: str, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        reminder_type = str(reminder_type).strip().upper()
        if reminder_type not in REMINDER_TYPES:
            raise ValueError("invalid reminder type")
        appointment = self.get_appointment(appointment_id)
        customer = self.get_customer(appointment["customer_id"])
        messages = {
            "BOOKING_CONFIRMED": "Your appointment is confirmed.",
            "APPOINTMENT_UPCOMING": "Your appointment is coming up within 24 hours.",
            "RESCHEDULED": "Your appointment has been rescheduled.",
            "CANCELED": "Your appointment has been canceled.",
            "WAITLIST_PROMOTED": "A waitlist opening is now booked for you.",
        }
        reminder_id = make_id("rem")
        self.conn.execute(
            """
            INSERT INTO reminders(reminder_id, appointment_id, customer_id, reminder_type, channel, message, sent_at)
            VALUES (?, ?, ?, ?, 'email', ?, ?)
            """,
            (reminder_id, appointment_id, customer["customer_id"], reminder_type, messages[reminder_type], int(timestamp or now_ts())),
        )
        self.conn.commit()
        self.audit(actor, "send_reminder", reminder_id, f"Sent {reminder_type} to {customer['email']}.")
        return self.get_reminder(reminder_id)

    def expire_holds(self, timestamp: int | None = None) -> int:
        current = int(timestamp or now_ts())
        cursor = self.conn.execute(
            "UPDATE slot_holds SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at <= ?",
            (current,),
        )
        self.conn.commit()
        return cursor.rowcount

    def has_conflict(
        self,
        provider_id: str,
        start_at: int,
        end_at: int,
        timestamp: int,
        ignored_hold_id: str | None = None,
        ignored_appointment_id: str | None = None,
    ) -> bool:
        appointment = self.conn.execute(
            """
            SELECT appointment_id FROM appointments
            WHERE provider_id = ? AND status = 'BOOKED'
            AND start_at < ? AND end_at > ?
            AND (? IS NULL OR appointment_id != ?)
            LIMIT 1
            """,
            (provider_id, end_at, start_at, ignored_appointment_id, ignored_appointment_id),
        ).fetchone()
        if appointment:
            return True
        hold = self.conn.execute(
            """
            SELECT hold_id FROM slot_holds
            WHERE provider_id = ? AND status = 'ACTIVE' AND expires_at > ?
            AND start_at < ? AND end_at > ?
            AND (? IS NULL OR hold_id != ?)
            LIMIT 1
            """,
            (provider_id, timestamp, end_at, start_at, ignored_hold_id, ignored_hold_id),
        ).fetchone()
        return bool(hold)

    def ensure_provider_service(self, provider_id: str, service_id: str) -> None:
        row = self.conn.execute(
            "SELECT 1 FROM provider_services WHERE provider_id = ? AND service_id = ?",
            (provider_id, service_id),
        ).fetchone()
        if not row:
            raise ValueError("provider does not offer this service")

    def ensure_within_working_hours(self, provider_id: str, start_at: int, end_at: int) -> None:
        start_day = day_start(start_at)
        if day_start(end_at - 1) != start_day:
            raise ValueError("appointment must fit within one working day")
        weekday = datetime.fromtimestamp(start_at, tz=timezone.utc).weekday()
        hours = self.conn.execute(
            "SELECT * FROM working_hours WHERE provider_id = ? AND weekday = ?",
            (provider_id, weekday),
        ).fetchone()
        if not hours:
            raise ValueError("provider is not working that day")
        work_start = start_day + minutes(hours["start_minute"])
        work_end = start_day + minutes(hours["end_minute"])
        if start_at < work_start or end_at > work_end:
            raise ValueError("appointment is outside working hours")

    def get_provider(self, provider_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM providers WHERE provider_id = ?", (provider_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown provider: {provider_id}")
        result = dict(row)
        result["service_ids"] = [
            item["service_id"] for item in self.conn.execute(
                "SELECT service_id FROM provider_services WHERE provider_id = ? ORDER BY service_id", (provider_id,)
            ).fetchall()
        ]
        result["working_hours"] = [
            dict(item) for item in self.conn.execute(
                "SELECT weekday, start_minute, end_minute FROM working_hours WHERE provider_id = ? ORDER BY weekday", (provider_id,)
            ).fetchall()
        ]
        return result

    def get_service(self, service_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM services WHERE service_id = ?", (service_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown service: {service_id}")
        return dict(row)

    def get_customer(self, customer_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM customers WHERE customer_id = ?", (customer_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown customer: {customer_id}")
        return dict(row)

    def get_hold(self, hold_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM slot_holds WHERE hold_id = ?", (hold_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown hold: {hold_id}")
        return dict(row)

    def get_appointment(self, appointment_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM appointments WHERE appointment_id = ?", (appointment_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown appointment: {appointment_id}")
        result = dict(row)
        result["provider"] = self.get_provider(result["provider_id"])
        result["service"] = self.get_service(result["service_id"])
        result["customer"] = self.get_customer(result["customer_id"])
        return result

    def get_waitlist(self, waitlist_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM waitlist WHERE waitlist_id = ?", (waitlist_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown waitlist entry: {waitlist_id}")
        return waitlist_from_row(row)

    def get_reminder(self, reminder_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM reminders WHERE reminder_id = ?", (reminder_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown reminder: {reminder_id}")
        return dict(row)

    def list_providers(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT provider_id FROM providers ORDER BY provider_id").fetchall()
        return [self.get_provider(row["provider_id"]) for row in rows]

    def list_services(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.conn.execute("SELECT * FROM services ORDER BY service_id").fetchall()]

    def list_appointments(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT appointment_id FROM appointments ORDER BY start_at, appointment_id").fetchall()
        return [self.get_appointment(row["appointment_id"]) for row in rows]

    def list_waitlist(self) -> list[dict[str, Any]]:
        return [waitlist_from_row(row) for row in self.conn.execute("SELECT * FROM waitlist ORDER BY created_at, waitlist_id").fetchall()]

    def list_reminders(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.conn.execute("SELECT * FROM reminders ORDER BY sent_at DESC, reminder_id DESC").fetchall()]

    def audit(self, actor: str, action: str, resource: str, message: str) -> None:
        self.conn.execute(
            "INSERT INTO audit_events(created_at, actor, action, resource, message) VALUES (?, ?, ?, ?, ?)",
            (now_ts(), optional_text(actor, 120) or "system", token(action, "action"), optional_text(resource, 180), optional_text(message)),
        )
        self.conn.commit()

    def list_audit(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.conn.execute("SELECT * FROM audit_events ORDER BY created_at DESC, audit_id DESC").fetchall()]

    def utilization(self, provider_id: str, date_timestamp: int) -> dict[str, Any]:
        provider = self.get_provider(provider_id)
        start = day_start(int(date_timestamp))
        end = start + 24 * 60 * 60
        weekday = datetime.fromtimestamp(start, tz=timezone.utc).weekday()
        hours = self.conn.execute(
            "SELECT * FROM working_hours WHERE provider_id = ? AND weekday = ?",
            (provider_id, weekday),
        ).fetchone()
        available_minutes = 0 if not hours else hours["end_minute"] - hours["start_minute"]
        booked = self.conn.execute(
            """
            SELECT COALESCE(SUM((end_at - start_at) / 60), 0) AS booked_minutes
            FROM appointments
            WHERE provider_id = ? AND status IN ('BOOKED', 'COMPLETED', 'NO_SHOW')
            AND start_at >= ? AND start_at < ?
            """,
            (provider_id, start, end),
        ).fetchone()["booked_minutes"]
        return {
            "provider": provider,
            "date_start": start,
            "available_minutes": available_minutes,
            "booked_minutes": int(booked),
            "utilization_percent": round((booked / available_minutes) * 100, 1) if available_minutes else 0.0,
        }

    def snapshot(self) -> dict[str, Any]:
        status_rows = self.conn.execute("SELECT status, COUNT(*) AS count FROM appointments GROUP BY status").fetchall()
        scalar = lambda sql: self.conn.execute(sql).fetchone()["count"]
        return {
            "provider_count": scalar("SELECT COUNT(*) AS count FROM providers"),
            "service_count": scalar("SELECT COUNT(*) AS count FROM services"),
            "customer_count": scalar("SELECT COUNT(*) AS count FROM customers"),
            "appointment_status_counts": {row["status"]: row["count"] for row in status_rows},
            "active_hold_count": scalar("SELECT COUNT(*) AS count FROM slot_holds WHERE status = 'ACTIVE'"),
            "waiting_count": scalar("SELECT COUNT(*) AS count FROM waitlist WHERE status = 'WAITING'"),
            "reminder_count": scalar("SELECT COUNT(*) AS count FROM reminders"),
            "audit_event_count": scalar("SELECT COUNT(*) AS count FROM audit_events"),
        }


def waitlist_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "waitlist_id": row["waitlist_id"],
        "provider_id": row["provider_id"],
        "service_id": row["service_id"],
        "customer_id": row["customer_id"],
        "preferred_start": row["preferred_start"],
        "preferred_end": row["preferred_end"],
        "status": row["status"],
        "promoted_appointment_id": row["promoted_appointment_id"],
        "created_at": row["created_at"],
    }


class AppointmentHandler(BaseHTTPRequestHandler):
    store: AppointmentScheduler

    def log_message(self, format: str, *args: Any) -> None:
        return

    def send_json(self, status: HTTPStatus, body: Any) -> None:
        payload = json.dumps(body, indent=2, sort_keys=True).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self) -> dict[str, Any]:
        size = int(self.headers.get("Content-Length", "0"))
        return {} if size == 0 else json.loads(self.rfile.read(size).decode())

    def do_GET(self) -> None:
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            query = urllib.parse.parse_qs(parsed.query)
            if path == "/":
                self.send_html()
            elif path == "/health":
                self.send_json(HTTPStatus.OK, {"status": "ok"})
            elif path == "/snapshot":
                self.send_json(HTTPStatus.OK, self.store.snapshot())
            elif path == "/providers":
                self.send_json(HTTPStatus.OK, self.store.list_providers())
            elif path == "/services":
                self.send_json(HTTPStatus.OK, self.store.list_services())
            elif path == "/appointments":
                self.send_json(HTTPStatus.OK, self.store.list_appointments())
            elif path == "/waitlist":
                self.send_json(HTTPStatus.OK, self.store.list_waitlist())
            elif path == "/reminders":
                self.send_json(HTTPStatus.OK, self.store.list_reminders())
            elif path == "/audit":
                self.send_json(HTTPStatus.OK, self.store.list_audit())
            elif path == "/availability":
                self.send_json(
                    HTTPStatus.OK,
                    self.store.available_slots(
                        query["provider_id"][0],
                        query["service_id"][0],
                        int(query["date"][0]),
                    ),
                )
            elif path == "/utilization":
                self.send_json(
                    HTTPStatus.OK,
                    self.store.utilization(query["provider_id"][0], int(query["date"][0])),
                )
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except (KeyError, ValueError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def do_POST(self) -> None:
        try:
            path = urllib.parse.urlparse(self.path).path.rstrip("/") or "/"
            payload = self.read_json()
            actor = self.headers.get("X-Actor", "api")
            if path == "/providers":
                self.send_json(HTTPStatus.CREATED, self.store.upsert_provider(payload, actor=actor))
            elif path == "/services":
                self.send_json(HTTPStatus.CREATED, self.store.upsert_service(payload, actor=actor))
            elif path == "/customers":
                self.send_json(HTTPStatus.CREATED, self.store.upsert_customer(payload, actor=actor))
            elif path == "/holds":
                self.send_json(HTTPStatus.CREATED, self.store.create_hold(payload, actor=actor, timestamp=payload.get("timestamp")))
            elif path == "/appointments":
                self.send_json(HTTPStatus.CREATED, self.store.book_appointment(payload, actor=actor, timestamp=payload.get("timestamp")))
            elif path == "/waitlist":
                self.send_json(HTTPStatus.CREATED, self.store.add_waitlist(payload, actor=actor))
            elif path == "/reminders/generate":
                self.send_json(HTTPStatus.CREATED, self.store.generate_reminders(actor=actor, timestamp=payload.get("timestamp")))
            elif path.startswith("/appointments/") and path.endswith("/cancel"):
                self.send_json(HTTPStatus.OK, self.store.cancel(path.split("/")[2], actor=actor, timestamp=payload.get("timestamp")))
            elif path.startswith("/appointments/") and path.endswith("/reschedule"):
                self.send_json(HTTPStatus.OK, self.store.reschedule(path.split("/")[2], int(payload.get("start_at")), actor=actor, timestamp=payload.get("timestamp")))
            elif path.startswith("/appointments/") and path.endswith("/status"):
                self.send_json(HTTPStatus.OK, self.store.update_status(path.split("/")[2], payload.get("status"), actor=actor))
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def send_html(self) -> None:
        html = render_html(self.store.snapshot(), self.store.list_appointments(), self.store.list_waitlist(), self.store.list_reminders()[:8]).encode()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)


def render_html(snapshot: dict[str, Any], appointments: list[dict[str, Any]], waitlist: list[dict[str, Any]], reminders: list[dict[str, Any]]) -> str:
    def esc(value: Any) -> str:
        return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    appointment_rows = "\n".join(
        f"<tr><td>{esc(item['appointment_id'])}</td><td>{esc(item['provider']['name'])}</td><td>{esc(item['customer']['name'])}</td><td>{esc(item['status'])}</td></tr>"
        for item in appointments
    )
    wait_rows = "\n".join(
        f"<tr><td>{esc(item['waitlist_id'])}</td><td>{esc(item['service_id'])}</td><td>{esc(item['status'])}</td></tr>"
        for item in waitlist
    )
    reminder_rows = "\n".join(
        f"<tr><td>{esc(item['reminder_type'])}</td><td>{esc(item['channel'])}</td><td>{esc(item['appointment_id'])}</td></tr>"
        for item in reminders
    )
    booked = snapshot["appointment_status_counts"].get("BOOKED", 0)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Appointment Scheduling Reminder POC</title>
  <style>
    body {{ margin:0; font-family:Arial,sans-serif; color:#172033; background:#f7f9fc; }}
    header {{ background:#17404a; color:white; padding:28px 36px; }}
    main {{ max-width:1180px; margin:0 auto; padding:28px; }}
    h1 {{ margin:0 0 8px; font-size:30px; letter-spacing:0; }} h2 {{ margin:0 0 14px; font-size:18px; }}
    p {{ margin:0; color:#d7e7e9; }}
    .grid {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-bottom:22px; }}
    .metric,section {{ background:white; border:1px solid #dce5f2; border-radius:8px; padding:18px; }}
    .metric strong {{ display:block; font-size:28px; color:#0f172a; }} .metric span {{ color:#64748b; font-size:13px; }}
    .layout {{ display:grid; grid-template-columns:1.25fr 1fr; gap:18px; }}
    table {{ width:100%; border-collapse:collapse; font-size:14px; }}
    th,td {{ border-bottom:1px solid #e5e7eb; padding:10px 8px; text-align:left; vertical-align:top; }}
    th {{ color:#475569; font-size:12px; text-transform:uppercase; }}
    @media(max-width:820px) {{ .grid,.layout {{ grid-template-columns:1fr; }} main {{ padding:18px; }} }}
  </style>
</head>
<body>
  <header><h1>Appointment Scheduling Reminder POC</h1><p>Availability, holds, conflict-safe booking, waitlists, reminders, and utilization.</p></header>
  <main>
    <div class="grid">
      <div class="metric"><strong>{snapshot['provider_count']}</strong><span>providers</span></div>
      <div class="metric"><strong>{booked}</strong><span>booked appointments</span></div>
      <div class="metric"><strong>{snapshot['active_hold_count']}</strong><span>active holds</span></div>
      <div class="metric"><strong>{snapshot['waiting_count']}</strong><span>waitlist entries</span></div>
    </div>
    <div class="layout">
      <section><h2>Appointments</h2><table><thead><tr><th>Appointment</th><th>Provider</th><th>Customer</th><th>Status</th></tr></thead><tbody>{appointment_rows}</tbody></table></section>
      <section><h2>Waitlist</h2><table><thead><tr><th>Entry</th><th>Service</th><th>Status</th></tr></thead><tbody>{wait_rows}</tbody></table></section>
    </div>
    <section style="margin-top:18px"><h2>Recent Reminders</h2><table><thead><tr><th>Type</th><th>Channel</th><th>Appointment</th></tr></thead><tbody>{reminder_rows}</tbody></table></section>
  </main>
</body></html>"""


def run_demo(db_path: Path) -> None:
    store = AppointmentScheduler(db_path)
    try:
        store.seed_if_empty()
        seeded = store.get_appointment("appt-seeded")
        store.add_waitlist(
            {
                "provider_id": seeded["provider_id"],
                "service_id": seeded["service_id"],
                "customer_id": "cust-ben",
                "preferred_start": seeded["start_at"] - minutes(30),
                "preferred_end": seeded["start_at"] + minutes(30),
            },
            actor="demo",
        )
        canceled = store.cancel("appt-seeded", actor="demo")
        reminders = store.generate_reminders(actor="demo", timestamp=seeded["start_at"] - minutes(60))
        print(json.dumps({"canceled": canceled, "reminders": reminders, "snapshot": store.snapshot()}, indent=2, sort_keys=True))
    finally:
        store.close()


def serve(db_path: Path, host: str, port: int) -> None:
    store = AppointmentScheduler(db_path)
    store.seed_if_empty()
    AppointmentHandler.store = store
    server = HTTPServer((host, port), AppointmentHandler)
    print(f"Serving appointment scheduling reminder POC on http://{host}:{port}")
    try:
        server.serve_forever()
    finally:
        store.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Appointment scheduling reminder POC")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("demo")
    serve_parser = subparsers.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8175)
    args = parser.parse_args()
    if args.command == "demo":
        run_demo(args.db_path)
    else:
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
