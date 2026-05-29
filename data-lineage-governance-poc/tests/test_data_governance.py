import tempfile
import unittest
from pathlib import Path

from app import DataGovernance, now_ts


class DataGovernanceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "lineage.db"
        self.governance = DataGovernance(self.db_path)
        self.governance.seed_if_empty()

    def tearDown(self):
        self.governance.close()
        self.temp_dir.cleanup()

    def register_external_export(self, classification="PUBLIC", pii=True):
        return self.governance.register_dataset(
            {
                "dataset_id": "external.customer_export",
                "owner_team": "marketing",
                "classification": classification,
                "zone": "external",
                "freshness_sla_minutes": 1440,
                "description": "Outbound customer export.",
                "columns": [{"name": "email", "type": "string", "pii": pii, "tags": ["email"]}],
            }
        )

    def test_seeded_dataset_tracks_columns_and_pii(self):
        dataset = self.governance.get_dataset("raw.customers")

        self.assertEqual("RESTRICTED", dataset["classification"])
        self.assertEqual(1, dataset["pii_column_count"])
        self.assertEqual("email", [column["column_name"] for column in dataset["columns"] if column["pii"]][0])

    def test_safe_lineage_job_is_allowed(self):
        job = self.governance.get_job("job.customer-ltv")

        self.assertTrue(job["latest_policy_decision"]["allowed"])
        self.assertIn("warehouse.customer_ltv", job["outputs"])

    def test_restricted_data_cannot_flow_to_external_public_dataset(self):
        self.register_external_export()

        job = self.governance.register_job(
            {
                "job_id": "job.unsafe-export",
                "owner_team": "marketing",
                "code_version": "git:bad123",
                "schedule": "daily",
                "description": "Unsafe export.",
                "inputs": ["raw.customers"],
                "outputs": ["external.customer_export"],
            }
        )

        self.assertFalse(job["latest_policy_decision"]["allowed"])
        reasons = " ".join(job["latest_policy_decision"]["reasons"])
        self.assertIn("cannot receive restricted data", reasons)
        self.assertIn("cannot be PUBLIC", reasons)

    def test_pii_cannot_flow_to_public_dataset_even_inside_warehouse(self):
        self.governance.register_dataset(
            {
                "dataset_id": "warehouse.public_customer_emails",
                "owner_team": "growth-data",
                "classification": "PUBLIC",
                "zone": "warehouse",
                "freshness_sla_minutes": 120,
                "description": "Unsafe public email table.",
                "columns": [{"name": "email", "type": "string", "pii": True, "tags": ["email"]}],
            }
        )

        job = self.governance.register_job(
            {
                "job_id": "job.public-email-table",
                "owner_team": "growth-data",
                "code_version": "git:bad456",
                "schedule": "hourly",
                "description": "Unsafe public table.",
                "inputs": ["raw.customers"],
                "outputs": ["warehouse.public_customer_emails"],
            }
        )

        self.assertFalse(job["latest_policy_decision"]["allowed"])
        self.assertIn("cannot be PUBLIC", " ".join(job["latest_policy_decision"]["reasons"]))

    def test_freshness_status_marks_stale_dataset(self):
        stale = self.governance.update_freshness("raw.orders", timestamp=now_ts() - 7200)

        self.assertEqual("STALE", stale["freshness"]["status"])
        self.assertEqual(1, self.governance.snapshot()["stale_dataset_count"])

    def test_quality_check_records_latest_status(self):
        check = self.governance.record_quality_check(
            {
                "dataset_id": "warehouse.customer_ltv",
                "check_name": "duplicate_customer_id",
                "status": "FAIL",
                "metric_value": 3,
                "threshold": 0,
                "message": "Duplicate customer IDs found.",
            }
        )
        dataset = self.governance.get_dataset("warehouse.customer_ltv")

        self.assertEqual("FAIL", check["status"])
        self.assertEqual("duplicate_customer_id", dataset["latest_quality"]["check_name"])

    def test_impact_analysis_finds_downstream_datasets(self):
        self.governance.register_dataset(
            {
                "dataset_id": "ml.customer_churn_features",
                "owner_team": "ml-platform",
                "classification": "CONFIDENTIAL",
                "zone": "ml",
                "freshness_sla_minutes": 180,
                "description": "Churn model feature table.",
                "columns": [{"name": "customer_id", "type": "string", "pii": False, "tags": ["identifier"]}],
            }
        )
        self.governance.register_job(
            {
                "job_id": "job.churn-features",
                "owner_team": "ml-platform",
                "code_version": "git:ml123",
                "schedule": "hourly",
                "description": "Build churn features.",
                "inputs": ["warehouse.customer_ltv"],
                "outputs": ["ml.customer_churn_features"],
            }
        )

        impact = self.governance.impact_analysis("raw.customers")

        self.assertIn("warehouse.customer_ltv", impact["impacted_datasets"])
        self.assertIn("ml.customer_churn_features", impact["impacted_datasets"])

    def test_lineage_query_returns_upstream_and_downstream_jobs(self):
        lineage = self.governance.lineage_for("warehouse.customer_ltv")

        self.assertEqual("warehouse.customer_ltv", lineage["dataset"]["dataset_id"])
        self.assertEqual(["job.customer-ltv"], [job["job_id"] for job in lineage["upstream_jobs"]])


if __name__ == "__main__":
    unittest.main()
