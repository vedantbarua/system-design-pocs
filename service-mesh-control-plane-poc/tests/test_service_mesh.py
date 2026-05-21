import tempfile
import unittest
from pathlib import Path

from app import ServiceMeshControlPlane, choose_version


class ServiceMeshControlPlaneTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "mesh.db"
        self.plane = ServiceMeshControlPlane(self.db_path)
        self.plane.seed_if_empty()

    def tearDown(self):
        self.plane.close()
        self.temp_dir.cleanup()

    def test_allows_authorized_mtls_identity(self):
        trace = self.plane.route_request(
            {
                "source_service": "frontend",
                "destination_service": "checkout",
                "identity": "spiffe://mesh/frontend",
                "request_id": "cart-allow",
            }
        )

        self.assertEqual("allow", trace["decision"])
        self.assertTrue(trace["final_instance_id"].startswith("checkout-"))
        self.assertEqual(1, len(trace["attempts"]))

    def test_denies_identity_not_allowed_by_policy(self):
        trace = self.plane.route_request(
            {
                "source_service": "frontend",
                "destination_service": "checkout",
                "identity": "spiffe://mesh/orders-worker",
                "request_id": "cart-deny",
            }
        )

        self.assertEqual("deny", trace["decision"])
        self.assertEqual([], trace["attempts"])
        self.assertIn("identity is not allowed", trace["reason"])

    def test_canary_split_is_deterministic_and_weighted(self):
        counts = {"v1": 0, "v2": 0}
        for index in range(1000):
            counts[choose_version({"v1": 90, "v2": 10}, f"request-{index}")] += 1

        self.assertGreater(counts["v1"], counts["v2"])
        self.assertGreater(counts["v2"], 50)
        self.assertLess(counts["v2"], 150)

    def test_retry_uses_next_eligible_instance_and_consumes_budget(self):
        first = self.plane.route_request(
            {
                "source_service": "frontend",
                "destination_service": "checkout",
                "identity": "spiffe://mesh/frontend",
                "request_id": "retry-me",
            }
        )

        retry = self.plane.route_request(
            {
                "source_service": "frontend",
                "destination_service": "checkout",
                "identity": "spiffe://mesh/frontend",
                "request_id": "retry-me",
                "force_failures": [first["final_instance_id"]],
            }
        )
        policy = self.plane.get_policy("frontend-to-checkout")

        self.assertEqual("allow", retry["decision"])
        self.assertEqual(2, len(retry["attempts"]))
        self.assertEqual("failure", retry["attempts"][0]["outcome"])
        self.assertEqual("success", retry["attempts"][1]["outcome"])
        self.assertEqual(1, policy["retry_budget_used"])

    def test_outlier_ejection_removes_failed_instance_from_routing(self):
        self.plane.record_instance_result("checkout-v1-a", False, self.plane.get_policy("frontend-to-checkout"))
        ejected = self.plane.record_instance_result("checkout-v1-a", False, self.plane.get_policy("frontend-to-checkout"))

        trace = self.plane.route_request(
            {
                "source_service": "frontend",
                "destination_service": "checkout",
                "identity": "spiffe://mesh/frontend",
                "request_id": "avoid-ejected",
            }
        )

        self.assertGreater(ejected["ejected_until"], 0)
        self.assertNotEqual("checkout-v1-a", trace["final_instance_id"])

    def test_draining_sidecars_are_not_selected(self):
        self.plane.set_sidecar_status("checkout-v1-a", "DRAINING")
        self.plane.set_sidecar_status("checkout-v2-canary", "DOWN")

        for index in range(20):
            trace = self.plane.route_request(
                {
                    "source_service": "frontend",
                    "destination_service": "checkout",
                    "identity": "spiffe://mesh/frontend",
                    "request_id": f"drain-{index}",
                }
            )
            self.assertNotEqual("checkout-v1-a", trace["final_instance_id"])

    def test_circuit_opens_after_destination_failures(self):
        policy = self.plane.get_policy("checkout-to-payments")
        self.plane.record_instance_result("payments-v1-a", False, policy)
        self.plane.record_instance_result("payments-v1-a", False, policy)

        trace = self.plane.route_request(
            {
                "source_service": "checkout",
                "destination_service": "payments",
                "identity": "spiffe://mesh/checkout",
                "request_id": "open-circuit",
                "force_failures": ["payments-v1-a"],
            }
        )
        blocked = self.plane.route_request(
            {
                "source_service": "checkout",
                "destination_service": "payments",
                "identity": "spiffe://mesh/checkout",
                "request_id": "blocked-by-circuit",
            }
        )

        self.assertEqual("unavailable", trace["decision"])
        self.assertEqual("unavailable", blocked["decision"])
        self.assertIn("circuit breaker is open", blocked["reason"])


if __name__ == "__main__":
    unittest.main()
