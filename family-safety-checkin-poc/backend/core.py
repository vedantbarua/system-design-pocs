"""Domain logic for the family safety check-in POC."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any


ROLES = {"OWNER": 3, "TRUSTED_CONTACT": 2, "MEMBER": 1}
ACTIVE_CHECKIN_STATES = {"SCHEDULED", "OPEN", "LATE", "ESCALATED"}
OPEN_JOB_STATES = {"READY", "RETRY", "PROCESSING"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_time(value: str | datetime) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso(value: str | datetime | None = None) -> str:
    parsed = utcnow() if value is None else parse_time(value)
    return parsed.isoformat().replace("+00:00", "Z")


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


class SafetyService:
    """In-memory aggregate used by tests and memory-mode FastAPI."""

    def __init__(self) -> None:
        self.households: list[dict[str, Any]] = []
        self.members: list[dict[str, Any]] = []
        self.checkins: list[dict[str, Any]] = []
        self.locations: list[dict[str, Any]] = []
        self.jobs: list[dict[str, Any]] = []
        self.deliveries: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        self.processed_client_events: dict[str, dict[str, Any]] = {}
        self.idempotency: dict[str, dict[str, Any]] = {}
        self.fail_next_delivery = False
        self._lock = Lock()

    def seed(self) -> None:
        self.households = [
            {
                "id": "household-maple",
                "name": "Maple Street Circle",
                "timezone": "America/Chicago",
                "created_at": "2026-01-02T15:00:00Z",
            }
        ]
        self.members = [
            {
                "household_id": "household-maple",
                "user_id": "user-vedant",
                "name": "Vedant",
                "role": "OWNER",
                "initials": "VB",
                "color": "#28745f",
                "phone_masked": "***-***-0184",
            },
            {
                "household_id": "household-maple",
                "user_id": "user-maya",
                "name": "Maya",
                "role": "MEMBER",
                "initials": "MK",
                "color": "#3b73a3",
                "phone_masked": "***-***-4820",
            },
            {
                "household_id": "household-maple",
                "user_id": "user-parent",
                "name": "Parent",
                "role": "TRUSTED_CONTACT",
                "initials": "PB",
                "color": "#a86a26",
                "phone_masked": "***-***-7702",
            },
        ]
        self.checkins = [
            {
                "id": "checkin-commute",
                "household_id": "household-maple",
                "member_id": "user-maya",
                "created_by": "user-maya",
                "title": "Evening commute",
                "destination": "Home",
                "note": "Train from the Loop",
                "opens_at": "2026-06-14T23:30:00Z",
                "due_at": "2026-06-15T00:00:00Z",
                "grace_minutes": 20,
                "state": "OPEN",
                "acknowledged_at": None,
                "acknowledged_message": "",
                "created_at": "2026-06-14T17:00:00Z",
                "updated_at": "2026-06-14T23:30:00Z",
            },
            {
                "id": "checkin-trail",
                "household_id": "household-maple",
                "member_id": "user-vedant",
                "created_by": "user-vedant",
                "title": "Lakefront run",
                "destination": "Home",
                "note": "North trail loop",
                "opens_at": "2026-06-14T20:30:00Z",
                "due_at": "2026-06-14T21:30:00Z",
                "grace_minutes": 15,
                "state": "ACKNOWLEDGED",
                "acknowledged_at": "2026-06-14T21:18:00Z",
                "acknowledged_message": "Back home",
                "created_at": "2026-06-14T19:45:00Z",
                "updated_at": "2026-06-14T21:18:00Z",
            },
            {
                "id": "checkin-late-shift",
                "household_id": "household-maple",
                "member_id": "user-maya",
                "created_by": "user-maya",
                "title": "Late work shift",
                "destination": "Parking garage",
                "note": "Expected after closing",
                "opens_at": "2026-06-14T17:30:00Z",
                "due_at": "2026-06-14T18:30:00Z",
                "grace_minutes": 20,
                "state": "ESCALATED",
                "acknowledged_at": None,
                "acknowledged_message": "",
                "created_at": "2026-06-13T20:00:00Z",
                "updated_at": "2026-06-14T18:51:00Z",
            },
            {
                "id": "checkin-airport",
                "household_id": "household-maple",
                "member_id": "user-parent",
                "created_by": "user-vedant",
                "title": "Airport pickup",
                "destination": "Terminal 2 arrivals",
                "note": "Check in after pickup",
                "opens_at": "2026-06-15T15:00:00Z",
                "due_at": "2026-06-15T16:00:00Z",
                "grace_minutes": 30,
                "state": "SCHEDULED",
                "acknowledged_at": None,
                "acknowledged_message": "",
                "created_at": "2026-06-14T16:00:00Z",
                "updated_at": "2026-06-14T16:00:00Z",
            },
        ]
        self.locations = [
            {
                "id": "location-maya",
                "household_id": "household-maple",
                "member_id": "user-maya",
                "checkin_id": "checkin-commute",
                "latitude": 41.8894,
                "longitude": -87.6352,
                "accuracy_meters": 24,
                "label": "West Loop",
                "sequence": 4,
                "captured_at": "2026-06-14T23:43:00Z",
                "expires_at": "2026-06-15T01:00:00Z",
                "stopped_at": None,
            },
            {
                "id": "location-vedant",
                "household_id": "household-maple",
                "member_id": "user-vedant",
                "checkin_id": "checkin-trail",
                "latitude": 41.9121,
                "longitude": -87.6268,
                "accuracy_meters": 18,
                "label": "Home",
                "sequence": 7,
                "captured_at": "2026-06-14T21:17:00Z",
                "expires_at": "2026-06-14T21:30:00Z",
                "stopped_at": "2026-06-14T21:18:00Z",
            },
        ]
        self._ensure_job(
            "TRUSTED_CONTACT_ESCALATION",
            "checkin:checkin-late-shift:escalated",
            {"checkin_id": "checkin-late-shift", "member_id": "user-maya"},
        )
        self._event(
            "CHECKIN_ESCALATED",
            "worker:scheduler",
            "checkin-late-shift",
            {"grace_minutes": 20},
            at="2026-06-14T18:51:00Z",
        )
        self._event(
            "CHECKIN_ACKNOWLEDGED",
            "user-vedant",
            "checkin-trail",
            {"message": "Back home"},
            at="2026-06-14T21:18:00Z",
        )
        self._event("SAFETY_CIRCLE_SEEDED", "system", None, {"members": 3, "checkins": 4})

    def _event(
        self,
        kind: str,
        actor_id: str,
        checkin_id: str | None,
        details: dict[str, Any],
        at: str | None = None,
    ) -> dict[str, Any]:
        event = {
            "id": make_id("event"),
            "kind": kind,
            "actor_id": actor_id,
            "checkin_id": checkin_id,
            "details": details,
            "at": iso(at),
        }
        self.events.insert(0, event)
        self.events = self.events[:300]
        return event

    def _household(self, household_id: str) -> dict[str, Any]:
        household = next((item for item in self.households if item["id"] == household_id), None)
        require(household is not None, "household not found")
        return household

    def _member(self, household_id: str, user_id: str) -> dict[str, Any]:
        member = next(
            (
                item
                for item in self.members
                if item["household_id"] == household_id and item["user_id"] == user_id
            ),
            None,
        )
        require(member is not None, "household access denied")
        return member

    def _checkin(self, checkin_id: str) -> dict[str, Any]:
        checkin = next((item for item in self.checkins if item["id"] == checkin_id), None)
        require(checkin is not None, "check-in not found")
        return checkin

    def _can_manage(self, checkin: dict[str, Any], actor_id: str) -> None:
        actor = self._member(checkin["household_id"], actor_id)
        require(
            actor_id == checkin["member_id"] or ROLES[actor["role"]] >= ROLES["TRUSTED_CONTACT"],
            "check-in access denied",
        )

    def _location_for_member(self, member_id: str) -> dict[str, Any] | None:
        candidates = [item for item in self.locations if item["member_id"] == member_id]
        return max(candidates, key=lambda item: item["sequence"], default=None)

    def _active_location(self, location: dict[str, Any] | None, now: str) -> bool:
        return bool(
            location
            and location["stopped_at"] is None
            and parse_time(location["expires_at"]) > parse_time(now)
        )

    def _ensure_job(self, kind: str, dedup_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = next((item for item in self.jobs if item["dedup_key"] == dedup_key), None)
        if existing:
            return existing
        job = {
            "id": make_id("job"),
            "kind": kind,
            "dedup_key": dedup_key,
            "payload": payload,
            "status": "READY",
            "attempts": 0,
            "max_attempts": 3,
            "last_error": None,
            "created_at": iso(),
            "completed_at": None,
        }
        self.jobs.append(job)
        return job

    def create_checkin(
        self,
        household_id: str,
        actor_id: str,
        member_id: str,
        title: str,
        destination: str,
        opens_at: str,
        due_at: str,
        grace_minutes: int,
        note: str = "",
    ) -> dict[str, Any]:
        actor = self._member(household_id, actor_id)
        self._member(household_id, member_id)
        require(
            actor_id == member_id or ROLES[actor["role"]] >= ROLES["TRUSTED_CONTACT"],
            "trusted contact access required",
        )
        require(title.strip() != "", "title is required")
        require(parse_time(opens_at) < parse_time(due_at), "open time must precede due time")
        require(5 <= grace_minutes <= 120, "grace period must be between 5 and 120 minutes")
        checkin = {
            "id": make_id("checkin"),
            "household_id": household_id,
            "member_id": member_id,
            "created_by": actor_id,
            "title": title.strip(),
            "destination": destination.strip(),
            "note": note.strip(),
            "opens_at": iso(opens_at),
            "due_at": iso(due_at),
            "grace_minutes": grace_minutes,
            "state": "SCHEDULED",
            "acknowledged_at": None,
            "acknowledged_message": "",
            "created_at": iso(),
            "updated_at": iso(),
        }
        self.checkins.append(checkin)
        self._event("CHECKIN_CREATED", actor_id, checkin["id"], {"member_id": member_id})
        return self.checkin_view(checkin["id"], iso())

    def acknowledge(
        self,
        checkin_id: str,
        actor_id: str,
        idempotency_key: str,
        message: str,
        occurred_at: str | None = None,
    ) -> dict[str, Any]:
        require(idempotency_key.strip() != "", "idempotency key is required")
        if idempotency_key in self.idempotency:
            return self.idempotency[idempotency_key]
        with self._lock:
            checkin = self._checkin(checkin_id)
            self._can_manage(checkin, actor_id)
            require(checkin["state"] in ACTIVE_CHECKIN_STATES, "check-in is already closed")
            previous_state = checkin["state"]
            acknowledged_at = iso(occurred_at)
            checkin["state"] = "ACKNOWLEDGED"
            checkin["acknowledged_at"] = acknowledged_at
            checkin["acknowledged_message"] = message.strip() or "Safe"
            checkin["updated_at"] = iso()
            location = self._location_for_member(checkin["member_id"])
            if location and location["checkin_id"] == checkin_id and location["stopped_at"] is None:
                location["stopped_at"] = iso()
            self._ensure_job(
                "SAFE_CONFIRMATION",
                f"checkin:{checkin_id}:safe",
                {"checkin_id": checkin_id, "member_id": checkin["member_id"]},
            )
            event_kind = "LATE_ACKNOWLEDGEMENT" if previous_state in {"LATE", "ESCALATED"} else "CHECKIN_ACKNOWLEDGED"
            self._event(
                event_kind,
                actor_id,
                checkin_id,
                {"previous_state": previous_state, "message": checkin["acknowledged_message"]},
                at=acknowledged_at,
            )
            result = self.checkin_view(checkin_id, iso())
            self.idempotency[idempotency_key] = result
            return result

    def cancel_checkin(self, checkin_id: str, actor_id: str, reason: str) -> dict[str, Any]:
        checkin = self._checkin(checkin_id)
        self._can_manage(checkin, actor_id)
        require(checkin["state"] in ACTIVE_CHECKIN_STATES, "check-in is already closed")
        checkin["state"] = "CANCELED"
        checkin["updated_at"] = iso()
        self._event("CHECKIN_CANCELED", actor_id, checkin_id, {"reason": reason.strip()})
        return self.checkin_view(checkin_id, iso())

    def start_location_share(
        self,
        checkin_id: str,
        actor_id: str,
        latitude: float,
        longitude: float,
        accuracy_meters: int,
        label: str,
        ttl_minutes: int,
        captured_at: str,
    ) -> dict[str, Any]:
        checkin = self._checkin(checkin_id)
        self._can_manage(checkin, actor_id)
        require(actor_id == checkin["member_id"], "only the check-in member can share location")
        require(checkin["state"] in ACTIVE_CHECKIN_STATES, "check-in is already closed")
        require(5 <= ttl_minutes <= 120, "location TTL must be between 5 and 120 minutes")
        current = self._location_for_member(actor_id)
        sequence = (current["sequence"] if current else 0) + 1
        captured = parse_time(captured_at)
        location = {
            "id": make_id("location"),
            "household_id": checkin["household_id"],
            "member_id": actor_id,
            "checkin_id": checkin_id,
            "latitude": latitude,
            "longitude": longitude,
            "accuracy_meters": accuracy_meters,
            "label": label.strip(),
            "sequence": sequence,
            "captured_at": iso(captured),
            "expires_at": iso(captured + timedelta(minutes=ttl_minutes)),
            "stopped_at": None,
        }
        if current and current["stopped_at"] is None:
            current["stopped_at"] = iso()
        self.locations.append(location)
        self._event(
            "LOCATION_SHARING_STARTED",
            actor_id,
            checkin_id,
            {"ttl_minutes": ttl_minutes, "accuracy_meters": accuracy_meters},
        )
        return location

    def update_location(
        self,
        member_id: str,
        actor_id: str,
        sequence: int,
        latitude: float,
        longitude: float,
        accuracy_meters: int,
        label: str,
        captured_at: str,
    ) -> dict[str, Any]:
        require(actor_id == member_id, "members can only update their own location")
        current = self._location_for_member(member_id)
        require(current is not None and current["stopped_at"] is None, "active location share not found")
        require(sequence > current["sequence"], "stale location sequence")
        require(parse_time(captured_at) > parse_time(current["captured_at"]), "stale location timestamp")
        current["sequence"] = sequence
        current["latitude"] = latitude
        current["longitude"] = longitude
        current["accuracy_meters"] = accuracy_meters
        current["label"] = label.strip()
        current["captured_at"] = iso(captured_at)
        self._event(
            "LOCATION_UPDATED",
            actor_id,
            current["checkin_id"],
            {"sequence": sequence, "accuracy_meters": accuracy_meters},
        )
        return current

    def stop_location_share(self, member_id: str, actor_id: str) -> dict[str, Any]:
        require(actor_id == member_id, "members can only stop their own location share")
        current = self._location_for_member(member_id)
        require(current is not None and current["stopped_at"] is None, "active location share not found")
        current["stopped_at"] = iso()
        self._event("LOCATION_SHARING_STOPPED", actor_id, current["checkin_id"], {})
        return current

    def run_scheduler(self, now: str) -> dict[str, Any]:
        current = parse_time(now)
        opened = late = escalated = expired_locations = 0
        for checkin in self.checkins:
            if checkin["state"] not in ACTIVE_CHECKIN_STATES:
                continue
            opens_at = parse_time(checkin["opens_at"])
            due_at = parse_time(checkin["due_at"])
            escalation_at = due_at + timedelta(minutes=checkin["grace_minutes"])
            if checkin["state"] == "SCHEDULED" and current >= opens_at:
                checkin["state"] = "OPEN"
                checkin["updated_at"] = iso(current)
                opened += 1
                self._ensure_job(
                    "CHECKIN_OPENED",
                    f"checkin:{checkin['id']}:opened",
                    {"checkin_id": checkin["id"], "member_id": checkin["member_id"]},
                )
                self._event("CHECKIN_OPENED", "worker:scheduler", checkin["id"], {}, at=iso(current))
            if checkin["state"] == "OPEN" and current > due_at:
                checkin["state"] = "LATE"
                checkin["updated_at"] = iso(current)
                late += 1
                self._ensure_job(
                    "CHECKIN_LATE",
                    f"checkin:{checkin['id']}:late",
                    {"checkin_id": checkin["id"], "member_id": checkin["member_id"]},
                )
                self._event("CHECKIN_LATE", "worker:scheduler", checkin["id"], {}, at=iso(current))
            if checkin["state"] == "LATE" and current > escalation_at:
                checkin["state"] = "ESCALATED"
                checkin["updated_at"] = iso(current)
                escalated += 1
                self._ensure_job(
                    "TRUSTED_CONTACT_ESCALATION",
                    f"checkin:{checkin['id']}:escalated",
                    {"checkin_id": checkin["id"], "member_id": checkin["member_id"]},
                )
                self._event(
                    "CHECKIN_ESCALATED",
                    "worker:scheduler",
                    checkin["id"],
                    {"grace_minutes": checkin["grace_minutes"]},
                    at=iso(current),
                )
        for location in self.locations:
            if location["stopped_at"] is None and parse_time(location["expires_at"]) <= current:
                location["stopped_at"] = iso(current)
                expired_locations += 1
                self._event(
                    "LOCATION_SHARE_EXPIRED",
                    "worker:scheduler",
                    location["checkin_id"],
                    {"member_id": location["member_id"]},
                    at=iso(current),
                )
        return {
            "now": iso(current),
            "opened": opened,
            "late": late,
            "escalated": escalated,
            "expired_locations": expired_locations,
        }

    def sync_events(
        self, actor_id: str, client_events: list[dict[str, Any]]
    ) -> dict[str, Any]:
        accepted: list[dict[str, Any]] = []
        duplicates: list[str] = []
        rejected: list[dict[str, str]] = []
        ordered = sorted(client_events, key=lambda item: item.get("occurred_at", ""))
        for client_event in ordered:
            client_event_id = client_event.get("client_event_id", "")
            if client_event_id in self.processed_client_events:
                duplicates.append(client_event_id)
                continue
            try:
                kind = client_event.get("kind")
                payload = client_event.get("payload", {})
                if kind == "CHECKIN_ACKNOWLEDGED":
                    result = self.acknowledge(
                        payload["checkin_id"],
                        actor_id,
                        f"offline:{client_event_id}",
                        payload.get("message", "Safe"),
                        client_event.get("occurred_at"),
                    )
                elif kind == "LOCATION_UPDATED":
                    result = self.update_location(
                        actor_id=actor_id,
                        captured_at=client_event.get("occurred_at"),
                        **payload,
                    )
                else:
                    raise ValueError("unsupported offline event")
                record = {"client_event_id": client_event_id, "result": result}
                self.processed_client_events[client_event_id] = record
                accepted.append(record)
            except (KeyError, ValueError) as exc:
                rejected.append({"client_event_id": client_event_id, "reason": str(exc)})
        return {"accepted": accepted, "duplicates": duplicates, "rejected": rejected}

    def worker_tick(self) -> dict[str, Any]:
        job = next((item for item in self.jobs if item["status"] in {"READY", "RETRY"}), None)
        if not job:
            return {"processed": False}
        job["status"] = "PROCESSING"
        job["attempts"] += 1
        if self.fail_next_delivery:
            self.fail_next_delivery = False
            job["last_error"] = "simulated notification provider timeout"
            job["status"] = "DEAD" if job["attempts"] >= job["max_attempts"] else "RETRY"
            self._event("DELIVERY_RETRY_SCHEDULED", "worker:notifications", job["payload"].get("checkin_id"), {"job_id": job["id"]})
            return {"processed": True, "job": job}
        checkin = self._checkin(job["payload"]["checkin_id"])
        if job["kind"] == "TRUSTED_CONTACT_ESCALATION":
            recipients = [
                item["user_id"]
                for item in self.members
                if item["household_id"] == checkin["household_id"]
                and item["role"] in {"OWNER", "TRUSTED_CONTACT"}
                and item["user_id"] != checkin["member_id"]
            ]
            channels = ["push", "sms"]
        else:
            recipients = [checkin["member_id"]]
            channels = ["push"]
        for recipient in recipients:
            for channel in channels:
                delivery_key = f"{job['dedup_key']}:{recipient}:{channel}"
                if any(item["dedup_key"] == delivery_key for item in self.deliveries):
                    continue
                self.deliveries.insert(
                    0,
                    {
                        "id": make_id("delivery"),
                        "job_id": job["id"],
                        "checkin_id": checkin["id"],
                        "recipient_id": recipient,
                        "channel": channel,
                        "status": "DELIVERED",
                        "dedup_key": delivery_key,
                        "delivered_at": iso(),
                    },
                )
        job["status"] = "COMPLETED"
        job["completed_at"] = iso()
        job["last_error"] = None
        self._event("NOTIFICATION_DELIVERED", "worker:notifications", checkin["id"], {"job_id": job["id"], "kind": job["kind"]})
        return {"processed": True, "job": job}

    def drain_workers(self, max_jobs: int = 30) -> dict[str, Any]:
        processed = 0
        while processed < max_jobs:
            result = self.worker_tick()
            if not result["processed"]:
                break
            processed += 1
        return {"processed": processed}

    def checkin_view(self, checkin_id: str, now: str) -> dict[str, Any]:
        checkin = self._checkin(checkin_id)
        member = self._member(checkin["household_id"], checkin["member_id"])
        location = self._location_for_member(checkin["member_id"])
        due_at = parse_time(checkin["due_at"])
        remaining = round((due_at - parse_time(now)).total_seconds() / 60)
        return {
            **checkin,
            "member": member,
            "minutes_until_due": remaining,
            "location": location if self._active_location(location, now) and location["checkin_id"] == checkin_id else None,
            "timeline": [item for item in self.events if item["checkin_id"] == checkin_id],
        }

    def snapshot(
        self,
        household_id: str = "household-maple",
        actor_id: str = "user-vedant",
        now: str = "2026-06-14T23:45:00Z",
    ) -> dict[str, Any]:
        self._household(household_id)
        self._member(household_id, actor_id)
        checkins = [
            self.checkin_view(item["id"], now)
            for item in self.checkins
            if item["household_id"] == household_id
        ]
        members = []
        for member in [item for item in self.members if item["household_id"] == household_id]:
            location = self._location_for_member(member["user_id"])
            member_checkins = [item for item in checkins if item["member_id"] == member["user_id"]]
            active = next(
                (item for item in member_checkins if item["state"] in {"OPEN", "LATE", "ESCALATED"}),
                None,
            )
            members.append(
                {
                    **member,
                    "status": active["state"] if active else "SAFE",
                    "active_checkin_id": active["id"] if active else None,
                    "location": location if self._active_location(location, now) else None,
                }
            )
        return {
            "household": self._household(household_id),
            "members": members,
            "checkins": sorted(checkins, key=lambda item: item["due_at"]),
            "jobs": self.jobs,
            "deliveries": self.deliveries,
            "events": self.events,
            "metrics": {
                "members": len(members),
                "open": len([item for item in checkins if item["state"] == "OPEN"]),
                "late": len([item for item in checkins if item["state"] == "LATE"]),
                "escalated": len([item for item in checkins if item["state"] == "ESCALATED"]),
                "scheduled": len([item for item in checkins if item["state"] == "SCHEDULED"]),
                "acknowledged": len([item for item in checkins if item["state"] == "ACKNOWLEDGED"]),
                "active_locations": len([item for item in members if item["location"]]),
                "pending_jobs": len([item for item in self.jobs if item["status"] in {"READY", "RETRY"}]),
                "deliveries": len(self.deliveries),
            },
        }


def seeded_service() -> SafetyService:
    service = SafetyService()
    service.seed()
    return service
