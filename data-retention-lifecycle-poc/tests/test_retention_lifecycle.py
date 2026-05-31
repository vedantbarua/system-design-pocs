import tempfile
import unittest
from pathlib import Path

from app import RetentionLifecycle, now_ts


DAY = 24 * 60 * 60


class RetentionLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "retention.db"
        self.retention = RetentionLifecycle(self.db_path)
        self.retention.seed_if_empty()

    def tearDown(self):
        self.retention.close()
        self.temp_dir.cleanup()

    def test_exact_policy_match_wins_over_global_policy(self):
        record = self.retention.get_record("rec-eu-marketing-expired")

        self.assertEqual("policy.eu.marketing-delete", record["matched_policy"]["policy_id"])

    def test_global_policy_matches_when_region_specific_policy_missing(self):
        record = self.retention.get_record("rec-billing-hold")

        self.assertEqual("policy.global.billing-delete", record["matched_policy"]["policy_id"])

    def test_expired_record_enqueues_delete_job(self):
        scan = self.retention.scan(actor="test")
        record = self.retention.get_record("rec-eu-marketing-expired")

        delete_decisions = [item for item in scan["decisions"] if item["record_id"] == "rec-eu-marketing-expired"]
        self.assertEqual("DELETE", delete_decisions[0]["action"])
        self.assertIsNotNone(delete_decisions[0]["job_id"])
        self.assertEqual("DELETION_PENDING", record["state"])

    def test_archive_threshold_enqueues_archive_job(self):
        scan = self.retention.scan(actor="test")
        record = self.retention.get_record("rec-us-analytics-archive")

        archive_decisions = [item for item in scan["decisions"] if item["record_id"] == "rec-us-analytics-archive"]
        self.assertEqual("ARCHIVE", archive_decisions[0]["action"])
        self.assertEqual("ARCHIVED", record["state"])

    def test_legal_hold_blocks_terminal_action(self):
        scan = self.retention.scan(actor="test")

        hold_decision = [item for item in scan["decisions"] if item["record_id"] == "rec-billing-hold"][0]
        self.assertEqual("LEGAL_HOLD", hold_decision["action"])
        self.assertFalse(hold_decision["allowed"])
        self.assertIsNone(hold_decision["job_id"])

    def test_run_queued_jobs_deletes_and_archives_records(self):
        self.retention.scan(actor="test")
        result = self.retention.run_queued_jobs(actor="worker")

        deleted = self.retention.get_record("rec-eu-marketing-expired")
        archived = self.retention.get_record("rec-us-analytics-archive")

        self.assertGreaterEqual(result["completed_count"], 2)
        self.assertEqual("DELETED", deleted["state"])
        self.assertEqual({"deleted": True}, deleted["metadata"])
        self.assertEqual("ARCHIVED", archived["state"])

    def test_anonymize_terminal_action_scrubs_subject_and_metadata(self):
        old = now_ts() - 800 * DAY
        self.retention.register_record(
            {
                "record_id": "rec-us-analytics-expired",
                "data_type": "event",
                "region": "US",
                "purpose": "analytics",
                "owner_service": "metrics-pipeline",
                "subject_id": "user-us-2",
                "created_at": old,
                "last_accessed_at": old,
                "metadata": {"event": "purchase", "ip": "203.0.113.10"},
            }
        )

        self.retention.scan(actor="test")
        self.retention.run_queued_jobs(actor="worker")
        record = self.retention.get_record("rec-us-analytics-expired")

        self.assertEqual("ANONYMIZED", record["state"])
        self.assertEqual("anon", record["subject_id"])
        self.assertEqual({"anonymized": True}, record["metadata"])

    def test_no_matching_policy_retains_record(self):
        self.retention.register_record(
            {
                "record_id": "rec-unmanaged",
                "data_type": "support-ticket",
                "region": "US",
                "purpose": "support",
                "owner_service": "support-platform",
                "subject_id": "ticket-1",
                "created_at": now_ts() - 5000 * DAY,
                "last_accessed_at": now_ts() - 4000 * DAY,
            }
        )

        decision = self.retention.evaluate_record("rec-unmanaged", now_ts(), actor="test")

        self.assertEqual("RETAIN", decision["action"])
        self.assertIn("no matching", decision["reason"])

    def test_releasing_legal_hold_allows_future_delete(self):
        self.retention.release_legal_hold("rec-billing-hold", actor="legal")

        decision = self.retention.evaluate_record("rec-billing-hold", now_ts(), actor="test")

        self.assertEqual("DELETE", decision["action"])
        self.assertTrue(decision["allowed"])

    def test_snapshot_counts_jobs_and_holds(self):
        self.retention.scan(actor="test")
        snapshot = self.retention.snapshot()

        self.assertEqual(3, snapshot["policy_count"])
        self.assertGreaterEqual(snapshot["queued_job_count"], 2)
        self.assertEqual(1, snapshot["legal_hold_count"])

    def test_audit_log_records_scan_and_job_completion(self):
        self.retention.scan(actor="scanner")
        self.retention.run_queued_jobs(actor="worker")

        audit = self.retention.list_audit()

        self.assertTrue(any(item["action"] == "retention_scan" for item in audit))
        self.assertTrue(any(item["actor"] == "worker" for item in audit))


if __name__ == "__main__":
    unittest.main()
