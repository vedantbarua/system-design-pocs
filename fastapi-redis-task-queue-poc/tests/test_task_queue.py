import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import MemoryRedis, QueueConfig, TaskQueueService


class TaskQueueServiceTest(unittest.TestCase):
    def setUp(self):
        self.service = TaskQueueService(
            MemoryRedis(),
            QueueConfig(
                rate_limit=2,
                rate_window_seconds=60,
                visibility_timeout_seconds=10,
                max_attempts=2,
                base_retry_delay_seconds=5,
            ),
        )

    def test_submit_and_complete_job(self):
        job = self.service.submit_job("tenant-a", "email", {"to": "a@example.com"})
        result = self.service.worker_tick(now=1_000)

        self.assertEqual("completed", result["action"])
        self.assertEqual("completed", self.service.get_job(job["job_id"])["status"])

    def test_idempotency_key_returns_existing_job(self):
        first = self.service.submit_job("tenant-a", "email", {}, idempotency_key="send-1")
        second = self.service.submit_job("tenant-a", "email", {}, idempotency_key="send-1")

        self.assertEqual(first["job_id"], second["job_id"])
        self.assertTrue(second["idempotent_replay"])
        self.assertEqual(1, self.service.snapshot()["counts"]["ready"])

    def test_delayed_job_waits_until_due(self):
        self.service.submit_job("tenant-a", "email", {}, delay_seconds=10)

        early = self.service.worker_tick(now=1_000)
        late = self.service.worker_tick(now=9_999_999_999_999)

        self.assertEqual("idle", early["action"])
        self.assertEqual("completed", late["action"])

    def test_rate_limit_moves_job_to_delayed(self):
        self.service.submit_job("tenant-a", "email", {})
        self.service.submit_job("tenant-a", "email", {})
        self.service.submit_job("tenant-a", "email", {})

        self.assertEqual("completed", self.service.worker_tick(now=1_000)["action"])
        self.assertEqual("completed", self.service.worker_tick(now=2_000)["action"])
        limited = self.service.worker_tick(now=3_000)

        self.assertEqual("rate_limited", limited["action"])
        self.assertEqual(1, self.service.snapshot()["counts"]["delayed"])

    def test_failed_job_retries_then_dead_letters(self):
        job = self.service.submit_job("tenant-a", "email", {"fail": True})

        first = self.service.worker_tick(now=1_000)
        second = self.service.worker_tick(now=6_000)

        self.assertEqual("retry_scheduled", first["action"])
        self.assertEqual("dead_lettered", second["action"])
        self.assertEqual("dead_letter", self.service.get_job(job["job_id"])["status"])

    def test_reclaims_timed_out_processing_job(self):
        job = self.service.submit_job("tenant-a", "email", {})
        raw = self.service.redis.lpop("queue:ready")
        self.service.redis.hset("job:" + raw, {"status": "processing", "attempts": "1"})
        self.service.redis.zadd("queue:processing", {raw: 1_000})

        result = self.service.worker_tick(now=2_000)

        self.assertEqual(1, result["reclaimed"])
        self.assertEqual("completed", self.service.get_job(job["job_id"])["status"])


if __name__ == "__main__":
    unittest.main()
