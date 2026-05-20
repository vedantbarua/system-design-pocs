import tempfile
import unittest
from pathlib import Path

from app import AuthorizationStore


class AuthorizationStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "auth.db"
        self.store = AuthorizationStore(self.db_path)
        self.store.seed_if_empty()

    def tearDown(self):
        self.store.close()
        self.temp_dir.cleanup()

    def test_allows_matching_rbac_and_abac_policy(self):
        decision = self.store.decide(
            {"principal": "user:alice", "action": "orders:read", "resource": "order:1001"}
        )

        self.assertEqual("allow", decision["decision"])
        self.assertEqual("allow-support-read-orders", decision["matched_policies"][0]["policy_id"])

    def test_default_denies_when_no_allow_policy_matches(self):
        decision = self.store.decide(
            {"principal": "user:alice", "action": "orders:delete", "resource": "order:1001"}
        )

        self.assertEqual("deny", decision["decision"])
        self.assertIn("Default deny", decision["reason"])
        self.assertEqual([], decision["matched_policies"])

    def test_deny_policy_takes_precedence_over_allow(self):
        self.store.upsert_resource(
            {
                "resource_id": "order:eu",
                "resource_type": "order",
                "owner_id": "user:bob",
                "attributes": {"region": "eu"},
            }
        )

        decision = self.store.decide(
            {"principal": "user:alice", "action": "orders:read", "resource": "order:eu"}
        )

        self.assertEqual("deny", decision["decision"])
        self.assertEqual("deny-cross-region-support", decision["matched_policies"][0]["policy_id"])

    def test_dry_run_policy_is_reported_but_does_not_allow(self):
        self.store.upsert_resource(
            {
                "resource_id": "payment:us",
                "resource_type": "payment",
                "owner_id": "user:alice",
                "attributes": {"region": "us"},
            }
        )

        decision = self.store.decide(
            {"principal": "user:alice", "action": "payments:read", "resource": "payment:us"}
        )

        self.assertEqual("deny", decision["decision"])
        self.assertEqual("dry-run-support-payment-read", decision["dry_run_policies"][0]["policy_id"])

    def test_policy_update_creates_new_active_version(self):
        first = self.store.create_policy(
            {
                "policy_id": "allow-owner-read-profile",
                "effect": "allow",
                "priority": 120,
                "actions": ["profiles:read"],
                "principal_roles": ["*"],
                "resource_types": ["profile"],
                "conditions": [
                    {"left": "principal.principal_id", "operator": "eq", "right_ref": "resource.owner_id"}
                ],
            }
        )
        second = self.store.create_policy(
            {
                "policy_id": "allow-owner-read-profile",
                "effect": "allow",
                "priority": 130,
                "actions": ["profiles:read"],
                "principal_roles": ["*"],
                "resource_types": ["profile"],
                "conditions": [
                    {"left": "principal.principal_id", "operator": "eq", "right_ref": "resource.owner_id"}
                ],
            }
        )

        policies = {
            policy["policy_id"]: policy
            for policy in self.store.list_policies()
            if policy["policy_id"] == "allow-owner-read-profile"
        }
        self.assertEqual(1, first["version"])
        self.assertEqual(2, second["version"])
        self.assertEqual(2, policies["allow-owner-read-profile"]["version"])
        self.assertEqual(130, policies["allow-owner-read-profile"]["priority"])

    def test_inline_principal_and_resource_can_be_authorized(self):
        self.store.create_policy(
            {
                "policy_id": "allow-owners-read-documents",
                "effect": "allow",
                "priority": 250,
                "actions": ["documents:read"],
                "principal_roles": ["employee"],
                "resource_types": ["document"],
                "conditions": [
                    {"left": "principal.principal_id", "operator": "eq", "right_ref": "resource.owner_id"}
                ],
            }
        )

        decision = self.store.decide(
            {
                "principal": {
                    "principal_id": "user:carla",
                    "principal_type": "user",
                    "roles": ["employee"],
                    "attributes": {"department": "legal"},
                },
                "action": "documents:read",
                "resource": {
                    "resource_id": "doc:7",
                    "resource_type": "document",
                    "owner_id": "user:carla",
                    "attributes": {"classification": "internal"},
                },
            }
        )

        self.assertEqual("allow", decision["decision"])
        self.assertEqual("allow-owners-read-documents", decision["matched_policies"][0]["policy_id"])


if __name__ == "__main__":
    unittest.main()
