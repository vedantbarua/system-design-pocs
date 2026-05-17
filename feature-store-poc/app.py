#!/usr/bin/env python3
"""Python feature store POC.

This app models a compact ML feature platform: raw events, offline feature
materialization, online serving, freshness checks, training-set generation, and
offline/online skew detection. It uses only the Python standard library.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
import urllib.parse
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
RUNTIME_DIR = ROOT / "runtime"
DEFAULT_DB_PATH = RUNTIME_DIR / "feature_store.db"
ONLINE_TTL_SECONDS = 15 * 60
FEATURE_NAMES = (
    "user_7d_purchase_count",
    "user_30d_spend",
    "last_seen_category",
    "account_age_days",
)


def now_ts() -> int:
    return int(time.time())


def parse_ts(value: Any | None, fallback: int | None = None) -> int:
    if value in (None, ""):
        return now_ts() if fallback is None else fallback
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("timestamp fields must be integer Unix seconds") from exc


def json_dumps(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def decode_payload(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")
    return payload


def number(value: Any, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("numeric payload fields must be numbers") from exc


def non_empty(value: Any, field: str, max_len: int = 80) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    return result


@dataclass(frozen=True)
class FeatureRow:
    user_id: str
    feature_name: str
    feature_value: str
    as_of_ts: int
    computed_at: int
    source: str


class FeatureStore:
    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH, ttl_seconds: int = ONLINE_TTL_SECONDS) -> None:
        self.db_path = Path(db_path)
        self.ttl_seconds = ttl_seconds
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.init_schema()

    def close(self) -> None:
        self.conn.close()

    def init_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS raw_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                user_id TEXT NOT NULL,
                event_ts INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                ingested_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS offline_features (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                feature_name TEXT NOT NULL,
                feature_value TEXT NOT NULL,
                as_of_ts INTEGER NOT NULL,
                computed_at INTEGER NOT NULL,
                source TEXT NOT NULL,
                UNIQUE(user_id, feature_name, as_of_ts, source)
            );

            CREATE TABLE IF NOT EXISTS online_features (
                user_id TEXT NOT NULL,
                feature_name TEXT NOT NULL,
                feature_value TEXT NOT NULL,
                computed_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                source TEXT NOT NULL,
                PRIMARY KEY(user_id, feature_name)
            );

            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                message TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def seed_if_empty(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) AS count FROM raw_events").fetchone()["count"]
        if count:
            return
        base = now_ts() - 40 * 24 * 3600
        self.ingest_event(
            {
                "event_type": "profile_update",
                "user_id": "user-1",
                "event_ts": base,
                "created_at": base,
                "category": "keyboards",
            },
            update_online=False,
        )
        self.ingest_event(
            {
                "event_type": "purchase",
                "user_id": "user-1",
                "event_ts": now_ts() - 3 * 24 * 3600,
                "amount": 119.0,
                "category": "keyboards",
            },
            update_online=False,
        )
        self.ingest_event(
            {
                "event_type": "page_view",
                "user_id": "user-1",
                "event_ts": now_ts() - 1 * 24 * 3600,
                "category": "mice",
            },
            update_online=False,
        )
        self.ingest_event(
            {
                "event_type": "profile_update",
                "user_id": "user-2",
                "event_ts": base + 10 * 24 * 3600,
                "created_at": base + 10 * 24 * 3600,
                "category": "monitors",
            },
            update_online=False,
        )
        self.ingest_event(
            {
                "event_type": "purchase",
                "user_id": "user-2",
                "event_ts": now_ts() - 20 * 24 * 3600,
                "amount": 299.99,
                "category": "monitors",
            },
            update_online=False,
        )
        self.backfill()
        self.record("seed", "Loaded seed events and materialized baseline features.")

    def ingest_event(self, payload: dict[str, Any], update_online: bool = True) -> dict[str, Any]:
        event_type = non_empty(payload.get("event_type"), "event_type", 40)
        if event_type not in {"purchase", "page_view", "profile_update"}:
            raise ValueError("event_type must be purchase, page_view, or profile_update")
        user_id = non_empty(payload.get("user_id"), "user_id", 80)
        event_ts = parse_ts(payload.get("event_ts"))
        event_payload = self.normalize_payload(event_type, payload, event_ts)
        ingested_at = now_ts()
        cursor = self.conn.execute(
            """
            INSERT INTO raw_events(event_type, user_id, event_ts, payload_json, ingested_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (event_type, user_id, event_ts, json_dumps(event_payload), ingested_at),
        )
        self.conn.commit()
        if update_online:
            features = self.compute_features(user_id, event_ts)
            self.write_online_features(user_id, features, event_ts, "incremental")
            self.record("ingest", f"Ingested {event_type} for {user_id} and refreshed online features.")
        return {
            "event_id": cursor.lastrowid,
            "event_type": event_type,
            "user_id": user_id,
            "event_ts": event_ts,
            "payload": event_payload,
        }

    def normalize_payload(self, event_type: str, payload: dict[str, Any], event_ts: int) -> dict[str, Any]:
        if event_type == "purchase":
            return {
                "amount": round(number(payload.get("amount")), 2),
                "category": non_empty(payload.get("category", "uncategorized"), "category", 60),
            }
        if event_type == "page_view":
            return {
                "category": non_empty(payload.get("category", "uncategorized"), "category", 60),
            }
        return {
            "created_at": parse_ts(payload.get("created_at"), fallback=event_ts),
            "category": non_empty(payload.get("category", "unknown"), "category", 60),
        }

    def compute_features(self, user_id: str, as_of_ts: int) -> dict[str, Any]:
        rows = self.conn.execute(
            """
            SELECT event_type, event_ts, payload_json
            FROM raw_events
            WHERE user_id = ? AND event_ts <= ?
            ORDER BY event_ts ASC, id ASC
            """,
            (user_id, as_of_ts),
        ).fetchall()
        seven_days_ago = as_of_ts - 7 * 24 * 3600
        thirty_days_ago = as_of_ts - 30 * 24 * 3600
        purchase_count_7d = 0
        spend_30d = 0.0
        last_seen_category = "unknown"
        created_at: int | None = None

        for row in rows:
            payload = decode_payload(row["payload_json"])
            event_ts = int(row["event_ts"])
            if "category" in payload:
                last_seen_category = str(payload["category"])
            if row["event_type"] == "purchase":
                if event_ts >= seven_days_ago:
                    purchase_count_7d += 1
                if event_ts >= thirty_days_ago:
                    spend_30d += number(payload.get("amount"))
            elif row["event_type"] == "profile_update":
                created_at = int(payload.get("created_at", event_ts)) if created_at is None else min(created_at, int(payload.get("created_at", event_ts)))

        account_age_days = 0 if created_at is None else max(0, int((as_of_ts - created_at) // 86400))
        return {
            "user_7d_purchase_count": purchase_count_7d,
            "user_30d_spend": round(spend_30d, 2),
            "last_seen_category": last_seen_category,
            "account_age_days": account_age_days,
        }

    def backfill(self, as_of_ts: int | None = None) -> dict[str, Any]:
        resolved_as_of = now_ts() if as_of_ts is None else parse_ts(as_of_ts)
        users = self.user_ids()
        written = 0
        computed_at = now_ts()
        for user_id in users:
            features = self.compute_features(user_id, resolved_as_of)
            for name, value in features.items():
                self.conn.execute(
                    """
                    INSERT OR REPLACE INTO offline_features(user_id, feature_name, feature_value, as_of_ts, computed_at, source)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, name, str(value), resolved_as_of, computed_at, "backfill"),
                )
                written += 1
            self.write_online_features(user_id, features, resolved_as_of, "backfill", commit=False)
        self.conn.commit()
        self.record("backfill", f"Backfilled {written} feature values for {len(users)} users.")
        return {"as_of_ts": resolved_as_of, "users": len(users), "feature_values": written}

    def write_online_features(
        self,
        user_id: str,
        features: dict[str, Any],
        as_of_ts: int,
        source: str,
        commit: bool = True,
    ) -> None:
        computed_at = now_ts()
        expires_at = computed_at + self.ttl_seconds
        for name, value in features.items():
            self.conn.execute(
                """
                INSERT OR REPLACE INTO online_features(user_id, feature_name, feature_value, computed_at, expires_at, source)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, name, str(value), computed_at, expires_at, source),
            )
            self.conn.execute(
                """
                INSERT OR REPLACE INTO offline_features(user_id, feature_name, feature_value, as_of_ts, computed_at, source)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, name, str(value), as_of_ts, computed_at, source),
            )
        if commit:
            self.conn.commit()

    def online_features(self, user_id: str) -> dict[str, Any]:
        resolved_user = non_empty(user_id, "user_id", 80)
        rows = self.conn.execute(
            """
            SELECT feature_name, feature_value, computed_at, expires_at, source
            FROM online_features
            WHERE user_id = ?
            ORDER BY feature_name
            """,
            (resolved_user,),
        ).fetchall()
        return {
            "user_id": resolved_user,
            "features": {row["feature_name"]: coerce_feature(row["feature_name"], row["feature_value"]) for row in rows},
            "metadata": {
                row["feature_name"]: {
                    "computed_at": row["computed_at"],
                    "expires_at": row["expires_at"],
                    "source": row["source"],
                    "stale": row["expires_at"] < now_ts(),
                }
                for row in rows
            },
        }

    def training_set(self, labels: list[dict[str, Any]]) -> dict[str, Any]:
        rows = []
        for label in labels:
            user_id = non_empty(label.get("user_id"), "user_id", 80)
            label_ts = parse_ts(label.get("label_ts"))
            features = self.compute_features(user_id, label_ts)
            rows.append(
                {
                    "user_id": user_id,
                    "label_ts": label_ts,
                    "label": label.get("label"),
                    "features": features,
                }
            )
        self.record("training_set", f"Generated point-in-time training set with {len(rows)} rows.")
        return {"rows": rows, "row_count": len(rows)}

    def freshness(self) -> dict[str, Any]:
        current = now_ts()
        rows = self.conn.execute(
            """
            SELECT user_id, feature_name, computed_at, expires_at, source
            FROM online_features
            ORDER BY user_id, feature_name
            """
        ).fetchall()
        stale = [dict(row) | {"stale": row["expires_at"] < current} for row in rows]
        return {
            "online_feature_count": len(rows),
            "stale_feature_count": sum(1 for row in stale if row["stale"]),
            "ttl_seconds": self.ttl_seconds,
            "features": stale,
        }

    def skew_report(self) -> dict[str, Any]:
        mismatches = []
        for user_id in self.user_ids():
            online = self.online_features(user_id)["features"]
            latest_offline = self.latest_offline_features(user_id)
            for feature_name in FEATURE_NAMES:
                if str(online.get(feature_name)) != str(latest_offline.get(feature_name)):
                    mismatches.append(
                        {
                            "user_id": user_id,
                            "feature_name": feature_name,
                            "online": online.get(feature_name),
                            "offline": latest_offline.get(feature_name),
                        }
                    )
        return {"mismatch_count": len(mismatches), "mismatches": mismatches}

    def latest_offline_features(self, user_id: str) -> dict[str, Any]:
        rows = self.conn.execute(
            """
            SELECT feature_name, feature_value
            FROM offline_features f
            WHERE user_id = ?
              AND as_of_ts = (
                SELECT MAX(as_of_ts)
                FROM offline_features
                WHERE user_id = f.user_id AND feature_name = f.feature_name
              )
            ORDER BY feature_name
            """,
            (user_id,),
        ).fetchall()
        return {row["feature_name"]: coerce_feature(row["feature_name"], row["feature_value"]) for row in rows}

    def snapshot(self) -> dict[str, Any]:
        raw_event_count = self.conn.execute("SELECT COUNT(*) AS count FROM raw_events").fetchone()["count"]
        offline_count = self.conn.execute("SELECT COUNT(*) AS count FROM offline_features").fetchone()["count"]
        online_count = self.conn.execute("SELECT COUNT(*) AS count FROM online_features").fetchone()["count"]
        users = self.user_ids()
        return {
            "users": users,
            "raw_event_count": raw_event_count,
            "offline_feature_count": offline_count,
            "online_feature_count": online_count,
            "freshness": self.freshness(),
            "skew": self.skew_report(),
            "recent_events": self.recent_audit_events(),
            "recent_raw_events": self.recent_raw_events(),
            "online_features": [self.online_features(user_id) for user_id in users],
        }

    def user_ids(self) -> list[str]:
        rows = self.conn.execute("SELECT DISTINCT user_id FROM raw_events ORDER BY user_id").fetchall()
        return [row["user_id"] for row in rows]

    def recent_raw_events(self, limit: int = 12) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT id, event_type, user_id, event_ts, payload_json, ingested_at
            FROM raw_events
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [
            {
                "id": row["id"],
                "event_type": row["event_type"],
                "user_id": row["user_id"],
                "event_ts": row["event_ts"],
                "payload": decode_payload(row["payload_json"]),
                "ingested_at": row["ingested_at"],
            }
            for row in rows
        ]

    def record(self, event_type: str, message: str) -> None:
        self.conn.execute(
            "INSERT INTO audit_events(created_at, event_type, message) VALUES (?, ?, ?)",
            (now_ts(), event_type, message),
        )
        self.conn.commit()

    def recent_audit_events(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT created_at, event_type, message
            FROM audit_events
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def coerce_feature(feature_name: str, value: str) -> Any:
    if feature_name in {"user_7d_purchase_count", "account_age_days"}:
        return int(float(value))
    if feature_name == "user_30d_spend":
        return round(float(value), 2)
    return value


def build_html(snapshot: dict[str, Any]) -> str:
    freshness = snapshot["freshness"]
    skew = snapshot["skew"]
    online_sections = []
    for user in snapshot["online_features"]:
        feature_rows = "".join(
            f"<tr><td>{name}</td><td>{value}</td><td>{user['metadata'].get(name, {}).get('source', '')}</td></tr>"
            for name, value in user["features"].items()
        )
        online_sections.append(
            f"""
            <section class="card">
              <h3>{user['user_id']}</h3>
              <table><thead><tr><th>Feature</th><th>Value</th><th>Source</th></tr></thead><tbody>{feature_rows}</tbody></table>
            </section>
            """
        )
    raw_rows = "".join(
        f"<tr><td>{event['id']}</td><td>{event['event_type']}</td><td>{event['user_id']}</td><td>{event['event_ts']}</td><td><code>{json_dumps(event['payload'])}</code></td></tr>"
        for event in snapshot["recent_raw_events"]
    )
    audit_rows = "".join(
        f"<li><strong>{event['event_type']}</strong> {event['message']}</li>"
        for event in snapshot["recent_events"]
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Feature Store POC</title>
  <style>
    body {{ margin: 0; background: #eef2f7; color: #172033; font-family: Inter, Segoe UI, sans-serif; }}
    main {{ max-width: 1400px; margin: 0 auto; padding: 28px 20px 56px; }}
    h1, h2, h3 {{ margin: 0; }}
    p {{ color: #5a6475; }}
    .stats, .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }}
    .card {{ background: white; border: 1px solid #d9dee8; border-radius: 8px; padding: 18px; box-shadow: 0 16px 42px rgba(23, 32, 51, .07); }}
    .stat strong {{ display: block; font-size: 28px; margin-top: 6px; }}
    .stat span {{ color: #5a6475; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }}
    form {{ display: grid; gap: 10px; }}
    input, select, textarea {{ width: 100%; padding: 10px; border: 1px solid #c8d0dd; border-radius: 6px; font: inherit; box-sizing: border-box; }}
    button {{ border: 0; border-radius: 6px; background: #1f6f5b; color: white; padding: 10px 12px; font-weight: 800; cursor: pointer; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
    th, td {{ border-bottom: 1px solid #d9dee8; padding: 8px 6px; text-align: left; vertical-align: top; }}
    th {{ color: #5a6475; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }}
    code {{ font-family: SFMono-Regular, Consolas, monospace; font-size: 12px; }}
    .section {{ margin-top: 18px; }}
  </style>
</head>
<body>
<main>
  <h1>Feature Store POC</h1>
  <p>Raw events, offline features, online serving, freshness, point-in-time training sets, and skew checks.</p>
  <section class="stats">
    <div class="card stat"><span>Users</span><strong>{len(snapshot['users'])}</strong></div>
    <div class="card stat"><span>Raw Events</span><strong>{snapshot['raw_event_count']}</strong></div>
    <div class="card stat"><span>Offline Values</span><strong>{snapshot['offline_feature_count']}</strong></div>
    <div class="card stat"><span>Stale Online Features</span><strong>{freshness['stale_feature_count']}</strong></div>
    <div class="card stat"><span>Skew Mismatches</span><strong>{skew['mismatch_count']}</strong></div>
  </section>
  <section class="grid section">
    <div class="card">
      <h2>Ingest Event</h2>
      <form method="post" action="/events/form">
        <select name="event_type"><option>purchase</option><option>page_view</option><option>profile_update</option></select>
        <input name="user_id" value="user-3" placeholder="user_id">
        <input name="category" value="headphones" placeholder="category">
        <input name="amount" value="79.99" placeholder="amount for purchases">
        <button type="submit">Ingest</button>
      </form>
    </div>
    <div class="card">
      <h2>Backfill</h2>
      <form method="post" action="/features/backfill/form"><button type="submit">Run Backfill</button></form>
    </div>
    <div class="card">
      <h2>API</h2>
      <p><code>GET /snapshot</code></p>
      <p><code>GET /features/online/user-1</code></p>
      <p><code>POST /training-set</code></p>
    </div>
  </section>
  <section class="grid section">{''.join(online_sections)}</section>
  <section class="card section">
    <h2>Recent Raw Events</h2>
    <table><thead><tr><th>ID</th><th>Type</th><th>User</th><th>Event TS</th><th>Payload</th></tr></thead><tbody>{raw_rows}</tbody></table>
  </section>
  <section class="card section">
    <h2>Audit Events</h2>
    <ol>{audit_rows}</ol>
  </section>
</main>
</body>
</html>"""


class FeatureStoreHandler(BaseHTTPRequestHandler):
    store: FeatureStore

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.respond_html(build_html(self.store.snapshot()))
            return
        if parsed.path == "/health":
            self.respond_json({"ok": True})
            return
        if parsed.path == "/snapshot":
            self.respond_json(self.store.snapshot())
            return
        if parsed.path == "/freshness":
            self.respond_json(self.store.freshness())
            return
        if parsed.path.startswith("/features/online/"):
            user_id = urllib.parse.unquote(parsed.path.rsplit("/", 1)[-1])
            self.respond_json(self.store.online_features(user_id))
            return
        self.respond_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        try:
            if parsed.path == "/events":
                self.respond_json(self.store.ingest_event(self.read_json()), HTTPStatus.CREATED)
                return
            if parsed.path == "/events/form":
                form = self.read_form()
                payload: dict[str, Any] = {
                    "event_type": form.get("event_type", ["purchase"])[0],
                    "user_id": form.get("user_id", [""])[0],
                    "category": form.get("category", ["uncategorized"])[0],
                }
                if payload["event_type"] == "purchase":
                    payload["amount"] = form.get("amount", ["0"])[0]
                self.store.ingest_event(payload)
                self.redirect("/")
                return
            if parsed.path == "/features/backfill":
                payload = self.read_json(required=False)
                self.respond_json(self.store.backfill(payload.get("as_of_ts") if payload else None))
                return
            if parsed.path == "/features/backfill/form":
                self.store.backfill()
                self.redirect("/")
                return
            if parsed.path == "/training-set":
                payload = self.read_json()
                labels = payload.get("labels", [])
                if not isinstance(labels, list):
                    raise ValueError("labels must be a list")
                self.respond_json(self.store.training_set(labels))
                return
            self.respond_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self.respond_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def read_json(self, required: bool = True) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            if required:
                raise ValueError("JSON body is required")
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("JSON body must be an object")
        return payload

    def read_form(self) -> dict[str, list[str]]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        return urllib.parse.parse_qs(raw)

    def respond_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        raw = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def respond_html(self, html: str) -> None:
        raw = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def redirect(self, location: str) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        return


def serve(args: argparse.Namespace) -> None:
    store = FeatureStore(Path(args.db_path), ttl_seconds=args.ttl_seconds)
    store.seed_if_empty()
    FeatureStoreHandler.store = store
    server = HTTPServer((args.host, args.port), FeatureStoreHandler)
    print(f"Feature Store POC running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")
    finally:
        server.server_close()
        store.close()


def demo(args: argparse.Namespace) -> None:
    store = FeatureStore(Path(args.db_path), ttl_seconds=args.ttl_seconds)
    store.seed_if_empty()
    event = store.ingest_event(
        {
            "event_type": "purchase",
            "user_id": "user-1",
            "amount": 49.99,
            "category": "cables",
        }
    )
    labels = [{"user_id": "user-1", "label_ts": now_ts(), "label": "converted"}]
    print(json.dumps({"event": event, "online": store.online_features("user-1"), "training_set": store.training_set(labels)}, indent=2))
    store.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Feature Store POC")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH))
    parser.add_argument("--ttl-seconds", type=int, default=ONLINE_TTL_SECONDS)
    sub = parser.add_subparsers(dest="command", required=True)
    serve_parser = sub.add_parser("serve")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8160)
    serve_parser.set_defaults(func=serve)
    demo_parser = sub.add_parser("demo")
    demo_parser.set_defaults(func=demo)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
