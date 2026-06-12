import unittest

from core import lifecycle_state, seeded_service


class VaultServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = seeded_service()

    def test_lifecycle_derives_expiring_and_expired(self):
        self.assertEqual(
            lifecycle_state({"state": "READY", "expires_on": "2026-06-18", "reminder_days": 30}, "2026-06-12"),
            "EXPIRING",
        )
        self.assertEqual(
            lifecycle_state({"state": "READY", "expires_on": "2026-05-30", "reminder_days": 30}, "2026-06-12"),
            "EXPIRED",
        )

    def test_upload_grant_is_single_use_and_creates_jobs(self):
        grant = self.service.request_upload(
            "user-vedant", "household-maple", "Birth Certificate", "Identity",
            "birth.pdf", "application/pdf", None
        )
        result = self.service.complete_upload(grant["upload_token"], b"protected bytes")
        self.assertEqual(result["state"], "SCANNING")
        self.assertEqual(len([job for job in self.service.jobs if job["document_id"] == grant["document_id"]]), 2)
        with self.assertRaisesRegex(ValueError, "already used"):
            self.service.complete_upload(grant["upload_token"], b"again")

    def test_worker_drain_marks_clean_upload_ready_and_extracts_metadata(self):
        grant = self.service.request_upload(
            "user-vedant", "household-maple", "Travel Visa", "Identity",
            "visa.pdf", "application/pdf", "2026-12-01", issuer="Consulate"
        )
        self.service.complete_upload(grant["upload_token"], b"visa content")
        self.service.drain_workers()
        document = self.service.document_view(grant["document_id"], "user-vedant", "2026-06-12")
        self.assertEqual(document["state"], "READY")
        self.assertEqual(document["versions"][0]["scan_status"], "CLEAN")
        self.assertEqual(document["versions"][0]["ocr_status"], "COMPLETED")

    def test_malware_upload_is_quarantined_and_cannot_be_downloaded(self):
        grant = self.service.request_upload(
            "user-vedant", "household-maple", "Suspicious File", "Other",
            "suspicious.pdf", "application/pdf", None
        )
        self.service.complete_upload(grant["upload_token"], b"malware demo", malware=True)
        self.service.drain_workers()
        document = self.service.document_view(grant["document_id"], "user-vedant", "2026-06-12")
        self.assertEqual(document["state"], "QUARANTINED")
        with self.assertRaisesRegex(ValueError, "quarantined"):
            self.service.request_download(grant["document_id"], "user-vedant")

    def test_viewer_can_download_clean_document_and_action_is_audited(self):
        grant = self.service.request_download("doc-license", "user-parent")
        result = self.service.download(grant["download_token"])
        self.assertGreater(len(result["content"]), 0)
        self.assertTrue(any(event["action"] == "DOCUMENT_DOWNLOADED" for event in self.service.audit))

    def test_viewer_cannot_create_upload(self):
        with self.assertRaisesRegex(ValueError, "editor access required"):
            self.service.request_upload(
                "user-parent", "household-maple", "Blocked", "Other",
                "blocked.pdf", "application/pdf", None
            )

    def test_version_upload_preserves_history(self):
        grant = self.service.request_upload(
            "user-vedant", "household-maple", "US Passport", "Identity",
            "passport-v3.pdf", "application/pdf", "2027-08-19", document_id="doc-passport"
        )
        self.service.complete_upload(grant["upload_token"], b"version three")
        versions = self.service.document_view("doc-passport", "user-vedant", "2026-06-12")["versions"]
        self.assertEqual([item["version"] for item in versions], [3, 2, 1])

    def test_renewal_links_original_to_replacement(self):
        grant = self.service.renew_document(
            "doc-license", "user-vedant", "Illinois Driver License",
            "2030-07-03", "license-renewed.pdf"
        )
        original = self.service.document_view("doc-license", "user-vedant", "2026-06-12")
        self.assertEqual(original["state"], "RENEWED")
        self.assertEqual(original["renewed_by_document_id"], grant["document_id"])

    def test_reminders_are_idempotent(self):
        before = len(self.service.reminders)
        created = self.service.refresh_reminders("2026-06-12")
        self.assertEqual(len(created), 0)
        self.assertEqual(len(self.service.reminders), before)

    def test_owner_can_update_household_access(self):
        member = self.service.share_document("doc-passport", "user-vedant", "user-parent", "EDITOR")
        self.assertEqual(member["role"], "EDITOR")

    def test_snapshot_summarizes_operational_state(self):
        snapshot = self.service.snapshot(as_of="2026-06-12")
        self.assertEqual(snapshot["metrics"]["documents"], 5)
        self.assertEqual(snapshot["metrics"]["expiring"], 3)
        self.assertEqual(snapshot["metrics"]["expired"], 1)
        self.assertEqual(snapshot["metrics"]["pending_reminders"], 4)


if __name__ == "__main__":
    unittest.main()
