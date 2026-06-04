#!/usr/bin/env python3
"""Subscription billing reminder POC.

This app models a practical recurring-billing workflow: customers, plans,
subscriptions, invoice generation, payment attempts, failed-payment dunning,
grace periods, cancellations, reminder notifications, and audit history. It
uses SQLite and Python's standard library so it runs locally without external
services.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import time
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
RUNTIME_DIR = ROOT / "runtime"
DEFAULT_DB_PATH = RUNTIME_DIR / "billing.db"

SUBSCRIPTION_STATUSES = {"TRIALING", "ACTIVE", "PAST_DUE", "GRACE_PERIOD", "CANCELED"}
INVOICE_STATUSES = {"OPEN", "PAID", "FAILED", "VOID"}
PAYMENT_RESULTS = {"SUCCEEDED", "FAILED"}
REMINDER_TYPES = {"TRIAL_ENDING", "RENEWAL_UPCOMING", "PAYMENT_FAILED", "GRACE_ENDING", "CANCELED"}


def now_ts() -> int:
    return int(time.time())


def days(value: int) -> int:
    return value * 24 * 60 * 60


def encode_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def decode_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)


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
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, slash, at, plus, or dash")
    return result


def optional_text(value: Any, max_len: int = 1000) -> str:
    if value is None:
        return ""
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"value must be at most {max_len} characters")
    return result


class SubscriptionBilling:
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
            CREATE TABLE IF NOT EXISTS customers (
                customer_id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                name TEXT NOT NULL,
                payment_behavior TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS plans (
                plan_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                price_cents INTEGER NOT NULL,
                interval_days INTEGER NOT NULL,
                trial_days INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
                subscription_id TEXT PRIMARY KEY,
                customer_id TEXT NOT NULL,
                plan_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                trial_ends_at INTEGER,
                current_period_end INTEGER NOT NULL,
                next_bill_at INTEGER NOT NULL,
                grace_ends_at INTEGER,
                dunning_count INTEGER NOT NULL,
                max_retries INTEGER NOT NULL,
                canceled_at INTEGER,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS invoices (
                invoice_id TEXT PRIMARY KEY,
                subscription_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                status TEXT NOT NULL,
                due_at INTEGER NOT NULL,
                paid_at INTEGER,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS payment_attempts (
                attempt_id TEXT PRIMARY KEY,
                invoice_id TEXT NOT NULL,
                result TEXT NOT NULL,
                message TEXT NOT NULL,
                attempted_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reminders (
                reminder_id TEXT PRIMARY KEY,
                subscription_id TEXT NOT NULL,
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
        count = self.conn.execute("SELECT COUNT(*) AS count FROM plans").fetchone()["count"]
        if count:
            return
        self.upsert_plan({"plan_id": "basic-monthly", "name": "Basic Monthly", "price_cents": 1200, "interval_days": 30, "trial_days": 14}, actor="seed")
        self.upsert_plan({"plan_id": "pro-monthly", "name": "Pro Monthly", "price_cents": 2900, "interval_days": 30, "trial_days": 7}, actor="seed")
        self.upsert_customer({"customer_id": "cust-ada", "email": "ada@example.com", "name": "Ada", "payment_behavior": "succeeds"}, actor="seed")
        self.upsert_customer({"customer_id": "cust-ben", "email": "ben@example.com", "name": "Ben", "payment_behavior": "fails"}, actor="seed")
        self.upsert_customer({"customer_id": "cust-cora", "email": "cora@example.com", "name": "Cora", "payment_behavior": "succeeds"}, actor="seed")
        base = now_ts()
        self.create_subscription(
            {
                "subscription_id": "sub-trial-ending",
                "customer_id": "cust-ada",
                "plan_id": "basic-monthly",
                "status": "TRIALING",
                "started_at": base - days(12),
                "trial_ends_at": base + days(2),
                "current_period_end": base + days(2),
                "next_bill_at": base + days(2),
            },
            actor="seed",
        )
        self.create_subscription(
            {
                "subscription_id": "sub-renewal-upcoming",
                "customer_id": "cust-cora",
                "plan_id": "pro-monthly",
                "status": "ACTIVE",
                "started_at": base - days(27),
                "current_period_end": base + days(3),
                "next_bill_at": base + days(3),
            },
            actor="seed",
        )
        self.create_subscription(
            {
                "subscription_id": "sub-past-due",
                "customer_id": "cust-ben",
                "plan_id": "pro-monthly",
                "status": "ACTIVE",
                "started_at": base - days(35),
                "current_period_end": base - days(5),
                "next_bill_at": base - days(5),
            },
            actor="seed",
        )

    def upsert_customer(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        behavior = str(payload.get("payment_behavior", "succeeds")).strip().lower()
        if behavior not in {"succeeds", "fails"}:
            raise ValueError("payment_behavior must be succeeds or fails")
        customer_id = token(payload.get("customer_id"), "customer_id")
        self.conn.execute(
            """
            INSERT INTO customers(customer_id, email, name, payment_behavior, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(customer_id) DO UPDATE SET
                email = excluded.email,
                name = excluded.name,
                payment_behavior = excluded.payment_behavior
            """,
            (
                customer_id,
                token(payload.get("email"), "email"),
                optional_text(payload.get("name"), 120),
                behavior,
                now_ts(),
            ),
        )
        self.conn.commit()
        self.audit(actor, "upsert_customer", customer_id, "Registered customer.")
        return self.get_customer(customer_id)

    def upsert_plan(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        plan_id = token(payload.get("plan_id"), "plan_id")
        price = int(payload.get("price_cents", 0))
        interval = int(payload.get("interval_days", 30))
        trial = int(payload.get("trial_days", 0))
        if price < 0 or interval < 1 or trial < 0:
            raise ValueError("price_cents must be non-negative, interval_days positive, trial_days non-negative")
        self.conn.execute(
            """
            INSERT INTO plans(plan_id, name, price_cents, interval_days, trial_days, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(plan_id) DO UPDATE SET
                name = excluded.name,
                price_cents = excluded.price_cents,
                interval_days = excluded.interval_days,
                trial_days = excluded.trial_days
            """,
            (plan_id, optional_text(payload.get("name"), 120), price, interval, trial, now_ts()),
        )
        self.conn.commit()
        self.audit(actor, "upsert_plan", plan_id, "Registered billing plan.")
        return self.get_plan(plan_id)

    def create_subscription(self, payload: dict[str, Any], actor: str = "api") -> dict[str, Any]:
        subscription_id = token(payload.get("subscription_id", make_id("sub")), "subscription_id")
        customer_id = token(payload.get("customer_id"), "customer_id")
        plan_id = token(payload.get("plan_id"), "plan_id")
        self.get_customer(customer_id)
        plan = self.get_plan(plan_id)
        status = str(payload.get("status", "TRIALING" if plan["trial_days"] else "ACTIVE")).strip().upper()
        if status not in SUBSCRIPTION_STATUSES:
            raise ValueError("invalid subscription status")
        started = int(payload.get("started_at", now_ts()))
        trial_ends = payload.get("trial_ends_at")
        if trial_ends is None and status == "TRIALING":
            trial_ends = started + days(plan["trial_days"])
        next_bill_at = int(payload.get("next_bill_at", trial_ends or started + days(plan["interval_days"])))
        current_period_end = int(payload.get("current_period_end", next_bill_at))
        self.conn.execute(
            """
            INSERT INTO subscriptions(
                subscription_id, customer_id, plan_id, status, started_at, trial_ends_at,
                current_period_end, next_bill_at, grace_ends_at, dunning_count,
                max_retries, canceled_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                subscription_id,
                customer_id,
                plan_id,
                status,
                started,
                int(trial_ends) if trial_ends else None,
                current_period_end,
                next_bill_at,
                payload.get("grace_ends_at"),
                int(payload.get("dunning_count", 0)),
                int(payload.get("max_retries", 3)),
                None,
                now_ts(),
            ),
        )
        self.conn.commit()
        self.audit(actor, "create_subscription", subscription_id, f"Created {status} subscription.")
        return self.get_subscription(subscription_id)

    def generate_invoices(self, horizon_days: int = 7, actor: str = "api", timestamp: int | None = None) -> list[dict[str, Any]]:
        run_at = int(timestamp or now_ts())
        horizon = run_at + days(horizon_days)
        rows = self.conn.execute(
            """
            SELECT * FROM subscriptions
            WHERE status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD')
            AND next_bill_at <= ?
            ORDER BY next_bill_at, subscription_id
            """,
            (horizon,),
        ).fetchall()
        invoices = []
        for row in rows:
            sub = subscription_from_row(row)
            existing = self.conn.execute(
                "SELECT invoice_id FROM invoices WHERE subscription_id = ? AND due_at = ?",
                (sub["subscription_id"], sub["next_bill_at"]),
            ).fetchone()
            if existing:
                invoices.append(self.get_invoice(existing["invoice_id"]))
                continue
            plan = self.get_plan(sub["plan_id"])
            invoice_id = make_id("inv")
            self.conn.execute(
                "INSERT INTO invoices(invoice_id, subscription_id, customer_id, amount_cents, status, due_at, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (invoice_id, sub["subscription_id"], sub["customer_id"], plan["price_cents"], "OPEN", sub["next_bill_at"], None, run_at),
            )
            self.conn.commit()
            self.audit(actor, "create_invoice", invoice_id, f"Created invoice for {sub['subscription_id']}.")
            invoices.append(self.get_invoice(invoice_id))
        return invoices

    def process_due_invoices(self, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        run_at = int(timestamp or now_ts())
        rows = self.conn.execute(
            "SELECT invoice_id FROM invoices WHERE status = 'OPEN' AND due_at <= ? ORDER BY due_at, invoice_id",
            (run_at,),
        ).fetchall()
        attempts = [self.attempt_payment(row["invoice_id"], actor=actor, timestamp=run_at) for row in rows]
        return {"processed_count": len(attempts), "attempts": attempts}

    def attempt_payment(self, invoice_id: str, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        invoice = self.get_invoice(token(invoice_id, "invoice_id"))
        if invoice["status"] == "PAID":
            raise ValueError("invoice is already paid")
        run_at = int(timestamp or now_ts())
        customer = self.get_customer(invoice["customer_id"])
        sub = self.get_subscription(invoice["subscription_id"])
        if customer["payment_behavior"] == "succeeds":
            result = "SUCCEEDED"
            message = "payment authorized"
            plan = self.get_plan(sub["plan_id"])
            next_bill = run_at + days(plan["interval_days"])
            self.conn.execute("UPDATE invoices SET status = 'PAID', paid_at = ? WHERE invoice_id = ?", (run_at, invoice_id))
            self.conn.execute(
                """
                UPDATE subscriptions
                SET status = 'ACTIVE', dunning_count = 0, grace_ends_at = NULL,
                    current_period_end = ?, next_bill_at = ?, updated_at = ?
                WHERE subscription_id = ?
                """,
                (next_bill, next_bill, run_at, sub["subscription_id"]),
            )
        else:
            result = "FAILED"
            message = "payment method declined"
            dunning_count = sub["dunning_count"] + 1
            if dunning_count >= sub["max_retries"]:
                status = "CANCELED"
                grace_ends_at = None
                canceled_at = run_at
                self.send_reminder(sub["subscription_id"], "CANCELED", actor=actor, timestamp=run_at)
            else:
                status = "GRACE_PERIOD" if dunning_count == 1 else "PAST_DUE"
                grace_ends_at = run_at + days(3)
                canceled_at = None
                self.send_reminder(sub["subscription_id"], "PAYMENT_FAILED", actor=actor, timestamp=run_at)
            self.conn.execute("UPDATE invoices SET status = 'FAILED' WHERE invoice_id = ?", (invoice_id,))
            self.conn.execute(
                """
                UPDATE subscriptions
                SET status = ?, dunning_count = ?, grace_ends_at = ?, canceled_at = ?, updated_at = ?
                WHERE subscription_id = ?
                """,
                (status, dunning_count, grace_ends_at, canceled_at, run_at, sub["subscription_id"]),
            )
        attempt_id = make_id("pay")
        self.conn.execute(
            "INSERT INTO payment_attempts(attempt_id, invoice_id, result, message, attempted_at) VALUES (?, ?, ?, ?, ?)",
            (attempt_id, invoice_id, result, message, run_at),
        )
        self.conn.commit()
        self.audit(actor, "payment_attempt", attempt_id, f"{result} for {invoice_id}.")
        return self.get_payment_attempt(attempt_id)

    def retry_failed_payments(self, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        rows = self.conn.execute(
            """
            SELECT invoice_id FROM invoices
            WHERE status = 'FAILED'
            AND subscription_id IN (SELECT subscription_id FROM subscriptions WHERE status IN ('PAST_DUE', 'GRACE_PERIOD'))
            ORDER BY due_at, invoice_id
            """
        ).fetchall()
        attempts = []
        for row in rows:
            self.conn.execute("UPDATE invoices SET status = 'OPEN' WHERE invoice_id = ?", (row["invoice_id"],))
            self.conn.commit()
            attempts.append(self.attempt_payment(row["invoice_id"], actor=actor, timestamp=timestamp))
        return {"retry_count": len(attempts), "attempts": attempts}

    def generate_reminders(self, actor: str = "api", timestamp: int | None = None) -> list[dict[str, Any]]:
        run_at = int(timestamp or now_ts())
        reminders = []
        for sub in self.list_subscriptions():
            if sub["status"] == "TRIALING" and sub["trial_ends_at"] and 0 <= sub["trial_ends_at"] - run_at <= days(3):
                reminders.append(self.send_reminder(sub["subscription_id"], "TRIAL_ENDING", actor=actor, timestamp=run_at))
            if sub["status"] == "ACTIVE" and 0 <= sub["next_bill_at"] - run_at <= days(5):
                reminders.append(self.send_reminder(sub["subscription_id"], "RENEWAL_UPCOMING", actor=actor, timestamp=run_at))
            if sub["status"] == "GRACE_PERIOD" and sub["grace_ends_at"] and 0 <= sub["grace_ends_at"] - run_at <= days(1):
                reminders.append(self.send_reminder(sub["subscription_id"], "GRACE_ENDING", actor=actor, timestamp=run_at))
        return reminders

    def send_reminder(self, subscription_id: str, reminder_type: str, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        reminder_type = str(reminder_type).strip().upper()
        if reminder_type not in REMINDER_TYPES:
            raise ValueError("invalid reminder type")
        sub = self.get_subscription(subscription_id)
        customer = self.get_customer(sub["customer_id"])
        sent_at = int(timestamp or now_ts())
        existing = self.conn.execute(
            "SELECT reminder_id FROM reminders WHERE subscription_id = ? AND reminder_type = ? AND sent_at = ?",
            (subscription_id, reminder_type, sent_at),
        ).fetchone()
        if existing:
            return self.get_reminder(existing["reminder_id"])
        messages = {
            "TRIAL_ENDING": "Your trial is ending soon.",
            "RENEWAL_UPCOMING": "Your subscription renews soon.",
            "PAYMENT_FAILED": "Your payment failed. Please update your payment method.",
            "GRACE_ENDING": "Your grace period is ending soon.",
            "CANCELED": "Your subscription has been canceled.",
        }
        reminder_id = make_id("rem")
        self.conn.execute(
            "INSERT INTO reminders(reminder_id, subscription_id, customer_id, reminder_type, channel, message, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (reminder_id, subscription_id, customer["customer_id"], reminder_type, "email", messages[reminder_type], sent_at),
        )
        self.conn.commit()
        self.audit(actor, "send_reminder", reminder_id, f"Sent {reminder_type} to {customer['email']}.")
        return self.get_reminder(reminder_id)

    def run_billing_cycle(self, actor: str = "api", timestamp: int | None = None) -> dict[str, Any]:
        run_at = int(timestamp or now_ts())
        invoices = self.generate_invoices(actor=actor, timestamp=run_at)
        attempts = self.process_due_invoices(actor=actor, timestamp=run_at)
        reminders = self.generate_reminders(actor=actor, timestamp=run_at)
        return {"invoices": invoices, "payment_attempts": attempts["attempts"], "reminders": reminders, "snapshot": self.snapshot()}

    def get_customer(self, customer_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM customers WHERE customer_id = ?", (customer_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown customer: {customer_id}")
        return dict(row)

    def get_plan(self, plan_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM plans WHERE plan_id = ?", (plan_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown plan: {plan_id}")
        return dict(row)

    def get_subscription(self, subscription_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM subscriptions WHERE subscription_id = ?", (subscription_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown subscription: {subscription_id}")
        sub = subscription_from_row(row)
        sub["customer"] = self.get_customer(sub["customer_id"])
        sub["plan"] = self.get_plan(sub["plan_id"])
        return sub

    def get_invoice(self, invoice_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM invoices WHERE invoice_id = ?", (invoice_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown invoice: {invoice_id}")
        return dict(row)

    def get_payment_attempt(self, attempt_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM payment_attempts WHERE attempt_id = ?", (attempt_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown payment attempt: {attempt_id}")
        return dict(row)

    def get_reminder(self, reminder_id: str) -> dict[str, Any]:
        row = self.conn.execute("SELECT * FROM reminders WHERE reminder_id = ?", (reminder_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown reminder: {reminder_id}")
        return dict(row)

    def list_customers(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.conn.execute("SELECT * FROM customers ORDER BY customer_id").fetchall()]

    def list_plans(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.conn.execute("SELECT * FROM plans ORDER BY plan_id").fetchall()]

    def list_subscriptions(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT subscription_id FROM subscriptions ORDER BY subscription_id").fetchall()
        return [self.get_subscription(row["subscription_id"]) for row in rows]

    def list_invoices(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.conn.execute("SELECT * FROM invoices ORDER BY created_at DESC, invoice_id DESC").fetchall()]

    def list_payment_attempts(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.conn.execute("SELECT * FROM payment_attempts ORDER BY attempted_at DESC, attempt_id DESC").fetchall()]

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

    def snapshot(self) -> dict[str, Any]:
        status_rows = self.conn.execute("SELECT status, COUNT(*) AS count FROM subscriptions GROUP BY status").fetchall()
        invoice_rows = self.conn.execute("SELECT status, COUNT(*) AS count FROM invoices GROUP BY status").fetchall()
        scalar = lambda sql: self.conn.execute(sql).fetchone()["count"]
        return {
            "customer_count": scalar("SELECT COUNT(*) AS count FROM customers"),
            "plan_count": scalar("SELECT COUNT(*) AS count FROM plans"),
            "subscription_status_counts": {row["status"]: row["count"] for row in status_rows},
            "invoice_status_counts": {row["status"]: row["count"] for row in invoice_rows},
            "reminder_count": scalar("SELECT COUNT(*) AS count FROM reminders"),
            "payment_attempt_count": scalar("SELECT COUNT(*) AS count FROM payment_attempts"),
            "audit_event_count": scalar("SELECT COUNT(*) AS count FROM audit_events"),
        }


def subscription_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "subscription_id": row["subscription_id"],
        "customer_id": row["customer_id"],
        "plan_id": row["plan_id"],
        "status": row["status"],
        "started_at": row["started_at"],
        "trial_ends_at": row["trial_ends_at"],
        "current_period_end": row["current_period_end"],
        "next_bill_at": row["next_bill_at"],
        "grace_ends_at": row["grace_ends_at"],
        "dunning_count": row["dunning_count"],
        "max_retries": row["max_retries"],
        "canceled_at": row["canceled_at"],
        "updated_at": row["updated_at"],
    }


class BillingHandler(BaseHTTPRequestHandler):
    store: SubscriptionBilling

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
        if size == 0:
            return {}
        return json.loads(self.rfile.read(size).decode())

    def do_GET(self) -> None:
        try:
            path = urllib.parse.urlparse(self.path).path.rstrip("/") or "/"
            if path == "/":
                self.send_html()
            elif path == "/health":
                self.send_json(HTTPStatus.OK, {"status": "ok"})
            elif path == "/snapshot":
                self.send_json(HTTPStatus.OK, self.store.snapshot())
            elif path == "/customers":
                self.send_json(HTTPStatus.OK, self.store.list_customers())
            elif path == "/plans":
                self.send_json(HTTPStatus.OK, self.store.list_plans())
            elif path == "/subscriptions":
                self.send_json(HTTPStatus.OK, self.store.list_subscriptions())
            elif path == "/invoices":
                self.send_json(HTTPStatus.OK, self.store.list_invoices())
            elif path == "/payments":
                self.send_json(HTTPStatus.OK, self.store.list_payment_attempts())
            elif path == "/reminders":
                self.send_json(HTTPStatus.OK, self.store.list_reminders())
            elif path == "/audit":
                self.send_json(HTTPStatus.OK, self.store.list_audit())
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except ValueError as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def do_POST(self) -> None:
        try:
            path = urllib.parse.urlparse(self.path).path.rstrip("/") or "/"
            payload = self.read_json()
            actor = self.headers.get("X-Actor", "api")
            if path == "/customers":
                self.send_json(HTTPStatus.CREATED, self.store.upsert_customer(payload, actor=actor))
            elif path == "/plans":
                self.send_json(HTTPStatus.CREATED, self.store.upsert_plan(payload, actor=actor))
            elif path == "/subscriptions":
                self.send_json(HTTPStatus.CREATED, self.store.create_subscription(payload, actor=actor))
            elif path == "/invoices/generate":
                self.send_json(HTTPStatus.CREATED, self.store.generate_invoices(payload.get("horizon_days", 7), actor=actor, timestamp=payload.get("timestamp")))
            elif path == "/billing/run":
                self.send_json(HTTPStatus.OK, self.store.run_billing_cycle(actor=actor, timestamp=payload.get("timestamp")))
            elif path == "/payments/retry":
                self.send_json(HTTPStatus.OK, self.store.retry_failed_payments(actor=actor, timestamp=payload.get("timestamp")))
            elif path == "/reminders/generate":
                self.send_json(HTTPStatus.CREATED, self.store.generate_reminders(actor=actor, timestamp=payload.get("timestamp")))
            else:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except (json.JSONDecodeError, ValueError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

    def send_html(self) -> None:
        html = render_html(self.store.snapshot(), self.store.list_subscriptions(), self.store.list_invoices()[:8], self.store.list_reminders()[:8]).encode()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)


def render_html(snapshot: dict[str, Any], subscriptions: list[dict[str, Any]], invoices: list[dict[str, Any]], reminders: list[dict[str, Any]]) -> str:
    def esc(value: Any) -> str:
        return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    sub_rows = "\n".join(
        f"<tr><td>{esc(sub['subscription_id'])}</td><td>{esc(sub['customer']['email'])}</td><td>{esc(sub['status'])}</td><td>{esc(sub['dunning_count'])}</td></tr>"
        for sub in subscriptions
    )
    invoice_rows = "\n".join(
        f"<tr><td>{esc(inv['invoice_id'])}</td><td>{esc(inv['status'])}</td><td>${inv['amount_cents'] / 100:.2f}</td><td>{esc(inv['subscription_id'])}</td></tr>"
        for inv in invoices
    )
    reminder_rows = "\n".join(
        f"<tr><td>{esc(rem['reminder_type'])}</td><td>{esc(rem['channel'])}</td><td>{esc(rem['subscription_id'])}</td></tr>"
        for rem in reminders
    )
    at_risk = snapshot["subscription_status_counts"].get("PAST_DUE", 0) + snapshot["subscription_status_counts"].get("GRACE_PERIOD", 0)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Subscription Billing Reminder POC</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; color: #172033; background: #f7f9fc; }}
    header {{ background: #213047; color: white; padding: 28px 36px; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 28px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }}
    h2 {{ margin: 0 0 14px; font-size: 18px; }}
    p {{ margin: 0; color: #d9e2ef; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 22px; }}
    .metric, section {{ background: white; border: 1px solid #dce5f2; border-radius: 8px; padding: 18px; }}
    .metric strong {{ display: block; font-size: 28px; color: #0f172a; }}
    .metric span {{ color: #64748b; font-size: 13px; }}
    .layout {{ display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; vertical-align: top; }}
    th {{ color: #475569; font-size: 12px; text-transform: uppercase; }}
    @media (max-width: 820px) {{ .grid, .layout {{ grid-template-columns: 1fr; }} main {{ padding: 18px; }} }}
  </style>
</head>
<body>
  <header>
    <h1>Subscription Billing Reminder POC</h1>
    <p>Recurring invoices, payment attempts, dunning reminders, grace periods, cancellations, and audit history.</p>
  </header>
  <main>
    <div class="grid">
      <div class="metric"><strong>{snapshot['customer_count']}</strong><span>customers</span></div>
      <div class="metric"><strong>{len(subscriptions)}</strong><span>subscriptions</span></div>
      <div class="metric"><strong>{at_risk}</strong><span>past due or grace</span></div>
      <div class="metric"><strong>{snapshot['reminder_count']}</strong><span>reminders sent</span></div>
    </div>
    <div class="layout">
      <section>
        <h2>Subscriptions</h2>
        <table><thead><tr><th>Subscription</th><th>Customer</th><th>Status</th><th>Dunning</th></tr></thead><tbody>{sub_rows}</tbody></table>
      </section>
      <section>
        <h2>Invoices</h2>
        <table><thead><tr><th>Invoice</th><th>Status</th><th>Amount</th><th>Subscription</th></tr></thead><tbody>{invoice_rows}</tbody></table>
      </section>
    </div>
    <section style="margin-top:18px">
      <h2>Recent Reminders</h2>
      <table><thead><tr><th>Type</th><th>Channel</th><th>Subscription</th></tr></thead><tbody>{reminder_rows}</tbody></table>
    </section>
  </main>
</body>
</html>"""


def run_demo(db_path: Path) -> None:
    store = SubscriptionBilling(db_path)
    try:
        store.seed_if_empty()
        billing = store.run_billing_cycle(actor="demo")
        retry_one = store.retry_failed_payments(actor="demo")
        retry_two = store.retry_failed_payments(actor="demo")
        print(json.dumps({"billing": billing, "retry_one": retry_one, "retry_two": retry_two, "snapshot": store.snapshot()}, indent=2, sort_keys=True))
    finally:
        store.close()


def serve(db_path: Path, host: str, port: int) -> None:
    store = SubscriptionBilling(db_path)
    store.seed_if_empty()
    BillingHandler.store = store
    server = HTTPServer((host, port), BillingHandler)
    print(f"Serving subscription billing reminder POC on http://{host}:{port}")
    try:
        server.serve_forever()
    finally:
        store.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Subscription billing reminder POC")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("demo")
    serve_parser = subparsers.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8174)
    args = parser.parse_args()
    if args.command == "demo":
        run_demo(args.db_path)
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
