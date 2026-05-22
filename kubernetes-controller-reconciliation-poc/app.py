#!/usr/bin/env python3
"""Kubernetes-style controller reconciliation POC.

This app models a control loop that converges observed pod state toward desired
deployment state. It includes replica reconciliation, rolling updates, crash
backoff, horizontal autoscaling, and an event log that explains every action.
"""

from __future__ import annotations

import argparse
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
DEFAULT_DB_PATH = RUNTIME_DIR / "controller.db"
POD_STATES = {"Pending", "Running", "Failed", "Terminating"}


def now_ts() -> int:
    return int(time.time())


def encode_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def decode_json(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    return json.loads(value)


def name_token(value: Any, field: str, max_len: int = 120) -> str:
    if value is None or not str(value).strip():
        raise ValueError(f"{field} is required")
    result = str(value).strip()
    if len(result) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    if not re.fullmatch(r"[A-Za-z0-9._:/-]+", result):
        raise ValueError(f"{field} must use letters, numbers, dot, underscore, colon, slash, or dash")
    return result


def clamp_int(value: Any, field: str, minimum: int, maximum: int) -> int:
    result = int(value)
    if result < minimum or result > maximum:
        raise ValueError(f"{field} must be between {minimum} and {maximum}")
    return result


def metadata(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("metadata must be an object")
    return value


class ReconciliationController:
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
            CREATE TABLE IF NOT EXISTS deployments (
                name TEXT PRIMARY KEY,
                desired_replicas INTEGER NOT NULL,
                image TEXT NOT NULL,
                target_cpu INTEGER NOT NULL,
                min_replicas INTEGER NOT NULL,
                max_replicas INTEGER NOT NULL,
                max_surge INTEGER NOT NULL,
                max_unavailable INTEGER NOT NULL,
                generation INTEGER NOT NULL,
                load INTEGER NOT NULL,
                metadata_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pods (
                pod_id TEXT PRIMARY KEY,
                deployment TEXT NOT NULL,
                image TEXT NOT NULL,
                state TEXT NOT NULL,
                cpu INTEGER NOT NULL,
                restart_count INTEGER NOT NULL,
                backoff_until INTEGER NOT NULL,
                generation INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                deployment TEXT NOT NULL,
                reason TEXT NOT NULL,
                message TEXT NOT NULL
            );
            """
        )
        self.conn.commit()

    def seed_if_empty(self) -> None:
        count = self.conn.execute("SELECT COUNT(*) AS count FROM deployments").fetchone()["count"]
        if count:
            return
        self.upsert_deployment(
            {
                "name": "checkout",
                "desired_replicas": 3,
                "image": "checkout:v1",
                "target_cpu": 60,
                "min_replicas": 2,
                "max_replicas": 6,
                "max_surge": 1,
                "max_unavailable": 1,
                "load": 55,
                "metadata": {"owner": "orders", "tier": "frontend"},
            }
        )
        self.upsert_deployment(
            {
                "name": "payments",
                "desired_replicas": 2,
                "image": "payments:v1",
                "target_cpu": 50,
                "min_replicas": 1,
                "max_replicas": 4,
                "max_surge": 1,
                "max_unavailable": 1,
                "load": 40,
                "metadata": {"owner": "billing", "tier": "backend"},
            }
        )
        self.reconcile_all()

    def upsert_deployment(self, payload: dict[str, Any]) -> dict[str, Any]:
        name = name_token(payload.get("name"), "name")
        existing = self.deployment_row(name, required=False)
        generation = int(existing["generation"]) if existing else 1
        image = name_token(payload.get("image", existing["image"] if existing else None), "image", 160)
        if existing and image != existing["image"]:
            generation += 1
        desired = clamp_int(
            payload.get("desired_replicas", existing["desired_replicas"] if existing else 1),
            "desired_replicas",
            0,
            100,
        )
        min_replicas = clamp_int(payload.get("min_replicas", existing["min_replicas"] if existing else 1), "min_replicas", 0, 100)
        max_replicas = clamp_int(payload.get("max_replicas", existing["max_replicas"] if existing else 10), "max_replicas", 1, 100)
        if min_replicas > max_replicas:
            raise ValueError("min_replicas cannot exceed max_replicas")
        desired = max(min_replicas, min(max_replicas, desired))
        row = {
            "name": name,
            "desired_replicas": desired,
            "image": image,
            "target_cpu": clamp_int(payload.get("target_cpu", existing["target_cpu"] if existing else 60), "target_cpu", 1, 100),
            "min_replicas": min_replicas,
            "max_replicas": max_replicas,
            "max_surge": clamp_int(payload.get("max_surge", existing["max_surge"] if existing else 1), "max_surge", 0, 20),
            "max_unavailable": clamp_int(
                payload.get("max_unavailable", existing["max_unavailable"] if existing else 1), "max_unavailable", 0, 20
            ),
            "generation": generation,
            "load": clamp_int(payload.get("load", existing["load"] if existing else 0), "load", 0, 1000),
            "metadata": metadata(payload.get("metadata", decode_json(existing["metadata_json"], {}) if existing else {})),
        }
        self.conn.execute(
            """
            INSERT INTO deployments(
                name, desired_replicas, image, target_cpu, min_replicas, max_replicas,
                max_surge, max_unavailable, generation, load, metadata_json, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                desired_replicas = excluded.desired_replicas,
                image = excluded.image,
                target_cpu = excluded.target_cpu,
                min_replicas = excluded.min_replicas,
                max_replicas = excluded.max_replicas,
                max_surge = excluded.max_surge,
                max_unavailable = excluded.max_unavailable,
                generation = excluded.generation,
                load = excluded.load,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            """,
            (
                row["name"],
                row["desired_replicas"],
                row["image"],
                row["target_cpu"],
                row["min_replicas"],
                row["max_replicas"],
                row["max_surge"],
                row["max_unavailable"],
                row["generation"],
                row["load"],
                encode_json(row["metadata"]),
                now_ts(),
            ),
        )
        self.conn.commit()
        self.record_event(name, "DeploymentUpdated", f"Desired state set to {desired} replicas of {image}.")
        return self.get_deployment(name)

    def set_load(self, name: str, load: int) -> dict[str, Any]:
        name = name_token(name, "name")
        self.deployment_row(name)
        load = clamp_int(load, "load", 0, 1000)
        self.conn.execute("UPDATE deployments SET load = ?, updated_at = ? WHERE name = ?", (load, now_ts(), name))
        self.conn.commit()
        self.record_event(name, "LoadUpdated", f"Observed load changed to {load}.")
        return self.get_deployment(name)

    def set_pod_state(self, pod_id: str, state: str, cpu: int | None = None) -> dict[str, Any]:
        pod_id = name_token(pod_id, "pod_id")
        state = str(state).strip().title()
        if state not in POD_STATES:
            raise ValueError("state must be Pending, Running, Failed, or Terminating")
        pod = self.pod_row(pod_id)
        next_cpu = clamp_int(cpu if cpu is not None else pod["cpu"], "cpu", 0, 100)
        restart_count = pod["restart_count"] + 1 if state == "Failed" else pod["restart_count"]
        backoff_until = now_ts() + min(300, 5 * (2 ** max(0, restart_count - 1))) if state == "Failed" else pod["backoff_until"]
        self.conn.execute(
            """
            UPDATE pods
            SET state = ?, cpu = ?, restart_count = ?, backoff_until = ?, updated_at = ?
            WHERE pod_id = ?
            """,
            (state, next_cpu, restart_count, backoff_until, now_ts(), pod_id),
        )
        self.conn.commit()
        self.record_event(pod["deployment"], "PodStateChanged", f"{pod_id} moved to {state}.")
        return self.get_pod(pod_id)

    def reconcile_all(self) -> dict[str, Any]:
        decisions = [self.reconcile(row["name"]) for row in self.deployment_rows()]
        return {"reconciled": decisions, "snapshot": self.snapshot()}

    def reconcile(self, name: str) -> dict[str, Any]:
        deployment = self.get_deployment(name)
        actions: list[str] = []
        self.apply_autoscaling(deployment, actions)
        deployment = self.get_deployment(name)
        self.advance_pending_pods(deployment["name"], actions)
        self.replace_failed_pods(deployment, actions)
        self.apply_rolling_update(deployment, actions)
        deployment = self.get_deployment(name)
        self.match_replica_count(deployment, actions)
        summary = self.deployment_status(deployment["name"])
        if not actions:
            self.record_event(deployment["name"], "ReconcileNoop", "Observed state already matches desired state.")
        return {"deployment": deployment["name"], "actions": actions, "status": summary}

    def apply_autoscaling(self, deployment: dict[str, Any], actions: list[str]) -> None:
        running = self.running_pods(deployment["name"])
        if not running:
            return
        current = max(1, len(running))
        estimated_cpu = min(100, int(deployment["load"] / current))
        desired = deployment["desired_replicas"]
        next_desired = desired
        if estimated_cpu > deployment["target_cpu"] + 10 and desired < deployment["max_replicas"]:
            next_desired = desired + 1
        elif estimated_cpu < max(1, deployment["target_cpu"] - 25) and desired > deployment["min_replicas"]:
            next_desired = desired - 1
        if next_desired != desired:
            self.conn.execute(
                "UPDATE deployments SET desired_replicas = ?, updated_at = ? WHERE name = ?",
                (next_desired, now_ts(), deployment["name"]),
            )
            self.conn.commit()
            message = f"HPA adjusted desired replicas from {desired} to {next_desired} at estimated CPU {estimated_cpu}%."
            actions.append(message)
            self.record_event(deployment["name"], "Autoscaled", message)

    def advance_pending_pods(self, deployment: str, actions: list[str]) -> None:
        for pod in self.pods_for(deployment):
            if pod["state"] == "Pending" and pod["backoff_until"] <= now_ts():
                self.conn.execute(
                    "UPDATE pods SET state = 'Running', cpu = ?, updated_at = ? WHERE pod_id = ?",
                    (30, now_ts(), pod["pod_id"]),
                )
                self.conn.commit()
                message = f"{pod['pod_id']} became Running."
                actions.append(message)
                self.record_event(deployment, "PodReady", message)

    def replace_failed_pods(self, deployment: dict[str, Any], actions: list[str]) -> None:
        for pod in self.pods_for(deployment["name"]):
            if pod["state"] != "Failed":
                continue
            if pod["backoff_until"] > now_ts():
                message = f"{pod['pod_id']} is waiting for restart backoff until {pod['backoff_until']}."
                actions.append(message)
                self.record_event(deployment["name"], "Backoff", message)
                continue
            self.delete_pod(pod["pod_id"], deployment["name"], "Replacing failed pod", actions)

    def apply_rolling_update(self, deployment: dict[str, Any], actions: list[str]) -> None:
        pods = self.active_pods(deployment["name"])
        old_pods = [pod for pod in pods if pod["image"] != deployment["image"]]
        if not old_pods:
            return
        desired = deployment["desired_replicas"]
        updated = [pod for pod in pods if pod["image"] == deployment["image"]]
        total_allowed = desired + deployment["max_surge"]
        unavailable = len([pod for pod in pods if pod["state"] != "Running"])

        while old_pods and len(pods) < total_allowed:
            self.create_pod(deployment, actions, reason="RollingUpdateCreate")
            pods = self.active_pods(deployment["name"])
            updated = [pod for pod in pods if pod["image"] == deployment["image"]]

        can_remove = max(0, deployment["max_unavailable"] - unavailable)
        if old_pods and can_remove > 0:
            self.delete_pod(old_pods[0]["pod_id"], deployment["name"], "Rolling update removed old image pod", actions)

    def match_replica_count(self, deployment: dict[str, Any], actions: list[str]) -> None:
        active = self.active_pods(deployment["name"])
        while len(active) < deployment["desired_replicas"]:
            self.create_pod(deployment, actions, reason="ReplicaCreate")
            active = self.active_pods(deployment["name"])
        while len(active) > deployment["desired_replicas"]:
            victim = self.pick_scale_down_pod(active, deployment["image"])
            self.delete_pod(victim["pod_id"], deployment["name"], "Replica scale down", actions)
            active = self.active_pods(deployment["name"])

    def create_pod(self, deployment: dict[str, Any], actions: list[str], reason: str) -> dict[str, Any]:
        ordinal = self.next_pod_ordinal(deployment["name"])
        pod_id = f"{deployment['name']}-{deployment['generation']}-{ordinal}"
        timestamp = now_ts()
        self.conn.execute(
            """
            INSERT INTO pods(
                pod_id, deployment, image, state, cpu, restart_count, backoff_until,
                generation, created_at, updated_at
            )
            VALUES (?, ?, ?, 'Pending', 0, 0, 0, ?, ?, ?)
            """,
            (pod_id, deployment["name"], deployment["image"], deployment["generation"], timestamp, timestamp),
        )
        self.conn.commit()
        message = f"Created {pod_id} for {deployment['image']}."
        actions.append(message)
        self.record_event(deployment["name"], reason, message)
        return self.get_pod(pod_id)

    def delete_pod(self, pod_id: str, deployment: str, reason: str, actions: list[str]) -> None:
        self.conn.execute("UPDATE pods SET state = 'Terminating', updated_at = ? WHERE pod_id = ?", (now_ts(), pod_id))
        self.conn.commit()
        message = f"Marked {pod_id} Terminating. {reason}."
        actions.append(message)
        self.record_event(deployment, "PodTerminating", message)

    def pick_scale_down_pod(self, pods: list[dict[str, Any]], desired_image: str) -> dict[str, Any]:
        return sorted(pods, key=lambda pod: (pod["image"] == desired_image, pod["state"] == "Running", pod["created_at"]))[0]

    def next_pod_ordinal(self, deployment: str) -> int:
        row = self.conn.execute("SELECT COUNT(*) AS count FROM pods WHERE deployment = ?", (deployment,)).fetchone()
        return int(row["count"]) + 1

    def deployment_status(self, name: str) -> dict[str, Any]:
        deployment = self.get_deployment(name)
        pods = self.pods_for(name)
        active = [pod for pod in pods if pod["state"] != "Terminating"]
        running = [pod for pod in active if pod["state"] == "Running"]
        updated = [pod for pod in active if pod["image"] == deployment["image"]]
        failed = [pod for pod in active if pod["state"] == "Failed"]
        return {
            "name": name,
            "desired_replicas": deployment["desired_replicas"],
            "active_replicas": len(active),
            "running_replicas": len(running),
            "updated_replicas": len(updated),
            "failed_replicas": len(failed),
            "available": len(running) >= deployment["desired_replicas"] and len(updated) >= deployment["desired_replicas"],
        }

    def record_event(self, deployment: str, reason: str, message: str) -> None:
        self.conn.execute(
            "INSERT INTO events(created_at, deployment, reason, message) VALUES (?, ?, ?, ?)",
            (now_ts(), deployment, reason, message),
        )
        self.conn.commit()

    def deployment_rows(self) -> list[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM deployments ORDER BY name").fetchall()

    def deployment_row(self, name: str, required: bool = True) -> sqlite3.Row | None:
        row = self.conn.execute("SELECT * FROM deployments WHERE name = ?", (name,)).fetchone()
        if required and not row:
            raise ValueError(f"unknown deployment: {name}")
        return row

    def pod_row(self, pod_id: str) -> sqlite3.Row:
        row = self.conn.execute("SELECT * FROM pods WHERE pod_id = ?", (pod_id,)).fetchone()
        if not row:
            raise ValueError(f"unknown pod: {pod_id}")
        return row

    def get_deployment(self, name: str) -> dict[str, Any]:
        return deployment_from_row(self.deployment_row(name_token(name, "name")))

    def get_pod(self, pod_id: str) -> dict[str, Any]:
        return pod_from_row(self.pod_row(pod_id))

    def list_deployments(self) -> list[dict[str, Any]]:
        return [deployment_from_row(row) | {"status": self.deployment_status(row["name"])} for row in self.deployment_rows()]

    def pods_for(self, deployment: str) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM pods WHERE deployment = ? ORDER BY created_at, pod_id", (deployment,)).fetchall()
        return [pod_from_row(row) for row in rows]

    def active_pods(self, deployment: str) -> list[dict[str, Any]]:
        return [pod for pod in self.pods_for(deployment) if pod["state"] != "Terminating"]

    def running_pods(self, deployment: str) -> list[dict[str, Any]]:
        return [pod for pod in self.pods_for(deployment) if pod["state"] == "Running"]

    def list_pods(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM pods ORDER BY deployment, created_at, pod_id").fetchall()
        return [pod_from_row(row) for row in rows]

    def recent_events(self, limit: int = 25) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM events ORDER BY event_id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [event_from_row(row) for row in rows]

    def snapshot(self) -> dict[str, Any]:
        deployments = self.list_deployments()
        pods = self.list_pods()
        return {
            "deployment_count": len(deployments),
            "pod_count": len(pods),
            "running_pod_count": len([pod for pod in pods if pod["state"] == "Running"]),
            "failed_pod_count": len([pod for pod in pods if pod["state"] == "Failed"]),
            "deployments": deployments,
            "pods": pods,
            "events": self.recent_events(),
        }


def deployment_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "name": row["name"],
        "desired_replicas": row["desired_replicas"],
        "image": row["image"],
        "target_cpu": row["target_cpu"],
        "min_replicas": row["min_replicas"],
        "max_replicas": row["max_replicas"],
        "max_surge": row["max_surge"],
        "max_unavailable": row["max_unavailable"],
        "generation": row["generation"],
        "load": row["load"],
        "metadata": decode_json(row["metadata_json"], {}),
        "updated_at": row["updated_at"],
    }


def pod_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "pod_id": row["pod_id"],
        "deployment": row["deployment"],
        "image": row["image"],
        "state": row["state"],
        "cpu": row["cpu"],
        "restart_count": row["restart_count"],
        "backoff_until": row["backoff_until"],
        "generation": row["generation"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def event_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "event_id": row["event_id"],
        "created_at": row["created_at"],
        "deployment": row["deployment"],
        "reason": row["reason"],
        "message": row["message"],
    }


def build_controller(db_path: Path | str) -> ReconciliationController:
    controller = ReconciliationController(db_path)
    controller.seed_if_empty()
    return controller


def demo(db_path: Path | str = ":memory:") -> dict[str, Any]:
    controller = build_controller(db_path)
    try:
        initial = controller.snapshot()
        controller.upsert_deployment({"name": "checkout", "image": "checkout:v2"})
        rolling = controller.reconcile("checkout")
        pod = next(pod for pod in controller.active_pods("checkout") if pod["image"] == "checkout:v2")
        controller.set_pod_state(pod["pod_id"], "Running", cpu=75)
        controller.set_load("checkout", 260)
        scaled = controller.reconcile("checkout")
        return {"initial": initial, "rolling_update": rolling, "autoscaled": scaled, "snapshot": controller.snapshot()}
    finally:
        controller.close()


class ApiHandler(BaseHTTPRequestHandler):
    controller: ReconciliationController

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.html(render_home(self.controller.snapshot()))
        elif parsed.path == "/health":
            self.json({"status": "ok"})
        elif parsed.path == "/snapshot":
            self.json(self.controller.snapshot())
        elif parsed.path == "/deployments":
            self.json({"deployments": self.controller.list_deployments()})
        elif parsed.path == "/pods":
            self.json({"pods": self.controller.list_pods()})
        elif parsed.path == "/events":
            self.json({"events": self.controller.recent_events(50)})
        else:
            self.error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        try:
            payload = self.read_json()
            if parsed.path == "/deployments":
                self.json(self.controller.upsert_deployment(payload), HTTPStatus.CREATED)
            elif parsed.path == "/reconcile":
                if payload.get("deployment"):
                    self.json(self.controller.reconcile(payload["deployment"]))
                else:
                    self.json(self.controller.reconcile_all())
            elif parsed.path.startswith("/deployments/") and parsed.path.endswith("/load"):
                name = urllib.parse.unquote(parsed.path.split("/")[2])
                self.json(self.controller.set_load(name, payload.get("load", 0)))
            elif parsed.path.startswith("/pods/") and parsed.path.endswith("/state"):
                pod_id = urllib.parse.unquote(parsed.path.split("/")[2])
                self.json(self.controller.set_pod_state(pod_id, payload.get("state", ""), payload.get("cpu")))
            else:
                self.error(HTTPStatus.NOT_FOUND, "not found")
        except (json.JSONDecodeError, ValueError) as exc:
            self.error(HTTPStatus.BAD_REQUEST, str(exc))

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0"))
        if length == 0:
            return {}
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        return payload

    def json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def html(self, body: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = body.encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def error(self, status: HTTPStatus, message: str) -> None:
        self.json({"error": message}, status)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        return


def render_home(snapshot: dict[str, Any]) -> str:
    deployment_rows = "\n".join(
        f"""
        <tr>
          <td>{item['name']}</td>
          <td>{item['image']}</td>
          <td>{item['desired_replicas']}</td>
          <td>{item['status']['running_replicas']}</td>
          <td>{item['status']['updated_replicas']}</td>
          <td><span class="{'ok' if item['status']['available'] else 'warn'}">{'Available' if item['status']['available'] else 'Reconciling'}</span></td>
        </tr>
        """
        for item in snapshot["deployments"]
    )
    pod_rows = "\n".join(
        f"""
        <tr>
          <td>{item['pod_id']}</td>
          <td>{item['deployment']}</td>
          <td>{item['image']}</td>
          <td><span class="{item['state'].lower()}">{item['state']}</span></td>
          <td>{item['restart_count']}</td>
          <td>{item['cpu']}%</td>
        </tr>
        """
        for item in snapshot["pods"]
    )
    event_rows = "\n".join(
        f"""
        <tr>
          <td>#{item['event_id']}</td>
          <td>{item['deployment']}</td>
          <td>{item['reason']}</td>
          <td>{item['message']}</td>
        </tr>
        """
        for item in snapshot["events"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kubernetes Controller Reconciliation POC</title>
  <style>
    body {{ margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; background: #f6f8fb; }}
    header {{ background: #102033; color: white; padding: 28px 32px; }}
    main {{ max-width: 1220px; margin: 0 auto; padding: 28px 24px 48px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; }}
    h2 {{ font-size: 18px; margin: 28px 0 12px; }}
    p {{ margin: 0; color: #d8e0eb; }}
    .metrics {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }}
    .metric, section {{ background: white; border: 1px solid #d8dee8; border-radius: 8px; }}
    .metric {{ padding: 16px; }}
    .metric strong {{ display: block; font-size: 28px; }}
    .metric span {{ color: #5d6675; font-size: 13px; }}
    section {{ padding: 18px; overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ border-bottom: 1px solid #ecf0f5; padding: 10px; text-align: left; vertical-align: top; }}
    th {{ color: #4b5563; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }}
    .ok, .running {{ color: #047857; font-weight: 700; }}
    .warn, .pending, .terminating {{ color: #b45309; font-weight: 700; }}
    .failed {{ color: #b42318; font-weight: 700; }}
    @media (max-width: 760px) {{ .metrics {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
  </style>
</head>
<body>
  <header>
    <h1>Kubernetes Controller Reconciliation</h1>
    <p>Desired state, observed pods, rolling updates, crash backoff, autoscaling, and controller events.</p>
  </header>
  <main>
    <div class="metrics">
      <div class="metric"><strong>{snapshot['deployment_count']}</strong><span>deployments</span></div>
      <div class="metric"><strong>{snapshot['pod_count']}</strong><span>pods</span></div>
      <div class="metric"><strong>{snapshot['running_pod_count']}</strong><span>running pods</span></div>
      <div class="metric"><strong>{snapshot['failed_pod_count']}</strong><span>failed pods</span></div>
    </div>
    <h2>Deployments</h2>
    <section><table><thead><tr><th>Name</th><th>Image</th><th>Desired</th><th>Running</th><th>Updated</th><th>Status</th></tr></thead><tbody>{deployment_rows}</tbody></table></section>
    <h2>Pods</h2>
    <section><table><thead><tr><th>Pod</th><th>Deployment</th><th>Image</th><th>State</th><th>Restarts</th><th>CPU</th></tr></thead><tbody>{pod_rows}</tbody></table></section>
    <h2>Events</h2>
    <section><table><thead><tr><th>ID</th><th>Deployment</th><th>Reason</th><th>Message</th></tr></thead><tbody>{event_rows}</tbody></table></section>
  </main>
</body>
</html>"""


def serve(db_path: Path | str, host: str, port: int) -> None:
    controller = build_controller(db_path)
    ApiHandler.controller = controller
    server = HTTPServer((host, port), ApiHandler)
    print(f"Kubernetes Controller Reconciliation POC running at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        controller.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Kubernetes controller reconciliation POC")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="SQLite database path")
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("demo", help="Run a local demo flow")
    serve_parser = subcommands.add_parser("serve", help="Start HTTP server")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8165)
    args = parser.parse_args()

    if args.command == "demo":
        print(json.dumps(demo(args.db_path), indent=2, sort_keys=True))
    elif args.command == "serve":
        serve(args.db_path, args.host, args.port)


if __name__ == "__main__":
    main()
