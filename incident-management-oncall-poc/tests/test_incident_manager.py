import tempfile
import unittest
from pathlib import Path

from app import IncidentManager, now_ts


class IncidentManagerTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "incidents.db"
        self.manager = IncidentManager(self.db_path)
        self.manager.seed_if_empty()

    def tearDown(self):
        self.manager.close()
        self.temp_dir.cleanup()

    def ingest_payment_alert(self):
        return self.manager.ingest_alert(
            {
                "service_name": "payments-api",
                "severity": "SEV1",
                "summary": "Payment authorization failures above threshold",
                "alert_key": "payment-auth-failures",
                "labels": {"region": "us-east-1"},
            }
        )

    def test_ingesting_alert_creates_incident_and_pages_primary(self):
        result = self.ingest_payment_alert()

        self.assertFalse(result["deduplicated"])
        self.assertEqual("OPEN", result["incident"]["status"])
        self.assertEqual("alice@company.test", result["incident"]["current_responder"])
        self.assertEqual("payments", result["incident"]["owner_team"])
        self.assertEqual(1, result["alert"]["occurrence_count"])

    def test_duplicate_alert_increments_count_without_new_incident(self):
        first = self.ingest_payment_alert()
        second = self.ingest_payment_alert()

        self.assertTrue(second["deduplicated"])
        self.assertEqual(first["incident"]["incident_id"], second["incident"]["incident_id"])
        self.assertEqual(2, second["alert"]["occurrence_count"])
        self.assertEqual(1, len(self.manager.list_incidents()))

    def test_incident_lifecycle_ack_mitigate_resolve(self):
        incident_id = self.ingest_payment_alert()["incident"]["incident_id"]

        acknowledged = self.manager.acknowledge(incident_id, "alice@company.test", "Looking now.")
        mitigated = self.manager.mitigate(incident_id, "alice@company.test", "Rolled back bad deploy.")
        resolved = self.manager.resolve(incident_id, "alice@company.test", "Error rate is back to normal.")

        self.assertEqual("ACKNOWLEDGED", acknowledged["status"])
        self.assertEqual("MITIGATED", mitigated["status"])
        self.assertEqual("RESOLVED", resolved["status"])
        self.assertIsNotNone(resolved["acknowledged_at"])
        self.assertIsNotNone(resolved["mitigated_at"])
        self.assertIsNotNone(resolved["resolved_at"])
        self.assertEqual("RESOLVED", self.manager.list_alerts()[0]["status"])

    def test_escalation_routes_unacknowledged_incident_to_next_level(self):
        incident = self.ingest_payment_alert()["incident"]
        old_created_at = now_ts() - 11 * 60
        self.manager.conn.execute(
            "UPDATE incidents SET created_at = ? WHERE incident_id = ?",
            (old_created_at, incident["incident_id"]),
        )
        self.manager.conn.commit()

        result = self.manager.check_escalations()
        escalated = self.manager.get_incident(incident["incident_id"])

        self.assertEqual(1, result["escalated_count"])
        self.assertEqual(1, escalated["escalation_level"])
        self.assertEqual("bob@company.test", escalated["current_responder"])

    def test_acknowledged_incident_does_not_escalate(self):
        incident = self.ingest_payment_alert()["incident"]
        self.manager.acknowledge(incident["incident_id"], "alice@company.test", "Taking it.")
        old_created_at = now_ts() - 60 * 60
        self.manager.conn.execute(
            "UPDATE incidents SET created_at = ? WHERE incident_id = ?",
            (old_created_at, incident["incident_id"]),
        )
        self.manager.conn.commit()

        result = self.manager.check_escalations()
        current = self.manager.get_incident(incident["incident_id"])

        self.assertEqual(0, result["escalated_count"])
        self.assertEqual(0, current["escalation_level"])

    def test_slo_breach_count_tracks_open_incidents_past_breach_time(self):
        incident = self.ingest_payment_alert()["incident"]
        self.manager.conn.execute(
            "UPDATE incidents SET breach_at = ? WHERE incident_id = ?",
            (now_ts() - 1, incident["incident_id"]),
        )
        self.manager.conn.commit()

        snapshot = self.manager.snapshot()

        self.assertEqual(1, snapshot["slo_breach_count"])

    def test_action_items_can_be_created_and_completed(self):
        incident_id = self.ingest_payment_alert()["incident"]["incident_id"]
        item = self.manager.add_action_item(
            incident_id,
            {"description": "Add payment gateway rollback guardrail.", "owner": "payments-platform"},
        )

        completed = self.manager.complete_action_item(item["action_id"])
        incident = self.manager.get_incident(incident_id)

        self.assertEqual("OPEN", item["status"])
        self.assertEqual("DONE", completed["status"])
        self.assertEqual("DONE", incident["action_items"][0]["status"])

    def test_resolved_fingerprint_can_create_new_incident_when_alert_recurs(self):
        first = self.ingest_payment_alert()
        self.manager.resolve(first["incident"]["incident_id"], "alice@company.test", "Recovered.")

        second = self.ingest_payment_alert()

        self.assertFalse(second["deduplicated"])
        self.assertNotEqual(first["incident"]["incident_id"], second["incident"]["incident_id"])
        self.assertEqual("OPEN", second["alert"]["status"])
        self.assertEqual(second["incident"]["incident_id"], second["alert"]["incident_id"])


if __name__ == "__main__":
    unittest.main()
