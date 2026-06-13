import unittest

from core import local_occurrence, seeded_service


class MedicationServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = seeded_service()

    def test_timezone_occurrence_uses_dst_offset(self):
        self.assertEqual(local_occurrence("2026-06-13", "08:00", "America/Chicago"), "2026-06-13T13:00:00Z")

    def test_materialization_is_idempotent(self):
        first = self.service.materialize_doses("2026-06-14")
        second = self.service.materialize_doses("2026-06-14")
        self.assertEqual(first["created"], 7)
        self.assertEqual(second["created"], 0)

    def test_taken_dose_decrements_inventory_once(self):
        dose = self.service._dose_by_key("med-metformin", "2026-06-13", "20:00")
        before = self.service._medication("med-metformin")["quantity_on_hand"]
        result = self.service.mark_dose(dose["id"], "user-vedant", "TAKEN", "dose-command-1")
        replay = self.service.mark_dose(dose["id"], "user-vedant", "TAKEN", "dose-command-1")
        self.assertEqual(result, replay)
        self.assertEqual(self.service._medication("med-metformin")["quantity_on_hand"], before - 1)
        self.assertEqual(len([item for item in self.service.inventory_ledger if item["reference"] == f"dose:{dose['id']}"]), 1)

    def test_viewer_cannot_resolve_dose(self):
        dose = self.service._dose_by_key("med-metformin", "2026-06-13", "20:00")
        with self.assertRaisesRegex(ValueError, "caregiver access required"):
            self.service.mark_dose(dose["id"], "user-parent", "TAKEN", "viewer-command")

    def test_skipped_dose_does_not_decrement_inventory(self):
        dose = self.service._dose_by_key("med-amoxicillin", "2026-06-13", "20:00")
        before = self.service._medication("med-amoxicillin")["quantity_on_hand"]
        self.service.mark_dose(dose["id"], "user-maya", "SKIPPED", "skip-command")
        self.assertEqual(self.service._medication("med-amoxicillin")["quantity_on_hand"], before)

    def test_inventory_reference_is_idempotent(self):
        first = self.service.adjust_inventory("med-lisinopril", "user-maya", 30, "REFILL", "external-rx-1")
        second = self.service.adjust_inventory("med-lisinopril", "user-maya", 30, "REFILL", "external-rx-1")
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(self.service._medication("med-lisinopril")["quantity_on_hand"], 42)

    def test_open_refill_is_deduplicated(self):
        first = self.service.request_refill("med-lisinopril", "user-vedant", 30, "refill-command-1")
        second = self.service.request_refill("med-lisinopril", "user-vedant", 90, "refill-command-2")
        self.assertEqual(first["id"], second["id"])

    def test_completed_refill_adds_inventory_once(self):
        refill = self.service.request_refill("med-lisinopril", "user-vedant", 30, "refill-complete")
        before = self.service._medication("med-lisinopril")["quantity_on_hand"]
        self.service.update_refill(refill["id"], "user-maya", "COMPLETED")
        self.assertEqual(self.service._medication("med-lisinopril")["quantity_on_hand"], before + 30)
        with self.assertRaisesRegex(ValueError, "already closed"):
            self.service.update_refill(refill["id"], "user-maya", "COMPLETED")

    def test_scheduler_marks_overdue_dose_and_deduplicates_jobs(self):
        first = self.service.run_scheduler("2026-06-14T04:30:00Z")
        jobs_after_first = len(self.service.jobs)
        second = self.service.run_scheduler("2026-06-14T04:30:00Z")
        self.assertGreater(first["missed"], 0)
        self.assertEqual(second["missed"], 0)
        self.assertEqual(len(self.service.jobs), jobs_after_first)

    def test_worker_retries_provider_failure(self):
        self.service.fail_next_delivery = True
        first = self.service.worker_tick()
        self.assertEqual(first["job"]["status"], "RETRY")
        second = self.service.worker_tick()
        self.assertEqual(second["job"]["status"], "COMPLETED")
        self.assertGreater(len(self.service.deliveries), 0)

    def test_delivery_is_deduplicated(self):
        job = self.service.jobs[0]
        self.service.worker_tick()
        count = len(self.service.deliveries)
        job["status"] = "READY"
        self.service.worker_tick()
        self.assertEqual(len(self.service.deliveries), count)

    def test_prescription_versions_are_immutable_history(self):
        created = self.service.add_prescription_version(
            "med-metformin", "user-maya", "RX-***999", 6, 6, "2027-06-13"
        )
        view = self.service.medication_view("med-metformin")
        self.assertEqual(created["version"], 2)
        self.assertEqual([item["version"] for item in view["prescriptions"]], [2, 1])

    def test_snapshot_exposes_operational_metrics(self):
        snapshot = self.service.snapshot()
        self.assertEqual(snapshot["metrics"]["active_medications"], 4)
        self.assertEqual(len(snapshot["today_doses"]), 7)
        self.assertGreater(snapshot["metrics"]["adherence_percent"], 0)


if __name__ == "__main__":
    unittest.main()
