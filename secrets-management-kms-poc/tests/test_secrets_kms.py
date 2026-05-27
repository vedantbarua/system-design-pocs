import tempfile
import unittest
from pathlib import Path

from app import SecretsKMS


class SecretsKMSTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "secrets.db"
        self.kms = SecretsKMS(self.db_path)
        self.kms.seed_if_empty()

    def tearDown(self):
        self.kms.close()
        self.temp_dir.cleanup()

    def test_allowed_identity_can_read_secret_and_get_lease(self):
        result = self.kms.read_secret(
            {
                "identity": "service:payments-api",
                "secret_name": "payments/stripe-api-key",
                "lease_seconds": 120,
            }
        )

        self.assertEqual("sk_live_example_initial", result["value"])
        self.assertEqual("payments/stripe-api-key", result["lease"]["secret_name"])
        self.assertFalse(result["lease"]["revoked"])

    def test_denied_identity_cannot_read_secret_and_is_audited(self):
        with self.assertRaises(ValueError):
            self.kms.read_secret(
                {
                    "identity": "service:analytics",
                    "secret_name": "payments/stripe-api-key",
                }
            )

        audit = self.kms.list_audits()[0]
        self.assertEqual("read_secret", audit["action"])
        self.assertFalse(audit["allowed"])

    def test_writing_existing_secret_creates_new_version(self):
        self.kms.put_secret(
            {
                "secret_name": "payments/stripe-api-key",
                "value": "sk_live_example_rotated",
                "created_by": "service:secrets-admin",
            }
        )

        secret = self.kms.get_secret("payments/stripe-api-key")
        read_latest = self.kms.read_secret(
            {"identity": "service:payments-api", "secret_name": "payments/stripe-api-key"}
        )
        read_old = self.kms.read_secret(
            {"identity": "service:payments-api", "secret_name": "payments/stripe-api-key", "version": 1}
        )

        self.assertEqual(2, secret["latest_version"])
        self.assertEqual("sk_live_example_rotated", read_latest["value"])
        self.assertEqual("sk_live_example_initial", read_old["value"])

    def test_key_rotation_rewraps_existing_secret_versions(self):
        before = self.kms.get_secret_version("payments/stripe-api-key", 1)
        result = self.kms.rotate_master_key("platform-prod", "service:secrets-admin")
        after = self.kms.get_secret_version("payments/stripe-api-key", 1)
        read = self.kms.read_secret(
            {"identity": "service:payments-api", "secret_name": "payments/stripe-api-key"}
        )

        self.assertEqual(2, result["key"]["version"])
        self.assertEqual(1, result["rewrapped_versions"])
        self.assertNotEqual(before["key_version"], after["key_version"])
        self.assertEqual("sk_live_example_initial", read["value"])

    def test_revocation_blocks_reads_and_revokes_leases(self):
        lease = self.kms.read_secret(
            {"identity": "service:payments-api", "secret_name": "payments/stripe-api-key"}
        )["lease"]

        secret = self.kms.revoke_secret("payments/stripe-api-key", "service:secrets-admin")

        self.assertEqual("REVOKED", secret["status"])
        self.assertTrue(self.kms.get_lease(lease["lease_id"])["revoked"])
        with self.assertRaises(ValueError):
            self.kms.read_secret(
                {"identity": "service:payments-api", "secret_name": "payments/stripe-api-key"}
            )

    def test_lease_seconds_are_capped_by_policy(self):
        result = self.kms.read_secret(
            {
                "identity": "service:payments-api",
                "secret_name": "payments/stripe-api-key",
                "lease_seconds": 10000,
            }
        )
        lease = result["lease"]

        self.assertLessEqual(lease["expires_at"] - lease["created_at"], 300)

    def test_break_glass_allows_one_emergency_read(self):
        request = self.kms.request_break_glass(
            {
                "identity": "service:analytics",
                "secret_name": "payments/stripe-api-key",
                "reason": "Emergency reconciliation.",
            }
        )
        approved = self.kms.approve_break_glass(
            request["request_id"],
            {"approver": "security-admin", "ttl_seconds": 300},
        )
        result = self.kms.read_secret(
            {
                "identity": "service:analytics",
                "secret_name": "payments/stripe-api-key",
                "break_glass_request": approved["request_id"],
            }
        )

        self.assertEqual("sk_live_example_initial", result["value"])
        self.assertEqual("break-glass approved", result["access"])
        self.assertEqual("USED", self.kms.get_break_glass(request["request_id"])["status"])
        with self.assertRaises(ValueError):
            self.kms.read_secret(
                {
                    "identity": "service:analytics",
                    "secret_name": "payments/stripe-api-key",
                    "break_glass_request": approved["request_id"],
                }
            )


if __name__ == "__main__":
    unittest.main()
