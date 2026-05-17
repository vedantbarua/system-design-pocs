import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app


class FeatureStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = app.FeatureStore(Path(self.tmp.name) / "features.db", ttl_seconds=60)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_ingest_purchase_updates_online_features(self):
        ts = 1_700_000_000
        self.store.ingest_event(
            {
                "event_type": "profile_update",
                "user_id": "user-1",
                "event_ts": ts - 10 * 86400,
                "created_at": ts - 10 * 86400,
                "category": "keyboards",
            }
        )
        self.store.ingest_event(
            {
                "event_type": "purchase",
                "user_id": "user-1",
                "event_ts": ts,
                "amount": 125.50,
                "category": "keyboards",
            }
        )

        online = self.store.online_features("user-1")

        self.assertEqual(1, online["features"]["user_7d_purchase_count"])
        self.assertEqual(125.50, online["features"]["user_30d_spend"])
        self.assertEqual("keyboards", online["features"]["last_seen_category"])
        self.assertEqual(10, online["features"]["account_age_days"])

    def test_point_in_time_training_set_excludes_future_events(self):
        base = 1_700_000_000
        self.store.ingest_event(
            {
                "event_type": "profile_update",
                "user_id": "user-1",
                "event_ts": base,
                "created_at": base,
                "category": "mice",
            }
        )
        self.store.ingest_event(
            {
                "event_type": "purchase",
                "user_id": "user-1",
                "event_ts": base + 2 * 86400,
                "amount": 10,
                "category": "mice",
            }
        )
        self.store.ingest_event(
            {
                "event_type": "purchase",
                "user_id": "user-1",
                "event_ts": base + 20 * 86400,
                "amount": 50,
                "category": "monitors",
            }
        )

        training = self.store.training_set(
            [{"user_id": "user-1", "label_ts": base + 3 * 86400, "label": "positive"}]
        )

        features = training["rows"][0]["features"]
        self.assertEqual(1, features["user_7d_purchase_count"])
        self.assertEqual(10.0, features["user_30d_spend"])
        self.assertEqual("mice", features["last_seen_category"])

    def test_backfill_writes_offline_and_online_features(self):
        ts = 1_700_000_000
        self.store.ingest_event(
            {
                "event_type": "purchase",
                "user_id": "user-2",
                "event_ts": ts,
                "amount": 42,
                "category": "books",
            },
            update_online=False,
        )

        result = self.store.backfill(as_of_ts=ts)
        snapshot = self.store.snapshot()

        self.assertEqual(1, result["users"])
        self.assertEqual(4, result["feature_values"])
        self.assertEqual(4, snapshot["online_feature_count"])
        self.assertEqual(0, snapshot["skew"]["mismatch_count"])

    def test_freshness_marks_expired_online_features(self):
        store = app.FeatureStore(Path(self.tmp.name) / "short_ttl.db", ttl_seconds=-1)
        self.addCleanup(store.close)
        store.ingest_event(
            {
                "event_type": "purchase",
                "user_id": "user-3",
                "amount": 5,
                "category": "games",
            }
        )

        freshness = store.freshness()

        self.assertEqual(4, freshness["stale_feature_count"])

    def test_skew_detects_offline_online_mismatch(self):
        ts = 1_700_000_000
        self.store.ingest_event(
            {
                "event_type": "purchase",
                "user_id": "user-4",
                "event_ts": ts,
                "amount": 10,
                "category": "audio",
            }
        )
        self.store.conn.execute(
            """
            INSERT OR REPLACE INTO offline_features(user_id, feature_name, feature_value, as_of_ts, computed_at, source)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            ("user-4", "user_30d_spend", "999.0", ts + 1, ts + 1, "drift-test"),
        )
        self.store.conn.commit()

        skew = self.store.skew_report()

        self.assertEqual(1, skew["mismatch_count"])


if __name__ == "__main__":
    unittest.main()
