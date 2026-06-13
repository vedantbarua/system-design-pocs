"""Domain logic for the medication refill and adherence POC."""

from __future__ import annotations

import math
import uuid
from datetime import date, datetime, time, timedelta, timezone
from threading import Lock
from typing import Any
from zoneinfo import ZoneInfo


ROLES = {"OWNER": 3, "CAREGIVER": 2, "VIEWER": 1}
DOSE_STATES = {"SCHEDULED", "TAKEN", "SKIPPED", "MISSED"}
ACTIVE_REFILLS = {"REQUESTED", "ORDERED", "READY"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_datetime(value: str | datetime) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso(value: str | datetime | None = None) -> str:
    parsed = utcnow() if value is None else parse_datetime(value)
    return parsed.isoformat().replace("+00:00", "Z")


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def local_occurrence(day: str, clock: str, timezone_name: str) -> str:
    local_day = date.fromisoformat(day)
    hour, minute = (int(part) for part in clock.split(":"))
    local = datetime.combine(local_day, time(hour, minute), ZoneInfo(timezone_name))
    return iso(local.astimezone(timezone.utc))


class MedicationService:
    """In-memory aggregate shared by tests and memory-mode FastAPI."""

    def __init__(self) -> None:
        self.households: list[dict[str, Any]] = []
        self.members: list[dict[str, Any]] = []
        self.medications: list[dict[str, Any]] = []
        self.prescriptions: list[dict[str, Any]] = []
        self.doses: list[dict[str, Any]] = []
        self.inventory_ledger: list[dict[str, Any]] = []
        self.refills: list[dict[str, Any]] = []
        self.jobs: list[dict[str, Any]] = []
        self.deliveries: list[dict[str, Any]] = []
        self.audit: list[dict[str, Any]] = []
        self.idempotency: dict[str, dict[str, Any]] = {}
        self.fail_next_delivery = False
        self._lock = Lock()

    def seed(self) -> None:
        self.households = [
            {
                "id": "household-maple",
                "name": "Maple Street Care Circle",
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
                "notifications": ["push", "email"],
            },
            {
                "household_id": "household-maple",
                "user_id": "user-maya",
                "name": "Maya",
                "role": "CAREGIVER",
                "notifications": ["push"],
            },
            {
                "household_id": "household-maple",
                "user_id": "user-parent",
                "name": "Parent",
                "role": "VIEWER",
                "notifications": [],
            },
        ]
        self.medications = [
            {
                "id": "med-lisinopril",
                "household_id": "household-maple",
                "patient_id": "user-vedant",
                "name": "Lisinopril",
                "strength": "10 mg",
                "form": "tablet",
                "instructions": "Take one tablet each morning",
                "schedule_times": ["08:00"],
                "timezone": "America/Chicago",
                "quantity_on_hand": 12,
                "units_per_dose": 1,
                "refill_threshold_days": 10,
                "start_date": "2026-01-10",
                "end_date": None,
                "status": "ACTIVE",
                "prescriber": "Dr. A. Shah",
                "pharmacy": "Lakeview Pharmacy",
                "current_prescription_id": "rx-lisinopril-2",
                "updated_at": "2026-06-10T14:00:00Z",
            },
            {
                "id": "med-metformin",
                "household_id": "household-maple",
                "patient_id": "user-vedant",
                "name": "Metformin",
                "strength": "500 mg",
                "form": "tablet",
                "instructions": "Take one tablet with breakfast and dinner",
                "schedule_times": ["08:00", "20:00"],
                "timezone": "America/Chicago",
                "quantity_on_hand": 9,
                "units_per_dose": 1,
                "refill_threshold_days": 7,
                "start_date": "2026-03-01",
                "end_date": None,
                "status": "ACTIVE",
                "prescriber": "Dr. A. Shah",
                "pharmacy": "Lakeview Pharmacy",
                "current_prescription_id": "rx-metformin-1",
                "updated_at": "2026-06-11T14:00:00Z",
            },
            {
                "id": "med-vitamin-d",
                "household_id": "household-maple",
                "patient_id": "user-vedant",
                "name": "Vitamin D3",
                "strength": "2,000 IU",
                "form": "softgel",
                "instructions": "Take one softgel at lunch",
                "schedule_times": ["12:30"],
                "timezone": "America/Chicago",
                "quantity_on_hand": 31,
                "units_per_dose": 1,
                "refill_threshold_days": 14,
                "start_date": "2026-02-01",
                "end_date": None,
                "status": "ACTIVE",
                "prescriber": "Self managed",
                "pharmacy": "Household supply",
                "current_prescription_id": None,
                "updated_at": "2026-06-01T14:00:00Z",
            },
            {
                "id": "med-amoxicillin",
                "household_id": "household-maple",
                "patient_id": "user-vedant",
                "name": "Amoxicillin",
                "strength": "500 mg",
                "form": "capsule",
                "instructions": "Take one capsule three times daily",
                "schedule_times": ["08:00", "14:00", "20:00"],
                "timezone": "America/Chicago",
                "quantity_on_hand": 4,
                "units_per_dose": 1,
                "refill_threshold_days": 0,
                "start_date": "2026-06-09",
                "end_date": "2026-06-15",
                "status": "ACTIVE",
                "prescriber": "Urgent Care",
                "pharmacy": "Lakeview Pharmacy",
                "current_prescription_id": "rx-amoxicillin-1",
                "updated_at": "2026-06-09T15:00:00Z",
            },
        ]
        self.prescriptions = [
            {
                "id": "rx-lisinopril-1",
                "medication_id": "med-lisinopril",
                "version": 1,
                "rx_number_masked": "RX-***142",
                "authorized_refills": 3,
                "remaining_refills": 2,
                "written_on": "2026-01-10",
                "expires_on": "2027-01-10",
                "created_at": "2026-01-10T15:00:00Z",
            },
            {
                "id": "rx-lisinopril-2",
                "medication_id": "med-lisinopril",
                "version": 2,
                "rx_number_masked": "RX-***142",
                "authorized_refills": 3,
                "remaining_refills": 1,
                "written_on": "2026-04-10",
                "expires_on": "2027-04-10",
                "created_at": "2026-04-10T15:00:00Z",
            },
            {
                "id": "rx-metformin-1",
                "medication_id": "med-metformin",
                "version": 1,
                "rx_number_masked": "RX-***883",
                "authorized_refills": 5,
                "remaining_refills": 3,
                "written_on": "2026-03-01",
                "expires_on": "2027-03-01",
                "created_at": "2026-03-01T15:00:00Z",
            },
            {
                "id": "rx-amoxicillin-1",
                "medication_id": "med-amoxicillin",
                "version": 1,
                "rx_number_masked": "RX-***501",
                "authorized_refills": 0,
                "remaining_refills": 0,
                "written_on": "2026-06-09",
                "expires_on": "2026-06-30",
                "created_at": "2026-06-09T15:00:00Z",
            },
        ]
        self.materialize_doses("2026-06-13")
        for offset in range(1, 7):
            day = (date(2026, 6, 13) - timedelta(days=offset)).isoformat()
            self.materialize_doses(day)
            for dose in [item for item in self.doses if item["local_date"] == day]:
                dose["state"] = "MISSED" if offset == 2 and dose["medication_id"] == "med-vitamin-d" else "TAKEN"
                dose["resolved_at"] = dose["scheduled_at"]
        initial_states = {
            ("med-lisinopril", "08:00"): "TAKEN",
            ("med-metformin", "08:00"): "TAKEN",
            ("med-vitamin-d", "12:30"): "MISSED",
            ("med-amoxicillin", "08:00"): "TAKEN",
            ("med-amoxicillin", "14:00"): "MISSED",
        }
        for dose in [item for item in self.doses if item["local_date"] == "2026-06-13"]:
            dose["state"] = initial_states.get((dose["medication_id"], dose["local_time"]), "SCHEDULED")
            if dose["state"] != "SCHEDULED":
                dose["resolved_at"] = dose["scheduled_at"]
        self.refills = [
            {
                "id": "refill-metformin",
                "medication_id": "med-metformin",
                "status": "REQUESTED",
                "quantity": 60,
                "requested_by": "user-vedant",
                "requested_at": "2026-06-12T16:20:00Z",
                "completed_at": None,
                "idempotency_key": "seed-metformin-refill",
            }
        ]
        self._ensure_job(
            "MISSED_DOSE_ESCALATION",
            "dose:med-amoxicillin:2026-06-13:14:00:escalation",
            {"dose_id": self._dose_by_key("med-amoxicillin", "2026-06-13", "14:00")["id"]},
        )
        self._audit("CARE_PLAN_SEEDED", "system", None, {"medications": len(self.medications)})

    def _audit(
        self, action: str, actor_id: str, medication_id: str | None, details: dict[str, Any]
    ) -> dict[str, Any]:
        event = {
            "id": make_id("audit"),
            "action": action,
            "actor_id": actor_id,
            "medication_id": medication_id,
            "details": details,
            "at": iso(),
        }
        self.audit.insert(0, event)
        self.audit = self.audit[:250]
        return event

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

    def _authorize(self, household_id: str, actor_id: str, minimum: str) -> None:
        member = self._member(household_id, actor_id)
        require(ROLES[member["role"]] >= ROLES[minimum], f"{minimum.lower()} access required")

    def _medication(self, medication_id: str) -> dict[str, Any]:
        medication = next((item for item in self.medications if item["id"] == medication_id), None)
        require(medication is not None, "medication not found")
        return medication

    def _dose(self, dose_id: str) -> dict[str, Any]:
        dose = next((item for item in self.doses if item["id"] == dose_id), None)
        require(dose is not None, "dose not found")
        return dose

    def _dose_by_key(self, medication_id: str, day: str, clock: str) -> dict[str, Any]:
        return next(
            item
            for item in self.doses
            if item["medication_id"] == medication_id
            and item["local_date"] == day
            and item["local_time"] == clock
        )

    def _daily_units(self, medication: dict[str, Any]) -> float:
        return len(medication["schedule_times"]) * medication["units_per_dose"]

    def _supply_days(self, medication: dict[str, Any]) -> int:
        daily_units = self._daily_units(medication)
        return math.floor(medication["quantity_on_hand"] / daily_units) if daily_units else 0

    def materialize_doses(self, local_date: str) -> dict[str, Any]:
        date.fromisoformat(local_date)
        created = 0
        for medication in self.medications:
            if medication["status"] != "ACTIVE":
                continue
            if local_date < medication["start_date"]:
                continue
            if medication["end_date"] and local_date > medication["end_date"]:
                continue
            for clock in medication["schedule_times"]:
                dedup_key = f"dose:{medication['id']}:{local_date}:{clock}"
                if any(item["dedup_key"] == dedup_key for item in self.doses):
                    continue
                self.doses.append(
                    {
                        "id": make_id("dose"),
                        "dedup_key": dedup_key,
                        "medication_id": medication["id"],
                        "patient_id": medication["patient_id"],
                        "local_date": local_date,
                        "local_time": clock,
                        "scheduled_at": local_occurrence(local_date, clock, medication["timezone"]),
                        "state": "SCHEDULED",
                        "resolved_at": None,
                        "resolved_by": None,
                        "note": "",
                    }
                )
                created += 1
        if created:
            self._audit("DOSES_MATERIALIZED", "worker:scheduler", None, {"date": local_date, "created": created})
        return {"created": created, "date": local_date}

    def mark_dose(
        self,
        dose_id: str,
        actor_id: str,
        state: str,
        idempotency_key: str,
        note: str = "",
    ) -> dict[str, Any]:
        require(state in {"TAKEN", "SKIPPED"}, "dose can only be marked taken or skipped")
        require(idempotency_key.strip() != "", "idempotency key is required")
        if idempotency_key in self.idempotency:
            return self.idempotency[idempotency_key]
        with self._lock:
            dose = self._dose(dose_id)
            medication = self._medication(dose["medication_id"])
            self._authorize(medication["household_id"], actor_id, "CAREGIVER")
            require(dose["state"] in {"SCHEDULED", "MISSED"}, "dose is already resolved")
            dose["state"] = state
            dose["resolved_at"] = iso()
            dose["resolved_by"] = actor_id
            dose["note"] = note
            if state == "TAKEN":
                self.adjust_inventory(
                    medication["id"],
                    actor_id,
                    -medication["units_per_dose"],
                    "DOSE_TAKEN",
                    f"dose:{dose_id}",
                )
            self._audit(
                f"DOSE_{state}",
                actor_id,
                medication["id"],
                {"dose_id": dose_id, "scheduled_at": dose["scheduled_at"]},
            )
            result = self.dose_view(dose_id)
            self.idempotency[idempotency_key] = result
            return result

    def adjust_inventory(
        self,
        medication_id: str,
        actor_id: str,
        delta: float,
        reason: str,
        reference: str,
    ) -> dict[str, Any]:
        medication = self._medication(medication_id)
        self._authorize(medication["household_id"], actor_id, "CAREGIVER")
        existing = next((item for item in self.inventory_ledger if item["reference"] == reference), None)
        if existing:
            return existing
        new_quantity = medication["quantity_on_hand"] + delta
        require(new_quantity >= 0, "inventory cannot be negative")
        medication["quantity_on_hand"] = round(new_quantity, 2)
        medication["updated_at"] = iso()
        entry = {
            "id": make_id("inventory"),
            "medication_id": medication_id,
            "delta": delta,
            "balance": medication["quantity_on_hand"],
            "reason": reason,
            "reference": reference,
            "actor_id": actor_id,
            "created_at": iso(),
        }
        self.inventory_ledger.insert(0, entry)
        self._audit("INVENTORY_ADJUSTED", actor_id, medication_id, {"delta": delta, "reason": reason})
        return entry

    def request_refill(
        self,
        medication_id: str,
        actor_id: str,
        quantity: int,
        idempotency_key: str,
    ) -> dict[str, Any]:
        require(quantity > 0, "refill quantity must be positive")
        medication = self._medication(medication_id)
        self._authorize(medication["household_id"], actor_id, "CAREGIVER")
        existing_key = next(
            (item for item in self.refills if item["idempotency_key"] == idempotency_key), None
        )
        if existing_key:
            return existing_key
        active = next(
            (
                item
                for item in self.refills
                if item["medication_id"] == medication_id and item["status"] in ACTIVE_REFILLS
            ),
            None,
        )
        if active:
            return active
        refill = {
            "id": make_id("refill"),
            "medication_id": medication_id,
            "status": "REQUESTED",
            "quantity": quantity,
            "requested_by": actor_id,
            "requested_at": iso(),
            "completed_at": None,
            "idempotency_key": idempotency_key,
        }
        self.refills.insert(0, refill)
        self._ensure_job(
            "REFILL_REQUESTED",
            f"refill:{refill['id']}:requested",
            {"refill_id": refill["id"], "medication_id": medication_id},
        )
        self._audit("REFILL_REQUESTED", actor_id, medication_id, {"refill_id": refill["id"]})
        return refill

    def update_refill(self, refill_id: str, actor_id: str, status: str) -> dict[str, Any]:
        refill = next((item for item in self.refills if item["id"] == refill_id), None)
        require(refill is not None, "refill request not found")
        medication = self._medication(refill["medication_id"])
        self._authorize(medication["household_id"], actor_id, "CAREGIVER")
        require(status in {"ORDERED", "READY", "COMPLETED", "CANCELED"}, "invalid refill state")
        require(refill["status"] not in {"COMPLETED", "CANCELED"}, "refill is already closed")
        refill["status"] = status
        if status == "COMPLETED":
            refill["completed_at"] = iso()
            self.adjust_inventory(
                medication["id"],
                actor_id,
                refill["quantity"],
                "REFILL_COMPLETED",
                f"refill:{refill_id}",
            )
        self._audit(f"REFILL_{status}", actor_id, medication["id"], {"refill_id": refill_id})
        return refill

    def add_prescription_version(
        self,
        medication_id: str,
        actor_id: str,
        rx_number_masked: str,
        authorized_refills: int,
        remaining_refills: int,
        expires_on: str,
    ) -> dict[str, Any]:
        medication = self._medication(medication_id)
        self._authorize(medication["household_id"], actor_id, "CAREGIVER")
        versions = [item for item in self.prescriptions if item["medication_id"] == medication_id]
        version = {
            "id": make_id("rx"),
            "medication_id": medication_id,
            "version": max((item["version"] for item in versions), default=0) + 1,
            "rx_number_masked": rx_number_masked,
            "authorized_refills": authorized_refills,
            "remaining_refills": remaining_refills,
            "written_on": utcnow().date().isoformat(),
            "expires_on": expires_on,
            "created_at": iso(),
        }
        self.prescriptions.append(version)
        medication["current_prescription_id"] = version["id"]
        medication["updated_at"] = iso()
        self._audit("PRESCRIPTION_VERSION_ADDED", actor_id, medication_id, {"version": version["version"]})
        return version

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

    def run_scheduler(self, now: str) -> dict[str, Any]:
        current = parse_datetime(now)
        household = self.households[0]
        local_day = current.astimezone(ZoneInfo(household["timezone"])).date().isoformat()
        materialized = self.materialize_doses(local_day)["created"]
        reminders = 0
        missed = 0
        refill_alerts = 0
        for dose in [item for item in self.doses if item["local_date"] == local_day]:
            if dose["state"] != "SCHEDULED":
                continue
            scheduled = parse_datetime(dose["scheduled_at"])
            if current < scheduled:
                continue
            if current <= scheduled + timedelta(minutes=60):
                before = len(self.jobs)
                self._ensure_job(
                    "DOSE_REMINDER",
                    f"{dose['dedup_key']}:reminder",
                    {"dose_id": dose["id"], "patient_id": dose["patient_id"]},
                )
                reminders += int(len(self.jobs) > before)
            else:
                dose["state"] = "MISSED"
                dose["resolved_at"] = iso(current)
                missed += 1
                self._ensure_job(
                    "MISSED_DOSE_ESCALATION",
                    f"{dose['dedup_key']}:escalation",
                    {"dose_id": dose["id"], "patient_id": dose["patient_id"]},
                )
                self._audit(
                    "DOSE_MISSED",
                    "worker:scheduler",
                    dose["medication_id"],
                    {"dose_id": dose["id"]},
                )
        for medication in self.medications:
            if medication["status"] != "ACTIVE" or medication["refill_threshold_days"] <= 0:
                continue
            if self._supply_days(medication) <= medication["refill_threshold_days"]:
                before = len(self.jobs)
                self._ensure_job(
                    "LOW_SUPPLY_ALERT",
                    f"medication:{medication['id']}:low-supply:{local_day}",
                    {"medication_id": medication["id"], "supply_days": self._supply_days(medication)},
                )
                refill_alerts += int(len(self.jobs) > before)
        self._audit(
            "SCHEDULER_COMPLETED",
            "worker:scheduler",
            None,
            {
                "materialized": materialized,
                "reminders": reminders,
                "missed": missed,
                "refill_alerts": refill_alerts,
            },
        )
        return {
            "date": local_day,
            "materialized": materialized,
            "reminders": reminders,
            "missed": missed,
            "refill_alerts": refill_alerts,
        }

    def worker_tick(self) -> dict[str, Any]:
        job = next((item for item in self.jobs if item["status"] in {"READY", "RETRY"}), None)
        if not job:
            return {"processed": False}
        job["status"] = "PROCESSING"
        job["attempts"] += 1
        if self.fail_next_delivery:
            self.fail_next_delivery = False
            job["last_error"] = "simulated provider timeout"
            job["status"] = "DEAD" if job["attempts"] >= job["max_attempts"] else "RETRY"
            self._audit("DELIVERY_RETRY_SCHEDULED", "worker:notifications", None, {"job_id": job["id"]})
            return {"processed": True, "job": job}
        recipients = ["user-vedant"]
        channel = "push"
        if job["kind"] == "MISSED_DOSE_ESCALATION":
            recipients = [
                item["user_id"]
                for item in self.members
                if item["role"] in {"OWNER", "CAREGIVER"}
            ]
            channel = "push+email"
        for recipient in recipients:
            delivery_key = f"{job['dedup_key']}:{recipient}"
            if any(item["dedup_key"] == delivery_key for item in self.deliveries):
                continue
            self.deliveries.insert(
                0,
                {
                    "id": make_id("delivery"),
                    "job_id": job["id"],
                    "kind": job["kind"],
                    "recipient_id": recipient,
                    "channel": channel,
                    "status": "SENT",
                    "dedup_key": delivery_key,
                    "sent_at": iso(),
                },
            )
        job["status"] = "COMPLETED"
        job["completed_at"] = iso()
        job["last_error"] = None
        self._audit("NOTIFICATION_SENT", "worker:notifications", job["payload"].get("medication_id"), {"job_id": job["id"], "kind": job["kind"]})
        return {"processed": True, "job": job}

    def drain_workers(self, max_jobs: int = 25) -> dict[str, Any]:
        processed = 0
        while processed < max_jobs:
            result = self.worker_tick()
            if not result["processed"]:
                break
            processed += 1
        return {"processed": processed}

    def dose_view(self, dose_id: str) -> dict[str, Any]:
        dose = self._dose(dose_id)
        medication = self._medication(dose["medication_id"])
        return {**dose, "medication": {"name": medication["name"], "strength": medication["strength"]}}

    def medication_view(self, medication_id: str, actor_id: str = "user-vedant") -> dict[str, Any]:
        medication = self._medication(medication_id)
        self._authorize(medication["household_id"], actor_id, "VIEWER")
        return {
            **medication,
            "supply_days": self._supply_days(medication),
            "low_supply": self._supply_days(medication) <= medication["refill_threshold_days"],
            "doses": sorted(
                [self.dose_view(item["id"]) for item in self.doses if item["medication_id"] == medication_id],
                key=lambda item: item["scheduled_at"],
                reverse=True,
            ),
            "prescriptions": sorted(
                [item for item in self.prescriptions if item["medication_id"] == medication_id],
                key=lambda item: item["version"],
                reverse=True,
            ),
            "inventory": [item for item in self.inventory_ledger if item["medication_id"] == medication_id],
            "refills": [item for item in self.refills if item["medication_id"] == medication_id],
            "audit": [item for item in self.audit if item["medication_id"] == medication_id],
        }

    def snapshot(
        self,
        household_id: str = "household-maple",
        actor_id: str = "user-vedant",
        local_date: str = "2026-06-13",
    ) -> dict[str, Any]:
        self._authorize(household_id, actor_id, "VIEWER")
        self.materialize_doses(local_date)
        medication_views = [
            self.medication_view(item["id"], actor_id)
            for item in self.medications
            if item["household_id"] == household_id
        ]
        today_doses = sorted(
            [self.dose_view(item["id"]) for item in self.doses if item["local_date"] == local_date],
            key=lambda item: item["scheduled_at"],
        )
        resolved = [item for item in self.doses if item["state"] in {"TAKEN", "SKIPPED", "MISSED"}]
        adherence = round(
            100 * len([item for item in resolved if item["state"] == "TAKEN"]) / len(resolved)
        ) if resolved else 100
        history = []
        for offset in range(6, -1, -1):
            history_day = (date.fromisoformat(local_date) - timedelta(days=offset)).isoformat()
            day_doses = [
                item
                for item in self.doses
                if item["local_date"] == history_day
                and item["state"] in {"TAKEN", "SKIPPED", "MISSED"}
            ]
            taken = len([item for item in day_doses if item["state"] == "TAKEN"])
            history.append(
                {
                    "date": history_day,
                    "taken": taken,
                    "expected": len(day_doses),
                    "percent": round(100 * taken / len(day_doses)) if day_doses else 0,
                }
            )
        return {
            "household": next(item for item in self.households if item["id"] == household_id),
            "members": [item for item in self.members if item["household_id"] == household_id],
            "medications": medication_views,
            "today_doses": today_doses,
            "refills": self.refills,
            "jobs": self.jobs,
            "deliveries": self.deliveries,
            "audit": self.audit,
            "adherence_history": history,
            "metrics": {
                "active_medications": len([item for item in medication_views if item["status"] == "ACTIVE"]),
                "taken_today": len([item for item in today_doses if item["state"] == "TAKEN"]),
                "missed_today": len([item for item in today_doses if item["state"] == "MISSED"]),
                "scheduled_today": len([item for item in today_doses if item["state"] == "SCHEDULED"]),
                "low_supply": len([item for item in medication_views if item["low_supply"]]),
                "open_refills": len([item for item in self.refills if item["status"] in ACTIVE_REFILLS]),
                "pending_jobs": len([item for item in self.jobs if item["status"] in {"READY", "RETRY"}]),
                "adherence_percent": adherence,
            },
        }


def seeded_service() -> MedicationService:
    service = MedicationService()
    service.seed()
    return service
