import tempfile
import unittest
from pathlib import Path

from app import ComplianceEvidence, checksum, now_ts


DAY = 24 * 60 * 60


class ComplianceEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "compliance.db"
        self.compliance = ComplianceEvidence(self.db_path)
        self.compliance.seed_if_empty()

    def tearDown(self):
        self.compliance.close()
        self.temp_dir.cleanup()

    def test_seeded_controls_have_latest_assessments(self):
        controls = self.compliance.list_controls()

        self.assertEqual(5, len(controls))
        self.assertTrue(any(control["latest_assessment"] for control in controls))

    def test_collect_evidence_creates_required_source_records_with_checksums(self):
        control = self.compliance.get_control("gdpr.consent-decisions")
        evidence = self.compliance.collect_evidence(control["control_id"], actor="collector")

        self.assertEqual(sorted(control["required_sources"]), sorted(item["source_type"] for item in evidence))
        self.assertEqual(checksum(evidence[0]["payload"]), evidence[0]["checksum"])

    def test_assessment_passes_when_all_required_evidence_is_fresh(self):
        assessment = self.compliance.assess_control("gdpr.consent-decisions")

        self.assertEqual("PASS", assessment["status"])
        self.assertIn("all required evidence", assessment["reasons"][0])

    def test_missing_evidence_marks_control_missing(self):
        self.compliance.upsert_control(
            {
                "control_id": "hipaa.backup-restore",
                "framework": "HIPAA",
                "category": "availability",
                "title": "Backups are restorable.",
                "owner": "platform",
                "required_sources": ["restore_test"],
            }
        )

        assessment = self.compliance.assess_control("hipaa.backup-restore")

        self.assertEqual("MISSING", assessment["status"])
        self.assertIn("missing fresh evidence", assessment["reasons"][0])

    def test_expiring_evidence_marks_control_warn(self):
        self.compliance.upsert_control(
            {
                "control_id": "soc2.short-ttl",
                "framework": "SOC2",
                "category": "security",
                "title": "Short TTL control for freshness testing.",
                "owner": "security",
                "evidence_ttl_days": 1,
                "required_sources": ["short_lived_log"],
            }
        )
        old = now_ts() - DAY + 30
        self.compliance.collect_evidence("soc2.short-ttl", collected_at=old)

        assessment = self.compliance.assess_control("soc2.short-ttl", timestamp=now_ts())

        self.assertEqual("WARN", assessment["status"])
        self.assertIn("expires within 24 hours", assessment["reasons"][0])

    def test_open_exception_marks_control_warn(self):
        self.compliance.create_exception(
            {
                "exception_id": "ex-consent-sampling",
                "control_id": "gdpr.consent-decisions",
                "owner": "privacy-platform",
                "status": "OPEN",
                "due_at": now_ts() + DAY,
                "notes": "Need larger sample size.",
            }
        )

        assessment = self.compliance.assess_control("gdpr.consent-decisions")

        self.assertEqual("WARN", assessment["status"])
        self.assertIn("open exception", assessment["reasons"][0])

    def test_overdue_exception_marks_control_fail(self):
        self.compliance.create_exception(
            {
                "exception_id": "ex-overdue",
                "control_id": "gdpr.consent-decisions",
                "owner": "privacy-platform",
                "status": "OPEN",
                "due_at": now_ts() - DAY,
                "notes": "Overdue remediation.",
            }
        )

        assessment = self.compliance.assess_control("gdpr.consent-decisions")

        self.assertEqual("FAIL", assessment["status"])
        self.assertIn("overdue", assessment["reasons"][0])

    def test_generate_package_contains_controls_evidence_exceptions_and_checksum(self):
        package = self.compliance.generate_package("GDPR", actor="auditor")

        self.assertEqual("GDPR", package["framework"])
        self.assertGreaterEqual(len(package["controls"]), 3)
        self.assertGreaterEqual(len(package["evidence"]), 6)
        self.assertEqual(
            checksum(
                {
                    "framework": package["framework"],
                    "status": package["status"],
                    "controls": package["controls"],
                    "evidence": package["evidence"],
                    "exceptions": package["exceptions"],
                }
            ),
            package["checksum"],
        )

    def test_package_status_warns_when_framework_has_open_exception(self):
        package = self.compliance.generate_package("SOC2")

        self.assertEqual("MISSING", package["status"])

        self.compliance.collect_evidence("soc2.incident-review")
        package = self.compliance.generate_package("SOC2")

        self.assertEqual("WARN", package["status"])

    def test_assess_all_returns_status_counts(self):
        result = self.compliance.assess_all(actor="scheduler")

        self.assertEqual(5, result["assessment_count"])
        self.assertIn("PASS", result["status_counts"])
        self.assertIn("MISSING", result["status_counts"])

    def test_snapshot_tracks_evidence_exceptions_and_packages(self):
        self.compliance.generate_package("GDPR")
        snapshot = self.compliance.snapshot()

        self.assertEqual(5, snapshot["control_count"])
        self.assertGreaterEqual(snapshot["evidence_count"], 7)
        self.assertEqual(1, snapshot["open_exception_count"])
        self.assertEqual(1, snapshot["package_count"])

    def test_audit_log_tracks_collection_assessment_and_package_generation(self):
        self.compliance.collect_evidence("gdpr.consent-decisions", actor="collector")
        self.compliance.generate_package("GDPR", actor="auditor")

        audit = self.compliance.list_audit()

        self.assertTrue(any(item["action"] == "collect_evidence" for item in audit))
        self.assertTrue(any(item["action"] == "generate_package" for item in audit))
        self.assertTrue(any(item["actor"] == "auditor" for item in audit))


if __name__ == "__main__":
    unittest.main()
