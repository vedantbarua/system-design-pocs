import tempfile
import unittest
from pathlib import Path

from app import PrivacyConsent, now_ts


class PrivacyConsentTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "privacy.db"
        self.privacy = PrivacyConsent(self.db_path)
        self.privacy.seed_if_empty()

    def tearDown(self):
        self.privacy.close()
        self.temp_dir.cleanup()

    def test_eu_marketing_without_consent_is_denied(self):
        decision = self.privacy.check_decision({"user_id": "user-eu-1", "purpose": "marketing"})

        self.assertFalse(decision["allowed"])
        self.assertIn("requires explicit consent", decision["reason"])

    def test_granted_consent_allows_processing_decision(self):
        consent = self.privacy.record_consent(
            {
                "user_id": "user-eu-1",
                "purpose": "marketing",
                "status": "GRANTED",
                "source": "preference-center",
                "policy_version": "privacy-2026.05",
            }
        )

        decision = self.privacy.check_decision({"user_id": "user-eu-1", "purpose": "marketing"})

        self.assertTrue(decision["allowed"])
        self.assertEqual(consent["version"], decision["consent_version"])

    def test_revocation_wins_over_previous_grant(self):
        self.privacy.record_consent(
            {
                "user_id": "user-eu-1",
                "purpose": "marketing",
                "status": "GRANTED",
                "source": "preference-center",
                "policy_version": "privacy-2026.05",
            }
        )
        revoked = self.privacy.revoke_consent("user-eu-1", "marketing", notes="User opted out.")

        decision = self.privacy.check_decision({"user_id": "user-eu-1", "purpose": "marketing"})

        self.assertEqual("REVOKED", revoked["status"])
        self.assertEqual(2, revoked["version"])
        self.assertFalse(decision["allowed"])
        self.assertIn("revoked", decision["reason"])

    def test_us_analytics_is_allowed_by_regional_default(self):
        decision = self.privacy.check_decision({"user_id": "user-us-1", "purpose": "analytics"})

        self.assertTrue(decision["allowed"])
        self.assertIsNone(decision["consent_version"])
        self.assertIn("regional default", decision["reason"])

    def test_expired_grant_blocks_processing(self):
        self.privacy.record_consent(
            {
                "user_id": "user-us-1",
                "purpose": "personalization",
                "status": "GRANTED",
                "source": "preference-center",
                "policy_version": "privacy-2026.05",
                "expires_at": now_ts() - 10,
            }
        )

        event = self.privacy.record_processing_event(
            {
                "user_id": "user-us-1",
                "purpose": "personalization",
                "processor": "recommendations",
                "resource": "home_feed",
            }
        )

        self.assertFalse(event["allowed"])
        self.assertIn("expired", event["reason"])

    def test_processing_event_records_allowed_and_denied_decisions(self):
        denied = self.privacy.record_processing_event(
            {
                "user_id": "user-eu-1",
                "purpose": "marketing",
                "processor": "campaign-service",
                "resource": "newsletter",
            }
        )
        allowed = self.privacy.record_processing_event(
            {
                "user_id": "user-eu-1",
                "purpose": "analytics",
                "processor": "metrics-pipeline",
                "resource": "page_view",
            }
        )

        snapshot = self.privacy.snapshot()

        self.assertFalse(denied["allowed"])
        self.assertTrue(allowed["allowed"])
        self.assertGreaterEqual(snapshot["policy_violation_count"], 1)

    def test_dsar_export_request_has_due_date_and_open_status(self):
        request = self.privacy.create_dsar({"user_id": "user-eu-1", "request_type": "EXPORT"}, actor="privacy-ops")

        self.assertEqual("REQUESTED", request["status"])
        self.assertEqual("EXPORT", request["request_type"])
        self.assertGreater(request["due_at"], request["requested_at"])
        self.assertEqual(1, self.privacy.snapshot()["open_dsar_count"])

    def test_dsar_delete_completion_revokes_active_purposes(self):
        self.privacy.record_consent(
            {
                "user_id": "user-us-1",
                "purpose": "ads",
                "status": "GRANTED",
                "source": "settings",
                "policy_version": "privacy-2026.05",
            }
        )
        request = self.privacy.create_dsar({"user_id": "user-us-1", "request_type": "DELETE"}, actor="privacy-ops")

        completed = self.privacy.complete_dsar(request["request_id"], actor="privacy-ops")

        self.assertEqual("COMPLETED", completed["status"])
        self.assertEqual("REVOKED", self.privacy.latest_consent("user-us-1", "ads")["status"])
        self.assertEqual("REVOKED", self.privacy.latest_consent("user-us-1", "marketing")["status"])

    def test_audit_log_tracks_writes_and_decisions(self):
        self.privacy.check_decision({"user_id": "user-eu-1", "purpose": "ads"}, actor="auditor")

        audit = self.privacy.list_audit()

        self.assertTrue(any(item["action"] == "decision_check" for item in audit))
        self.assertTrue(any(item["actor"] == "auditor" for item in audit))


if __name__ == "__main__":
    unittest.main()
