import tempfile
import unittest
from pathlib import Path

from app import ArtifactRegistry


class ArtifactRegistryTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "registry.db"
        self.registry = ArtifactRegistry(self.db_path)
        self.registry.seed_if_empty()

    def tearDown(self):
        self.registry.close()
        self.temp_dir.cleanup()

    def publish_complete_artifact(self, version="2.0.0", high_count=0, critical_count=0, scan_status="PASS"):
        artifact = self.registry.publish_artifact(
            {
                "name": "checkout-api",
                "version": version,
                "artifact_type": "container",
                "content": f"checkout-api-image-{version}",
                "created_by": "ci:checkout-main",
                "provenance": {
                    "builder": "github-actions",
                    "source_repo": "github.com/acme/checkout-api",
                    "commit_sha": "abc9999",
                    "workflow_id": f"build-{version}",
                    "materials": [{"name": "base-image", "digest": "sha256:base"}],
                },
                "sbom": {
                    "format": "spdx-json",
                    "dependencies": [{"name": "fastapi", "version": "0.115.0"}],
                },
            }
        )
        self.registry.sign_artifact(artifact["digest"], "ci:checkout-main")
        self.registry.record_scan(
            {
                "digest": artifact["digest"],
                "scanner": "trivy",
                "status": scan_status,
                "critical_count": critical_count,
                "high_count": high_count,
                "medium_count": 0,
                "findings": [],
            }
        )
        return self.registry.get_artifact(artifact["digest"])

    def test_publish_creates_immutable_digest_with_provenance_and_sbom(self):
        artifact = self.registry.publish_artifact(
            {
                "name": "inventory-api",
                "version": "1.0.0",
                "artifact_type": "container",
                "content": "inventory-api-image",
                "created_by": "ci:inventory-main",
                "provenance": {
                    "builder": "github-actions",
                    "source_repo": "github.com/acme/inventory-api",
                    "commit_sha": "abc123",
                    "workflow_id": "build-1",
                    "materials": [],
                },
                "sbom": {"format": "spdx-json", "dependencies": []},
            }
        )

        self.assertTrue(artifact["digest"].startswith("sha256:"))
        self.assertEqual("github-actions", artifact["provenance"]["builder"])
        self.assertEqual("spdx-json", artifact["sbom"]["format"])

    def test_publishing_same_version_with_different_content_is_rejected(self):
        self.registry.publish_artifact(
            {
                "name": "inventory-api",
                "version": "1.0.0",
                "artifact_type": "container",
                "content": "inventory-api-image",
                "created_by": "ci:inventory-main",
            }
        )

        with self.assertRaises(ValueError):
            self.registry.publish_artifact(
                {
                    "name": "inventory-api",
                    "version": "1.0.0",
                    "artifact_type": "container",
                    "content": "tampered-image",
                    "created_by": "ci:inventory-main",
                }
            )

    def test_signature_verification_distinguishes_valid_and_invalid_signatures(self):
        artifact = self.publish_complete_artifact()
        invalid = self.registry.sign_artifact(artifact["digest"], "ci:checkout-main", "bad-signature")
        valid = self.registry.sign_artifact(artifact["digest"], "release-bot")

        self.assertFalse(invalid["verified"])
        self.assertTrue(valid["verified"])

    def test_staging_admission_requires_dev_promotion(self):
        artifact = self.publish_complete_artifact()

        rejected = self.registry.admit_deployment(
            {"digest": artifact["digest"], "environment": "staging", "requested_by": "deploy-bot"}
        )
        self.registry.promote_artifact(artifact["digest"], "dev", "release-manager")
        allowed = self.registry.admit_deployment(
            {"digest": artifact["digest"], "environment": "staging", "requested_by": "deploy-bot"}
        )

        self.assertFalse(rejected["allowed"])
        self.assertIn("artifact must be promoted from dev", rejected["reasons"])
        self.assertTrue(allowed["allowed"])

    def test_prod_admission_requires_staging_promotion(self):
        artifact = self.publish_complete_artifact()
        self.registry.promote_artifact(artifact["digest"], "dev", "release-manager")

        rejected = self.registry.admit_deployment(
            {"digest": artifact["digest"], "environment": "prod", "requested_by": "deploy-bot"}
        )
        self.registry.promote_artifact(artifact["digest"], "staging", "release-manager")
        allowed = self.registry.admit_deployment(
            {"digest": artifact["digest"], "environment": "prod", "requested_by": "deploy-bot"}
        )

        self.assertFalse(rejected["allowed"])
        self.assertIn("artifact must be promoted from staging", rejected["reasons"])
        self.assertTrue(allowed["allowed"])

    def test_prod_rejects_vulnerable_artifact(self):
        artifact = self.publish_complete_artifact(version="2.0.1", high_count=1)
        self.registry.promote_artifact(artifact["digest"], "dev", "release-manager")
        self.registry.promote_artifact(artifact["digest"], "staging", "release-manager")

        decision = self.registry.admit_deployment(
            {"digest": artifact["digest"], "environment": "prod", "requested_by": "deploy-bot"}
        )

        self.assertFalse(decision["allowed"])
        self.assertIn("high vulnerabilities exceed limit 0", decision["reasons"])

    def test_unsigned_artifact_is_rejected_for_staging(self):
        artifact = self.registry.publish_artifact(
            {
                "name": "billing-api",
                "version": "1.0.0",
                "artifact_type": "container",
                "content": "billing-api-image",
                "created_by": "ci:billing-main",
                "provenance": {
                    "builder": "github-actions",
                    "source_repo": "github.com/acme/billing-api",
                    "commit_sha": "def123",
                    "workflow_id": "build-billing",
                    "materials": [],
                },
                "sbom": {"format": "spdx-json", "dependencies": []},
            }
        )
        self.registry.record_scan(
            {
                "digest": artifact["digest"],
                "scanner": "trivy",
                "status": "PASS",
                "critical_count": 0,
                "high_count": 0,
                "medium_count": 0,
                "findings": [],
            }
        )
        self.registry.promote_artifact(artifact["digest"], "dev", "release-manager")

        decision = self.registry.admit_deployment(
            {"digest": artifact["digest"], "environment": "staging", "requested_by": "deploy-bot"}
        )

        self.assertFalse(decision["allowed"])
        self.assertIn("verified signature required", decision["reasons"])

    def test_admission_records_decision_and_audit_event(self):
        artifact = self.registry.list_artifacts()[0]

        decision = self.registry.admit_deployment(
            {"digest": artifact["digest"], "environment": "prod", "requested_by": "deploy-bot"}
        )
        decisions = self.registry.list_decisions()
        audits = self.registry.list_audits()

        self.assertTrue(decision["allowed"])
        self.assertEqual("prod", decisions[0]["environment"])
        self.assertEqual("admission_check", audits[0]["action"])


if __name__ == "__main__":
    unittest.main()
