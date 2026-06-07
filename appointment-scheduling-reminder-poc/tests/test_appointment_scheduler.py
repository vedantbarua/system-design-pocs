import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from app import AppointmentScheduler, day_start, minutes, now_ts


class AppointmentSchedulerTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "appointments.db"
        self.scheduler = AppointmentScheduler(self.db_path)
        self.scheduler.seed_if_empty()
        self.seeded = self.scheduler.get_appointment("appt-seeded")
        self.workday = day_start(self.seeded["start_at"])

    def tearDown(self):
        self.scheduler.close()
        self.temp_dir.cleanup()

    def test_availability_excludes_booked_slot(self):
        slots = self.scheduler.available_slots(
            "provider-maya",
            "haircut",
            self.workday,
            timestamp=self.workday,
        )
        starts = [slot["start_at"] for slot in slots]

        self.assertNotIn(self.seeded["start_at"], starts)
        self.assertIn(self.seeded["start_at"] - minutes(30), starts)

    def test_active_hold_blocks_second_hold(self):
        start = self.seeded["start_at"] + minutes(60)
        self.scheduler.create_hold(
            {
                "provider_id": "provider-maya",
                "service_id": "haircut",
                "customer_id": "cust-ada",
                "start_at": start,
            },
            timestamp=self.workday,
        )

        with self.assertRaises(ValueError):
            self.scheduler.create_hold(
                {
                    "provider_id": "provider-maya",
                    "service_id": "haircut",
                    "customer_id": "cust-ben",
                    "start_at": start,
                },
                timestamp=self.workday,
            )

    def test_expired_hold_releases_slot(self):
        start = self.seeded["start_at"] + minutes(60)
        hold = self.scheduler.create_hold(
            {
                "provider_id": "provider-maya",
                "service_id": "haircut",
                "customer_id": "cust-ada",
                "start_at": start,
            },
            timestamp=self.workday,
        )

        expired = self.scheduler.expire_holds(hold["expires_at"] + 1)
        replacement = self.scheduler.create_hold(
            {
                "provider_id": "provider-maya",
                "service_id": "haircut",
                "customer_id": "cust-ben",
                "start_at": start,
            },
            timestamp=hold["expires_at"] + 1,
        )

        self.assertEqual(1, expired)
        self.assertEqual("ACTIVE", replacement["status"])

    def test_matching_hold_can_be_consumed_by_booking(self):
        start = self.seeded["start_at"] + minutes(60)
        hold = self.scheduler.create_hold(
            {
                "provider_id": "provider-maya",
                "service_id": "haircut",
                "customer_id": "cust-ben",
                "start_at": start,
            },
            timestamp=self.workday,
        )

        appointment = self.scheduler.book_appointment(
            {
                "provider_id": "provider-maya",
                "service_id": "haircut",
                "customer_id": "cust-ben",
                "start_at": start,
                "hold_id": hold["hold_id"],
            },
            timestamp=self.workday,
        )

        self.assertEqual("BOOKED", appointment["status"])
        self.assertEqual("CONSUMED", self.scheduler.get_hold(hold["hold_id"])["status"])

    def test_double_booking_is_rejected(self):
        with self.assertRaises(ValueError):
            self.scheduler.book_appointment(
                {
                    "provider_id": "provider-maya",
                    "service_id": "haircut",
                    "customer_id": "cust-ben",
                    "start_at": self.seeded["start_at"],
                },
                timestamp=self.workday,
            )

    def test_reschedule_moves_appointment_and_sends_notification(self):
        new_start = self.seeded["start_at"] + minutes(90)

        updated = self.scheduler.reschedule("appt-seeded", new_start, timestamp=self.workday)

        self.assertEqual(new_start, updated["start_at"])
        self.assertTrue(any(item["reminder_type"] == "RESCHEDULED" for item in self.scheduler.list_reminders()))

    def test_cancel_promotes_oldest_compatible_waitlist_entry(self):
        entry = self.scheduler.add_waitlist(
            {
                "provider_id": "provider-maya",
                "service_id": "haircut",
                "customer_id": "cust-ben",
                "preferred_start": self.seeded["start_at"] - minutes(15),
                "preferred_end": self.seeded["start_at"] + minutes(15),
            }
        )

        canceled = self.scheduler.cancel("appt-seeded", timestamp=self.workday)
        updated_entry = self.scheduler.get_waitlist(entry["waitlist_id"])

        self.assertEqual("CANCELED", canceled["status"])
        self.assertIsNotNone(canceled["promoted_appointment"])
        self.assertEqual("PROMOTED", updated_entry["status"])
        self.assertEqual("cust-ben", canceled["promoted_appointment"]["customer_id"])

    def test_upcoming_reminder_is_idempotent(self):
        reminder_time = self.seeded["start_at"] - minutes(60)

        first = self.scheduler.generate_reminders(timestamp=reminder_time)
        second = self.scheduler.generate_reminders(timestamp=reminder_time)

        self.assertEqual(1, len(first))
        self.assertEqual(0, len(second))
        self.assertEqual("APPOINTMENT_UPCOMING", first[0]["reminder_type"])

    def test_appointment_can_be_marked_completed_or_no_show(self):
        completed = self.scheduler.update_status("appt-seeded", "COMPLETED")

        self.assertEqual("COMPLETED", completed["status"])

        start = self.seeded["start_at"] + minutes(60)
        other = self.scheduler.book_appointment(
            {
                "provider_id": "provider-maya",
                "service_id": "haircut",
                "customer_id": "cust-ben",
                "start_at": start,
            },
            timestamp=self.workday,
        )
        no_show = self.scheduler.update_status(other["appointment_id"], "NO_SHOW")

        self.assertEqual("NO_SHOW", no_show["status"])

    def test_utilization_reports_booked_minutes(self):
        utilization = self.scheduler.utilization("provider-maya", self.workday)

        self.assertEqual(480, utilization["available_minutes"])
        self.assertEqual(30, utilization["booked_minutes"])
        self.assertEqual(6.2, utilization["utilization_percent"])

    def test_weekend_has_no_availability(self):
        timestamp = self.workday
        while datetime.fromtimestamp(timestamp, tz=timezone.utc).weekday() != 5:
            timestamp += 24 * 60 * 60

        slots = self.scheduler.available_slots("provider-maya", "haircut", timestamp, timestamp=timestamp)

        self.assertEqual([], slots)

    def test_audit_tracks_booking_waitlist_and_cancellation(self):
        self.scheduler.add_waitlist(
            {
                "provider_id": "provider-maya",
                "service_id": "haircut",
                "customer_id": "cust-ben",
                "preferred_start": self.seeded["start_at"],
                "preferred_end": self.seeded["start_at"],
            }
        )
        self.scheduler.cancel("appt-seeded", actor="front-desk", timestamp=self.workday)
        audit = self.scheduler.list_audit()

        self.assertTrue(any(item["action"] == "join_waitlist" for item in audit))
        self.assertTrue(any(item["action"] == "cancel_appointment" for item in audit))
        self.assertTrue(any(item["actor"] == "front-desk" for item in audit))


if __name__ == "__main__":
    unittest.main()
