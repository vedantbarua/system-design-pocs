import tempfile
import unittest
from pathlib import Path

from app import SubscriptionBilling, days, now_ts


class SubscriptionBillingTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "billing.db"
        self.billing = SubscriptionBilling(self.db_path)
        self.billing.seed_if_empty()

    def tearDown(self):
        self.billing.close()
        self.temp_dir.cleanup()

    def test_seed_creates_customers_plans_and_subscriptions(self):
        snapshot = self.billing.snapshot()

        self.assertEqual(3, snapshot["customer_count"])
        self.assertEqual(2, snapshot["plan_count"])
        self.assertEqual(3, sum(snapshot["subscription_status_counts"].values()))

    def test_generate_reminders_for_trial_and_renewal_windows(self):
        reminders = self.billing.generate_reminders(actor="scheduler")
        reminder_types = sorted(item["reminder_type"] for item in reminders)

        self.assertIn("TRIAL_ENDING", reminder_types)
        self.assertIn("RENEWAL_UPCOMING", reminder_types)

    def test_generate_invoices_is_idempotent_for_same_due_date(self):
        first = self.billing.generate_invoices(horizon_days=7)
        second = self.billing.generate_invoices(horizon_days=7)

        self.assertEqual(len(first), len(second))
        self.assertEqual(
            sorted(item["invoice_id"] for item in first),
            sorted(item["invoice_id"] for item in second),
        )

    def test_due_invoice_for_successful_customer_marks_subscription_active(self):
        current = now_ts()
        sub = self.billing.create_subscription(
            {
                "subscription_id": "sub-success-now",
                "customer_id": "cust-ada",
                "plan_id": "basic-monthly",
                "status": "ACTIVE",
                "started_at": current - days(31),
                "current_period_end": current,
                "next_bill_at": current,
            }
        )
        invoice = [item for item in self.billing.generate_invoices(timestamp=current) if item["subscription_id"] == sub["subscription_id"]][0]

        attempt = self.billing.attempt_payment(invoice["invoice_id"], timestamp=current)
        updated = self.billing.get_subscription(sub["subscription_id"])

        self.assertEqual("SUCCEEDED", attempt["result"])
        self.assertEqual("PAID", self.billing.get_invoice(invoice["invoice_id"])["status"])
        self.assertEqual("ACTIVE", updated["status"])
        self.assertEqual(0, updated["dunning_count"])

    def test_failed_payment_moves_subscription_to_grace_period(self):
        current = now_ts()
        invoices = self.billing.generate_invoices(timestamp=current)
        past_due_invoice = [item for item in invoices if item["subscription_id"] == "sub-past-due"][0]

        attempt = self.billing.attempt_payment(past_due_invoice["invoice_id"], timestamp=current)
        subscription = self.billing.get_subscription("sub-past-due")

        self.assertEqual("FAILED", attempt["result"])
        self.assertEqual("GRACE_PERIOD", subscription["status"])
        self.assertEqual(1, subscription["dunning_count"])
        self.assertTrue(any(item["reminder_type"] == "PAYMENT_FAILED" for item in self.billing.list_reminders()))

    def test_retry_failed_payments_cancels_after_max_retries(self):
        current = now_ts()
        self.billing.run_billing_cycle(timestamp=current)
        self.billing.retry_failed_payments(timestamp=current + days(1))
        self.billing.retry_failed_payments(timestamp=current + days(2))

        subscription = self.billing.get_subscription("sub-past-due")

        self.assertEqual("CANCELED", subscription["status"])
        self.assertEqual(3, subscription["dunning_count"])
        self.assertIsNotNone(subscription["canceled_at"])
        self.assertTrue(any(item["reminder_type"] == "CANCELED" for item in self.billing.list_reminders()))

    def test_grace_period_ending_reminder_is_generated(self):
        current = now_ts()
        self.billing.create_subscription(
            {
                "subscription_id": "sub-grace-ending",
                "customer_id": "cust-ben",
                "plan_id": "basic-monthly",
                "status": "GRACE_PERIOD",
                "started_at": current - days(35),
                "current_period_end": current - days(5),
                "next_bill_at": current - days(5),
                "grace_ends_at": current + days(1),
                "dunning_count": 1,
            }
        )

        reminders = self.billing.generate_reminders(timestamp=current)

        self.assertTrue(any(item["reminder_type"] == "GRACE_ENDING" for item in reminders))

    def test_billing_cycle_generates_invoices_payments_and_reminders(self):
        result = self.billing.run_billing_cycle(actor="scheduler")

        self.assertGreaterEqual(len(result["invoices"]), 3)
        self.assertEqual(1, len(result["payment_attempts"]))
        self.assertGreaterEqual(len(result["reminders"]), 2)

    def test_create_subscription_uses_plan_trial_defaults(self):
        current = now_ts()
        sub = self.billing.create_subscription(
            {
                "subscription_id": "sub-default-trial",
                "customer_id": "cust-ada",
                "plan_id": "pro-monthly",
                "started_at": current,
            }
        )

        self.assertEqual("TRIALING", sub["status"])
        self.assertEqual(current + days(7), sub["trial_ends_at"])

    def test_snapshot_counts_payment_attempts_and_reminders(self):
        self.billing.run_billing_cycle()
        snapshot = self.billing.snapshot()

        self.assertGreaterEqual(snapshot["payment_attempt_count"], 1)
        self.assertGreaterEqual(snapshot["reminder_count"], 3)

    def test_audit_log_tracks_invoice_payment_and_reminder_actions(self):
        self.billing.run_billing_cycle(actor="scheduler")
        actions = [item["action"] for item in self.billing.list_audit()]

        self.assertIn("create_invoice", actions)
        self.assertIn("payment_attempt", actions)
        self.assertIn("send_reminder", actions)


if __name__ == "__main__":
    unittest.main()
