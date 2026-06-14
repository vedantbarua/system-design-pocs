import unittest

from core import seeded_service


class SafetyServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = seeded_service()

    def test_snapshot_has_operational_state(self):
        snapshot = self.service.snapshot()
        self.assertEqual(snapshot["metrics"]["members"], 3)
        self.assertEqual(snapshot["metrics"]["open"], 1)
        self.assertEqual(snapshot["metrics"]["escalated"], 1)
        self.assertEqual(snapshot["metrics"]["active_locations"], 1)

    def test_create_checkin_validates_window(self):
        with self.assertRaisesRegex(ValueError, "open time must precede due time"):
            self.service.create_checkin(
                "household-maple",
                "user-vedant",
                "user-maya",
                "Invalid",
                "Home",
                "2026-06-15T01:00:00Z",
                "2026-06-15T00:00:00Z",
                20,
            )

    def test_member_cannot_create_for_another_member(self):
        with self.assertRaisesRegex(ValueError, "trusted contact access required"):
            self.service.create_checkin(
                "household-maple",
                "user-maya",
                "user-parent",
                "Pickup",
                "Home",
                "2026-06-15T01:00:00Z",
                "2026-06-15T02:00:00Z",
                20,
            )

    def test_acknowledgement_is_idempotent(self):
        first = self.service.acknowledge(
            "checkin-commute", "user-maya", "ack-command-1", "Home safe"
        )
        second = self.service.acknowledge(
            "checkin-commute", "user-maya", "ack-command-1", "Different"
        )
        self.assertEqual(first, second)
        self.assertEqual(
            len([item for item in self.service.jobs if item["kind"] == "SAFE_CONFIRMATION"]),
            1,
        )

    def test_late_acknowledgement_closes_escalation(self):
        result = self.service.acknowledge(
            "checkin-late-shift",
            "user-maya",
            "late-ack",
            "Phone battery died",
            "2026-06-14T19:10:00Z",
        )
        self.assertEqual(result["state"], "ACKNOWLEDGED")
        self.assertEqual(self.service.events[0]["kind"], "LATE_ACKNOWLEDGEMENT")

    def test_scheduler_transitions_open_to_late_then_escalated(self):
        first = self.service.run_scheduler("2026-06-15T00:10:00Z")
        self.assertEqual(first["late"], 1)
        self.assertEqual(self.service._checkin("checkin-commute")["state"], "LATE")
        second = self.service.run_scheduler("2026-06-15T00:21:00Z")
        self.assertEqual(second["escalated"], 1)
        self.assertEqual(self.service._checkin("checkin-commute")["state"], "ESCALATED")

    def test_scheduler_is_job_idempotent(self):
        self.service.run_scheduler("2026-06-15T00:21:00Z")
        count = len(self.service.jobs)
        self.service.run_scheduler("2026-06-15T00:21:00Z")
        self.assertEqual(len(self.service.jobs), count)

    def test_location_rejects_stale_sequence(self):
        with self.assertRaisesRegex(ValueError, "stale location sequence"):
            self.service.update_location(
                "user-maya",
                "user-maya",
                4,
                41.9,
                -87.63,
                20,
                "Station",
                "2026-06-14T23:44:00Z",
            )

    def test_location_update_accepts_new_sequence(self):
        result = self.service.update_location(
            "user-maya",
            "user-maya",
            5,
            41.9001,
            -87.6301,
            16,
            "Train station",
            "2026-06-14T23:44:00Z",
        )
        self.assertEqual(result["sequence"], 5)
        self.assertEqual(result["label"], "Train station")

    def test_location_expires_by_ttl(self):
        result = self.service.run_scheduler("2026-06-15T01:01:00Z")
        self.assertEqual(result["expired_locations"], 1)
        self.assertEqual(self.service.snapshot(now="2026-06-15T01:01:00Z")["metrics"]["active_locations"], 0)

    def test_offline_sync_deduplicates_client_events(self):
        events = [
            {
                "client_event_id": "offline-1",
                "kind": "CHECKIN_ACKNOWLEDGED",
                "occurred_at": "2026-06-14T23:40:00Z",
                "payload": {"checkin_id": "checkin-commute", "message": "Arrived"},
            }
        ]
        first = self.service.sync_events("user-maya", events)
        second = self.service.sync_events("user-maya", events)
        self.assertEqual(len(first["accepted"]), 1)
        self.assertEqual(second["duplicates"], ["offline-1"])

    def test_offline_sync_rejects_stale_location_without_losing_batch(self):
        result = self.service.sync_events(
            "user-maya",
            [
                {
                    "client_event_id": "offline-location",
                    "kind": "LOCATION_UPDATED",
                    "occurred_at": "2026-06-14T23:44:00Z",
                    "payload": {
                        "member_id": "user-maya",
                        "sequence": 4,
                        "latitude": 41.9,
                        "longitude": -87.63,
                        "accuracy_meters": 20,
                        "label": "Stale",
                    },
                }
            ],
        )
        self.assertEqual(len(result["rejected"]), 1)

    def test_worker_retries_and_recovers(self):
        self.service.fail_next_delivery = True
        first = self.service.worker_tick()
        self.assertEqual(first["job"]["status"], "RETRY")
        second = self.service.worker_tick()
        self.assertEqual(second["job"]["status"], "COMPLETED")
        self.assertGreater(len(self.service.deliveries), 0)

    def test_delivery_is_deduplicated_on_job_replay(self):
        job = self.service.jobs[0]
        self.service.worker_tick()
        count = len(self.service.deliveries)
        job["status"] = "READY"
        self.service.worker_tick()
        self.assertEqual(len(self.service.deliveries), count)

    def test_cancel_requires_authorized_actor(self):
        with self.assertRaisesRegex(ValueError, "check-in access denied"):
            self.service.cancel_checkin("checkin-airport", "user-maya", "No longer needed")


if __name__ == "__main__":
    unittest.main()
