"""Domain logic for the personal document renewal vault."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from threading import Lock
from typing import Any


DOCUMENT_STATES = {
    "UPLOADED",
    "SCANNING",
    "READY",
    "EXPIRING",
    "EXPIRED",
    "RENEWED",
    "QUARANTINED",
}
ROLES = {"OWNER": 3, "EDITOR": 2, "VIEWER": 1}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | str | None = None) -> str:
    if value is None:
        parsed = utcnow()
    elif isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def day(value: date | datetime | str | None = None) -> str:
    if value is None:
        return utcnow().date().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value[:10]


def add_days(value: str, days: int) -> str:
    return (date.fromisoformat(day(value)) + timedelta(days=days)).isoformat()


def days_between(start: str, end: str) -> int:
    return (date.fromisoformat(day(end)) - date.fromisoformat(day(start))).days


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def lifecycle_state(document: dict[str, Any], as_of: str) -> str:
    if document["state"] in {"UPLOADED", "SCANNING", "QUARANTINED", "RENEWED"}:
        return document["state"]
    expires_on = document.get("expires_on")
    if not expires_on:
        return "READY"
    remaining = days_between(as_of, expires_on)
    if remaining < 0:
        return "EXPIRED"
    if remaining <= document.get("reminder_days", 60):
        return "EXPIRING"
    return "READY"


class VaultService:
    """In-memory aggregate used directly by tests and memory-mode FastAPI."""

    def __init__(self) -> None:
        self.households: list[dict[str, Any]] = []
        self.members: list[dict[str, Any]] = []
        self.documents: list[dict[str, Any]] = []
        self.versions: list[dict[str, Any]] = []
        self.grants: list[dict[str, Any]] = []
        self.jobs: list[dict[str, Any]] = []
        self.reminders: list[dict[str, Any]] = []
        self.audit: list[dict[str, Any]] = []
        self.objects: dict[str, bytes] = {}
        self._lock = Lock()

    def seed(self) -> None:
        self.households = [
            {
                "id": "household-maple",
                "name": "Maple Street Household",
                "created_at": "2026-01-02T15:00:00Z",
            }
        ]
        self.members = [
            {"household_id": "household-maple", "user_id": "user-vedant", "name": "Vedant", "role": "OWNER"},
            {"household_id": "household-maple", "user_id": "user-maya", "name": "Maya", "role": "EDITOR"},
            {"household_id": "household-maple", "user_id": "user-parent", "name": "Parent", "role": "VIEWER"},
        ]
        self.documents = [
            {
                "id": "doc-passport",
                "household_id": "household-maple",
                "owner_user_id": "user-vedant",
                "title": "US Passport",
                "category": "Identity",
                "issuer": "U.S. Department of State",
                "document_number_masked": "•••• 4821",
                "issued_on": "2017-08-20",
                "expires_on": "2027-08-19",
                "reminder_days": 180,
                "state": "READY",
                "current_version_id": "ver-passport-2",
                "renewed_by_document_id": None,
                "created_at": "2026-01-10T16:00:00Z",
                "updated_at": "2026-05-18T14:00:00Z",
                "tags": ["travel", "identity"],
            },
            {
                "id": "doc-license",
                "household_id": "household-maple",
                "owner_user_id": "user-vedant",
                "title": "Illinois Driver License",
                "category": "Identity",
                "issuer": "Illinois Secretary of State",
                "document_number_masked": "V•••-••82",
                "issued_on": "2022-07-01",
                "expires_on": "2026-07-03",
                "reminder_days": 60,
                "state": "READY",
                "current_version_id": "ver-license-1",
                "renewed_by_document_id": None,
                "created_at": "2026-02-10T16:00:00Z",
                "updated_at": "2026-02-10T16:00:00Z",
                "tags": ["driving", "identity"],
            },
            {
                "id": "doc-insurance",
                "household_id": "household-maple",
                "owner_user_id": "user-maya",
                "title": "Auto Insurance Policy",
                "category": "Insurance",
                "issuer": "State Farm",
                "document_number_masked": "POL-•••-901",
                "issued_on": "2025-12-15",
                "expires_on": "2026-06-18",
                "reminder_days": 30,
                "state": "READY",
                "current_version_id": "ver-insurance-1",
                "renewed_by_document_id": None,
                "created_at": "2026-01-03T16:00:00Z",
                "updated_at": "2026-01-03T16:00:00Z",
                "tags": ["vehicle", "insurance"],
            },
            {
                "id": "doc-lease",
                "household_id": "household-maple",
                "owner_user_id": "user-vedant",
                "title": "Apartment Lease",
                "category": "Housing",
                "issuer": "Maple Property Group",
                "document_number_masked": "LEASE-2026",
                "issued_on": "2025-09-01",
                "expires_on": "2026-08-31",
                "reminder_days": 90,
                "state": "READY",
                "current_version_id": "ver-lease-1",
                "renewed_by_document_id": None,
                "created_at": "2026-01-02T16:00:00Z",
                "updated_at": "2026-01-02T16:00:00Z",
                "tags": ["housing", "contract"],
            },
            {
                "id": "doc-certificate",
                "household_id": "household-maple",
                "owner_user_id": "user-maya",
                "title": "CPR Certification",
                "category": "Certificate",
                "issuer": "American Red Cross",
                "document_number_masked": "CPR-••431",
                "issued_on": "2024-05-30",
                "expires_on": "2026-05-30",
                "reminder_days": 45,
                "state": "READY",
                "current_version_id": "ver-certificate-1",
                "renewed_by_document_id": None,
                "created_at": "2026-02-14T16:00:00Z",
                "updated_at": "2026-02-14T16:00:00Z",
                "tags": ["health", "certificate"],
            },
        ]
        version_specs = [
            ("ver-passport-1", "doc-passport", 1, "passport-2017.pdf", "2026-01-10T16:00:00Z"),
            ("ver-passport-2", "doc-passport", 2, "passport-clear-scan.pdf", "2026-05-18T14:00:00Z"),
            ("ver-license-1", "doc-license", 1, "driver-license.pdf", "2026-02-10T16:00:00Z"),
            ("ver-insurance-1", "doc-insurance", 1, "auto-policy.pdf", "2026-01-03T16:00:00Z"),
            ("ver-lease-1", "doc-lease", 1, "apartment-lease.pdf", "2026-01-02T16:00:00Z"),
            ("ver-certificate-1", "doc-certificate", 1, "cpr-certificate.pdf", "2026-02-14T16:00:00Z"),
        ]
        for version_id, document_id, number, filename, created_at in version_specs:
            object_key = f"household-maple/{document_id}/{version_id}/{filename}"
            content = f"Demo protected content for {document_id} version {number}".encode()
            self.objects[object_key] = content
            self.versions.append(
                {
                    "id": version_id,
                    "document_id": document_id,
                    "version": number,
                    "filename": filename,
                    "content_type": "application/pdf",
                    "size_bytes": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "object_key": object_key,
                    "scan_status": "CLEAN",
                    "ocr_status": "COMPLETED",
                    "ocr_metadata": {"confidence": 0.96, "fields_extracted": 4},
                    "created_by": "user-vedant",
                    "created_at": created_at,
                }
            )
        self.refresh_reminders("2026-06-12")
        self._audit("VAULT_SEEDED", "system", None, {"documents": len(self.documents)})

    def _audit(
        self, action: str, actor_id: str, document_id: str | None, details: dict[str, Any]
    ) -> dict[str, Any]:
        event = {
            "id": make_id("audit"),
            "action": action,
            "actor_id": actor_id,
            "document_id": document_id,
            "details": details,
            "at": iso(),
        }
        self.audit.insert(0, event)
        self.audit = self.audit[:200]
        return event

    def _document(self, document_id: str) -> dict[str, Any]:
        result = next((item for item in self.documents if item["id"] == document_id), None)
        require(result is not None, "document not found")
        return result

    def _member(self, household_id: str, user_id: str) -> dict[str, Any]:
        result = next(
            (
                member
                for member in self.members
                if member["household_id"] == household_id and member["user_id"] == user_id
            ),
            None,
        )
        require(result is not None, "household access denied")
        return result

    def _authorize(self, document: dict[str, Any], user_id: str, minimum: str) -> None:
        member = self._member(document["household_id"], user_id)
        require(ROLES[member["role"]] >= ROLES[minimum], f"{minimum.lower()} access required")

    def request_upload(
        self,
        actor_id: str,
        household_id: str,
        title: str,
        category: str,
        filename: str,
        content_type: str,
        expires_on: str | None,
        issuer: str = "",
        document_number_masked: str = "",
        document_id: str | None = None,
    ) -> dict[str, Any]:
        member = self._member(household_id, actor_id)
        require(ROLES[member["role"]] >= ROLES["EDITOR"], "editor access required")
        if document_id:
            document = self._document(document_id)
            self._authorize(document, actor_id, "EDITOR")
            version_number = 1 + max(
                (item["version"] for item in self.versions if item["document_id"] == document_id),
                default=0,
            )
        else:
            require(title.strip() != "", "title is required")
            document_id = make_id("doc")
            version_number = 1
            document = {
                "id": document_id,
                "household_id": household_id,
                "owner_user_id": actor_id,
                "title": title.strip(),
                "category": category or "Other",
                "issuer": issuer,
                "document_number_masked": document_number_masked,
                "issued_on": None,
                "expires_on": expires_on,
                "reminder_days": 60,
                "state": "UPLOADED",
                "current_version_id": None,
                "renewed_by_document_id": None,
                "created_at": iso(),
                "updated_at": iso(),
                "tags": [],
            }
            self.documents.append(document)
        version_id = make_id("ver")
        object_key = f"{household_id}/{document_id}/{version_id}/{filename}"
        grant = {
            "id": make_id("grant"),
            "token": secrets.token_urlsafe(24),
            "operation": "UPLOAD",
            "document_id": document_id,
            "version_id": version_id,
            "object_key": object_key,
            "actor_id": actor_id,
            "expires_at": iso(utcnow() + timedelta(minutes=10)),
            "used_at": None,
            "metadata": {
                "version": version_number,
                "filename": filename,
                "content_type": content_type,
            },
        }
        self.grants.append(grant)
        self._audit("UPLOAD_GRANT_CREATED", actor_id, document_id, {"version": version_number})
        return {
            "document_id": document_id,
            "version_id": version_id,
            "upload_token": grant["token"],
            "upload_url": f"/api/uploads/{grant['token']}",
            "expires_at": grant["expires_at"],
        }

    def complete_upload(self, token: str, content: bytes, malware: bool = False) -> dict[str, Any]:
        with self._lock:
            grant = next((item for item in self.grants if item["token"] == token), None)
            require(grant is not None and grant["operation"] == "UPLOAD", "upload grant not found")
            require(grant["used_at"] is None, "upload grant already used")
            require(datetime.fromisoformat(grant["expires_at"].replace("Z", "+00:00")) > utcnow(), "upload grant expired")
            require(len(content) > 0, "uploaded content is empty")
            grant["used_at"] = iso()
            self.objects[grant["object_key"]] = bytes(content)
            meta = grant["metadata"]
            version = {
                "id": grant["version_id"],
                "document_id": grant["document_id"],
                "version": meta["version"],
                "filename": meta["filename"],
                "content_type": meta["content_type"],
                "size_bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
                "object_key": grant["object_key"],
                "scan_status": "PENDING",
                "ocr_status": "PENDING",
                "ocr_metadata": {},
                "created_by": grant["actor_id"],
                "created_at": iso(),
                "simulate_malware": malware,
            }
            self.versions.append(version)
            document = self._document(grant["document_id"])
            document["current_version_id"] = version["id"]
            document["state"] = "SCANNING"
            document["updated_at"] = iso()
            for kind in ("VIRUS_SCAN", "OCR_EXTRACT"):
                self.jobs.append(
                    {
                        "id": make_id("job"),
                        "kind": kind,
                        "document_id": document["id"],
                        "version_id": version["id"],
                        "status": "READY",
                        "attempts": 0,
                        "created_at": iso(),
                        "completed_at": None,
                    }
                )
            self._audit("UPLOAD_COMPLETED", grant["actor_id"], document["id"], {"version_id": version["id"]})
            return self.document_view(document["id"], grant["actor_id"], "2026-06-12")

    def worker_tick(self) -> dict[str, Any]:
        job = next((item for item in self.jobs if item["status"] == "READY"), None)
        if not job:
            return {"processed": False}
        job["status"] = "PROCESSING"
        job["attempts"] += 1
        version = next(item for item in self.versions if item["id"] == job["version_id"])
        document = self._document(job["document_id"])
        if job["kind"] == "VIRUS_SCAN":
            if version.pop("simulate_malware", False):
                version["scan_status"] = "INFECTED"
                document["state"] = "QUARANTINED"
                job["status"] = "COMPLETED"
                self._audit("VERSION_QUARANTINED", "worker:scanner", document["id"], {"version_id": version["id"]})
            else:
                version["scan_status"] = "CLEAN"
                job["status"] = "COMPLETED"
                self._audit("VIRUS_SCAN_COMPLETED", "worker:scanner", document["id"], {"result": "CLEAN"})
        else:
            if version["scan_status"] == "INFECTED":
                version["ocr_status"] = "SKIPPED"
            else:
                version["ocr_status"] = "COMPLETED"
                version["ocr_metadata"] = {
                    "issuer": document.get("issuer") or "Detected issuer",
                    "document_number_masked": document.get("document_number_masked") or "•••• 2048",
                    "expires_on": document.get("expires_on"),
                    "confidence": 0.94,
                }
            job["status"] = "COMPLETED"
            self._audit("OCR_COMPLETED", "worker:ocr", document["id"], {"status": version["ocr_status"]})
        job["completed_at"] = iso()
        pending = any(
            item["version_id"] == version["id"] and item["status"] != "COMPLETED"
            for item in self.jobs
        )
        if not pending and document["state"] != "QUARANTINED":
            document["state"] = "READY"
            document["updated_at"] = iso()
        return {"processed": True, "job": job, "document": self.document_view(document["id"], "user-vedant", "2026-06-12")}

    def drain_workers(self, max_jobs: int = 20) -> dict[str, Any]:
        results = []
        for _ in range(max_jobs):
            result = self.worker_tick()
            if not result["processed"]:
                break
            results.append(result["job"])
        return {"processed": len(results), "jobs": results}

    def request_download(self, document_id: str, actor_id: str) -> dict[str, Any]:
        document = self._document(document_id)
        self._authorize(document, actor_id, "VIEWER")
        require(document["state"] != "QUARANTINED", "quarantined documents cannot be downloaded")
        version = next(
            (item for item in self.versions if item["id"] == document["current_version_id"]),
            None,
        )
        require(version is not None and version["scan_status"] == "CLEAN", "clean document version required")
        grant = {
            "id": make_id("grant"),
            "token": secrets.token_urlsafe(24),
            "operation": "DOWNLOAD",
            "document_id": document_id,
            "version_id": version["id"],
            "object_key": version["object_key"],
            "actor_id": actor_id,
            "expires_at": iso(utcnow() + timedelta(minutes=5)),
            "used_at": None,
            "metadata": {"filename": version["filename"], "content_type": version["content_type"]},
        }
        self.grants.append(grant)
        self._audit("DOWNLOAD_GRANT_CREATED", actor_id, document_id, {"version_id": version["id"]})
        return {
            "download_token": grant["token"],
            "download_url": f"/api/downloads/{grant['token']}",
            "expires_at": grant["expires_at"],
        }

    def download(self, token: str) -> dict[str, Any]:
        grant = next((item for item in self.grants if item["token"] == token), None)
        require(grant is not None and grant["operation"] == "DOWNLOAD", "download grant not found")
        require(datetime.fromisoformat(grant["expires_at"].replace("Z", "+00:00")) > utcnow(), "download grant expired")
        grant["used_at"] = iso()
        self._audit("DOCUMENT_DOWNLOADED", grant["actor_id"], grant["document_id"], {"version_id": grant["version_id"]})
        return {
            "content": self.objects[grant["object_key"]],
            "object_key": grant["object_key"],
            "filename": grant["metadata"]["filename"],
            "content_type": grant["metadata"]["content_type"],
        }

    def renew_document(
        self,
        document_id: str,
        actor_id: str,
        title: str,
        expires_on: str,
        filename: str,
    ) -> dict[str, Any]:
        original = self._document(document_id)
        self._authorize(original, actor_id, "EDITOR")
        grant = self.request_upload(
            actor_id=actor_id,
            household_id=original["household_id"],
            title=title or original["title"],
            category=original["category"],
            filename=filename,
            content_type="application/pdf",
            expires_on=expires_on,
            issuer=original["issuer"],
            document_number_masked=original["document_number_masked"],
        )
        original["state"] = "RENEWED"
        original["renewed_by_document_id"] = grant["document_id"]
        original["updated_at"] = iso()
        self._audit("DOCUMENT_RENEWED", actor_id, document_id, {"replacement_id": grant["document_id"]})
        return grant

    def share_document(self, document_id: str, actor_id: str, user_id: str, role: str) -> dict[str, Any]:
        document = self._document(document_id)
        self._authorize(document, actor_id, "OWNER")
        require(role in ROLES, "invalid role")
        household_member = self._member(document["household_id"], user_id)
        household_member["role"] = role
        self._audit("ACCESS_UPDATED", actor_id, document_id, {"user_id": user_id, "role": role})
        return household_member

    def refresh_reminders(self, as_of: str) -> list[dict[str, Any]]:
        existing = {(item["document_id"], item["due_on"]) for item in self.reminders if item["status"] == "PENDING"}
        created = []
        for document in self.documents:
            state = lifecycle_state(document, as_of)
            document["computed_state"] = state
            if state not in {"EXPIRING", "EXPIRED"}:
                continue
            due_on = document["expires_on"]
            if (document["id"], due_on) in existing:
                continue
            reminder = {
                "id": make_id("rem"),
                "document_id": document["id"],
                "type": "EXPIRED" if state == "EXPIRED" else "RENEWAL_DUE",
                "channel": "email",
                "status": "PENDING",
                "due_on": due_on,
                "created_at": iso(),
            }
            self.reminders.append(reminder)
            created.append(reminder)
        if created:
            self._audit("REMINDERS_CREATED", "worker:reminders", None, {"count": len(created)})
        return created

    def document_view(self, document_id: str, actor_id: str, as_of: str) -> dict[str, Any]:
        document = self._document(document_id)
        self._authorize(document, actor_id, "VIEWER")
        versions = sorted(
            (item for item in self.versions if item["document_id"] == document_id),
            key=lambda item: item["version"],
            reverse=True,
        )
        owner = next(item for item in self.members if item["user_id"] == document["owner_user_id"])
        return {
            **document,
            "state": lifecycle_state(document, as_of),
            "owner": owner,
            "versions": versions,
            "reminders": [item for item in self.reminders if item["document_id"] == document_id],
            "audit": [item for item in self.audit if item["document_id"] == document_id][:20],
            "days_until_expiry": (
                days_between(as_of, document["expires_on"]) if document.get("expires_on") else None
            ),
        }

    def snapshot(
        self, household_id: str = "household-maple", actor_id: str = "user-vedant", as_of: str = "2026-06-12"
    ) -> dict[str, Any]:
        self._member(household_id, actor_id)
        documents = [
            self.document_view(item["id"], actor_id, as_of)
            for item in self.documents
            if item["household_id"] == household_id
        ]
        rank = {"QUARANTINED": 0, "EXPIRED": 1, "EXPIRING": 2, "SCANNING": 3, "UPLOADED": 4, "READY": 5, "RENEWED": 6}
        documents.sort(key=lambda item: (rank[item["state"]], item.get("expires_on") or "9999"))
        household = next(item for item in self.households if item["id"] == household_id)
        pending_jobs = [item for item in self.jobs if item["status"] != "COMPLETED"]
        return {
            "household": household,
            "members": [item for item in self.members if item["household_id"] == household_id],
            "documents": documents,
            "jobs": self.jobs[:30],
            "reminders": self.reminders,
            "audit": self.audit[:40],
            "metrics": {
                "documents": len(documents),
                "expiring": sum(item["state"] == "EXPIRING" for item in documents),
                "expired": sum(item["state"] == "EXPIRED" for item in documents),
                "quarantined": sum(item["state"] == "QUARANTINED" for item in documents),
                "pending_jobs": len(pending_jobs),
                "pending_reminders": sum(item["status"] == "PENDING" for item in self.reminders),
                "downloads": sum(item["action"] == "DOCUMENT_DOWNLOADED" for item in self.audit),
            },
        }


def seeded_service() -> VaultService:
    service = VaultService()
    service.seed()
    return service
