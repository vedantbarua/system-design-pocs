import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app


class SchemaRegistryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.registry = app.SchemaRegistry(Path(self.tmp.name) / "registry.db")
        self.registry.create_subject(
            {
                "name": "OrderCreated",
                "compatibility_mode": "BACKWARD",
                "description": "orders",
                "schema": {
                    "fields": [
                        {"name": "order_id", "type": "string", "required": True},
                        {"name": "customer_id", "type": "string", "required": True},
                        {"name": "total", "type": "number", "required": True},
                    ]
                },
            }
        )

    def tearDown(self):
        self.registry.close()
        self.tmp.cleanup()

    def test_allows_optional_field_in_backward_mode(self):
        result = self.registry.add_version(
            "OrderCreated",
            {
                "fields": [
                    {"name": "order_id", "type": "string", "required": True},
                    {"name": "customer_id", "type": "string", "required": True},
                    {"name": "total", "type": "number", "required": True},
                    {"name": "coupon_code", "type": "string", "required": False},
                ]
            },
        )

        self.assertEqual(2, len(result["versions"]))

    def test_rejects_required_field_addition(self):
        with self.assertRaises(ValueError):
            self.registry.add_version(
                "OrderCreated",
                {
                    "fields": [
                        {"name": "order_id", "type": "string", "required": True},
                        {"name": "customer_id", "type": "string", "required": True},
                        {"name": "total", "type": "number", "required": True},
                        {"name": "currency", "type": "string", "required": True},
                    ]
                },
            )

    def test_rejects_type_change(self):
        check = self.registry.compatibility_check(
            "OrderCreated",
            {
                "fields": [
                    {"name": "order_id", "type": "string", "required": True},
                    {"name": "customer_id", "type": "string", "required": True},
                    {"name": "total", "type": "string", "required": True},
                ]
            },
        )

        self.assertFalse(check["compatible"])
        self.assertTrue(any("field type changed" in issue for issue in check["issues"]))

    def test_validates_events_against_schema(self):
        valid = self.registry.validate_event(
            {
                "subject_name": "OrderCreated",
                "version": 1,
                "event": {"order_id": "order-1", "customer_id": "customer-1", "total": 12.5},
            }
        )
        invalid = self.registry.validate_event(
            {
                "subject_name": "OrderCreated",
                "version": 1,
                "event": {"order_id": "order-1", "total": "12.5"},
            }
        )

        self.assertTrue(valid["valid"])
        self.assertFalse(invalid["valid"])
        self.assertIn("missing required field: customer_id", invalid["errors"])
        self.assertIn("field total expected number", invalid["errors"])

    def test_rollout_readiness_tracks_consumer_version_support(self):
        self.registry.add_version(
            "OrderCreated",
            {
                "fields": [
                    {"name": "order_id", "type": "string", "required": True},
                    {"name": "customer_id", "type": "string", "required": True},
                    {"name": "total", "type": "number", "required": True},
                    {"name": "coupon_code", "type": "string", "required": False},
                ]
            },
        )
        blocked = self.registry.register_consumer(
            {
                "consumer_id": "search-indexer",
                "subject_name": "OrderCreated",
                "min_version": 1,
                "max_version": 1,
                "owner": "search",
            }
        )
        ready = self.registry.register_consumer(
            {
                "consumer_id": "search-indexer",
                "subject_name": "OrderCreated",
                "min_version": 1,
                "max_version": 2,
                "owner": "search",
            }
        )

        self.assertFalse(blocked["ready"])
        self.assertTrue(ready["ready"])

    def test_full_mode_rejects_required_field_removal(self):
        self.registry.create_subject(
            {
                "name": "PaymentCaptured",
                "compatibility_mode": "FULL",
                "description": "payments",
                "schema": {
                    "fields": [
                        {"name": "payment_id", "type": "string", "required": True},
                        {"name": "order_id", "type": "string", "required": True},
                    ]
                },
            }
        )
        check = self.registry.compatibility_check(
            "PaymentCaptured",
            {"fields": [{"name": "payment_id", "type": "string", "required": True}]},
        )

        self.assertFalse(check["compatible"])


if __name__ == "__main__":
    unittest.main()
