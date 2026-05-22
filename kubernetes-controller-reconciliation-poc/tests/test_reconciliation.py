import tempfile
import unittest
from pathlib import Path

from app import ReconciliationController


class ReconciliationControllerTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "controller.db"
        self.controller = ReconciliationController(self.db_path)

    def tearDown(self):
        self.controller.close()
        self.temp_dir.cleanup()

    def create_checkout(self, replicas=3, load=30):
        self.controller.upsert_deployment(
            {
                "name": "checkout",
                "desired_replicas": replicas,
                "image": "checkout:v1",
                "target_cpu": 60,
                "min_replicas": 1,
                "max_replicas": 6,
                "max_surge": 1,
                "max_unavailable": 1,
                "load": load,
            }
        )
        return self.controller.reconcile("checkout")

    def make_running(self, deployment="checkout"):
        for pod in self.controller.active_pods(deployment):
            self.controller.set_pod_state(pod["pod_id"], "Running", cpu=30)

    def test_reconcile_creates_missing_replicas(self):
        result = self.create_checkout(replicas=3)

        pods = self.controller.active_pods("checkout")
        self.assertEqual(3, len(pods))
        self.assertEqual(3, len(result["actions"]))
        self.assertTrue(all(pod["state"] == "Pending" for pod in pods))

    def test_pending_pods_become_running_on_next_reconcile(self):
        self.create_checkout(replicas=2)

        result = self.controller.reconcile("checkout")
        pods = self.controller.active_pods("checkout")

        self.assertEqual(2, len(pods))
        self.assertTrue(all(pod["state"] == "Running" for pod in pods))
        self.assertIn("became Running", " ".join(result["actions"]))

    def test_rolling_update_creates_new_image_and_removes_old_pod(self):
        self.create_checkout(replicas=3, load=180)
        self.make_running()
        self.controller.upsert_deployment({"name": "checkout", "image": "checkout:v2"})

        result = self.controller.reconcile("checkout")
        pods = self.controller.active_pods("checkout")

        self.assertLessEqual(len(pods), 4)
        self.assertTrue(any(pod["image"] == "checkout:v2" for pod in pods))
        self.assertIn("checkout:v2", " ".join(result["actions"]))

    def test_failed_pod_waits_for_restart_backoff(self):
        self.create_checkout(replicas=1)
        self.make_running()
        pod = self.controller.active_pods("checkout")[0]

        failed = self.controller.set_pod_state(pod["pod_id"], "Failed", cpu=0)
        result = self.controller.reconcile("checkout")

        self.assertGreater(failed["backoff_until"], 0)
        self.assertIn("waiting for restart backoff", " ".join(result["actions"]))
        self.assertEqual(1, len([pod for pod in self.controller.active_pods("checkout") if pod["state"] == "Failed"]))

    def test_autoscaler_increases_desired_replicas_under_high_load(self):
        self.create_checkout(replicas=2, load=200)
        self.make_running()

        result = self.controller.reconcile("checkout")
        deployment = self.controller.get_deployment("checkout")

        self.assertEqual(3, deployment["desired_replicas"])
        self.assertIn("HPA adjusted desired replicas", " ".join(result["actions"]))

    def test_autoscaler_decreases_desired_replicas_under_low_load(self):
        self.create_checkout(replicas=4, load=20)
        self.make_running()

        result = self.controller.reconcile("checkout")
        deployment = self.controller.get_deployment("checkout")

        self.assertEqual(3, deployment["desired_replicas"])
        self.assertIn("HPA adjusted desired replicas", " ".join(result["actions"]))

    def test_scale_down_marks_extra_pods_terminating(self):
        self.create_checkout(replicas=3, load=180)
        self.make_running()
        self.controller.upsert_deployment({"name": "checkout", "desired_replicas": 1, "load": 60})

        self.controller.reconcile("checkout")
        active = self.controller.active_pods("checkout")
        terminating = [pod for pod in self.controller.pods_for("checkout") if pod["state"] == "Terminating"]

        self.assertEqual(1, len(active))
        self.assertEqual(2, len(terminating))


if __name__ == "__main__":
    unittest.main()
