import tempfile
import unittest
from pathlib import Path

from app import DataSubjectRightsOrchestrator, now_ts


class DataSubjectRightsOrchestratorTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "dsar.db"
        self.orchestrator = DataSubjectRightsOrchestrator(self.db_path)
        self.orchestrator.seed_if_empty()

    def tearDown(self):
        self.orchestrator.close()
        self.temp_dir.cleanup()

    def test_request_intake_fans_out_to_supporting_services(self):
        request = self.orchestrator.get_request("dsar-export-ada")

        self.assertEqual("EXPORT", request["request_type"])
        self.assertEqual("IN_PROGRESS", request["status"])
        self.assertEqual(
            ["analytics-service", "billing-service", "profile-service"],
            [task["service_id"] for task in request["tasks"]],
        )

    def test_run_tasks_retries_flaky_downstream_service(self):
        first = self.orchestrator.run_tasks(actor="worker")
        analytics = [task for task in first["tasks"] if task["service_id"] == "analytics-service"][0]

        self.assertEqual("FAILED", analytics["status"])
        self.assertEqual(1, analytics["attempt_count"])

        self.orchestrator.run_tasks(actor="worker")
        third = self.orchestrator.run_tasks(actor="worker")
        analytics = [task for task in third["tasks"] if task["service_id"] == "analytics-service"][0]

        self.assertEqual("COMPLETED", analytics["status"])
        self.assertEqual(3, analytics["attempt_count"])
        self.assertEqual("COMPLETED", self.orchestrator.get_request("dsar-export-ada")["status"])

    def test_export_bundle_requires_completed_request(self):
        with self.assertRaises(ValueError):
            self.orchestrator.assemble_export_bundle("dsar-export-ada")

    def test_export_bundle_assembles_completed_service_results(self):
        self.orchestrator.run_tasks(actor="worker")
        self.orchestrator.run_tasks(actor="worker")
        self.orchestrator.run_tasks(actor="worker")

        bundle = self.orchestrator.assemble_export_bundle("dsar-export-ada", actor="privacy-ops")

        self.assertEqual("dsar-export-ada", bundle["request_id"])
        self.assertEqual(3, bundle["service_count"])
        self.assertEqual(3, len(bundle["records"]))

    def test_delete_request_is_blocked_by_billing_legal_hold(self):
        request = self.orchestrator.create_request(
            {"subject_id": "acct-123", "request_type": "DELETE"},
            actor="privacy-ops",
        )

        self.orchestrator.run_tasks(actor="worker")
        updated = self.orchestrator.get_request(request["request_id"])

        self.assertEqual("BLOCKED", updated["status"])
        blocked = [task for task in updated["tasks"] if task["service_id"] == "billing-service"][0]
        self.assertEqual("BLOCKED", blocked["status"])
        self.assertIn("legal hold", blocked["error"])

    def test_deletion_receipts_return_completed_service_receipts(self):
        request = self.orchestrator.create_request(
            {"subject_id": "user-us-1", "request_type": "DELETE"},
            actor="privacy-ops",
        )

        self.orchestrator.run_tasks(actor="worker")
        receipts = self.orchestrator.deletion_receipts(request["request_id"])

        self.assertEqual("BLOCKED", receipts["status"])
        self.assertTrue(any(item["service"] == "profile-service" for item in receipts["receipts"]))

    def test_correct_request_only_targets_services_that_support_correction(self):
        request = self.orchestrator.create_request(
            {
                "subject_id": "user-eu-1",
                "request_type": "CORRECT",
                "payload": {"email": "new@example.eu"},
            }
        )

        services = [task["service_id"] for task in request["tasks"]]

        self.assertEqual(["billing-service", "profile-service"], services)

    def test_restrict_processing_targets_non_billing_processors(self):
        request = self.orchestrator.create_request(
            {"subject_id": "user-eu-1", "request_type": "RESTRICT_PROCESSING"}
        )

        services = [task["service_id"] for task in request["tasks"]]

        self.assertEqual(["analytics-service", "profile-service"], services)

    def test_overdue_request_is_reported_in_snapshot(self):
        self.orchestrator.create_request(
            {
                "subject_id": "user-late",
                "request_type": "EXPORT",
                "due_at": now_ts() - 60,
            }
        )

        snapshot = self.orchestrator.snapshot()

        self.assertEqual(1, snapshot["overdue_request_count"])

    def test_task_timeout_marks_task_failed(self):
        self.orchestrator.upsert_service(
            {
                "service_id": "tiny-timeout-service",
                "owner_team": "test",
                "supports": ["EXPORT"],
                "data_scope": "test data",
                "timeout_seconds": 1,
            }
        )
        request = self.orchestrator.create_request(
            {"subject_id": "user-timeout", "request_type": "EXPORT"},
            actor="privacy-ops",
        )
        task = [task for task in request["tasks"] if task["service_id"] == "tiny-timeout-service"][0]

        updated = self.orchestrator.process_task(task["task_id"], timestamp=now_ts() + 5)

        self.assertEqual("FAILED", updated["status"])
        self.assertIn("timed out", updated["error"])

    def test_audit_tracks_request_and_task_transitions(self):
        self.orchestrator.run_tasks(actor="worker")

        audit = self.orchestrator.list_audit()

        self.assertTrue(any(item["action"] == "create_request" for item in audit))
        self.assertTrue(any(item["action"] == "transition_task" for item in audit))


if __name__ == "__main__":
    unittest.main()
