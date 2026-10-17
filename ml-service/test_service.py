"""
Self-contained unit and integration tests for REFORGE ML service.
"""

import sys
import unittest
from pathlib import Path
import numpy as np

# Add ml-service to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.models.isolation_forest import IsolationForestAnomalyModel
from app.models.random_forest import RandomForestAnomalyModel
from app.models.registry import ModelRegistry
from app.features import extract_feature_vector, extract_feature_matrix
from app.evaluation import calculate_metrics


class TestMLService(unittest.TestCase):
    def test_feature_extraction(self):
        sample = {
            "entityId": "zone-a-temperature",
            "values": {"value": 26.5},
            "features": {
                "rateOfChange": 0.5,
                "rollingMean": 25.0,
                "rollingStd": 0.8,
                "historicalZScore": 1.875,
                "crossSensorDeviation": 0.2,
                "minutesSincePrevious": 180,
                "historyWindowSize": 20,
                "peerGroupSize": 2,
            },
        }
        vec, cleaned = extract_feature_vector(sample)
        self.assertEqual(len(vec), 12)  # 9 numeric + 3 sensor type one-hots
        self.assertEqual(cleaned["value"], 26.5)
        self.assertEqual(cleaned["type"], "temperature")

    def test_isolation_forest_calibration(self):
        np.random.seed(42)
        # 100 normal observations
        X_normal = np.random.normal(loc=25.0, scale=1.0, size=(100, 12)).astype(np.float32)
        model = IsolationForestAnomalyModel(version="v-test")
        model.fit(X_normal)

        # Predict on normal point
        is_anom_norm, raw_norm, norm_norm = model.predict_scores(X_normal[:5])
        self.assertTrue(all(0.0 <= s <= 1.0 for s in norm_norm))

        # Predict on extreme outlier point (e.g., +50 std devs)
        X_extreme = np.copy(X_normal[:1])
        X_extreme[0, 0] = 250.0  # massive spike
        X_extreme[0, 1] = 200.0  # massive rate of change
        X_extreme[0, 4] = 50.0   # huge z-score
        is_anom_ext, raw_ext, norm_ext = model.predict_scores(X_extreme)

        self.assertTrue(is_anom_ext[0])
        self.assertGreater(norm_ext[0], 0.5)
        self.assertGreater(norm_ext[0], max(norm_norm))

    def test_random_forest_guards(self):
        model = RandomForestAnomalyModel(version="v-rf-test")
        X = np.random.normal(size=(20, 12))

        # 1-class target must raise ValueError
        y_single_class = np.zeros(20, dtype=int)
        with self.assertRaises(ValueError):
            model.fit(X, y_single_class)

        # 2-class with sufficient samples
        y_valid = np.array([0] * 14 + [1] * 6)
        model.fit(X, y_valid)
        self.assertTrue(model.is_fitted)

        is_anom, raw, norm = model.predict_scores(X[:2])
        self.assertEqual(len(norm), 2)
        self.assertTrue(all(0.0 <= s <= 1.0 for s in norm))

    def test_evaluation_metrics(self):
        y_true = [0, 0, 0, 1, 1]
        y_pred = [0, 0, 1, 1, 0]
        scores = [0.1, 0.2, 0.6, 0.9, 0.4]
        res = calculate_metrics(y_true, y_pred, scores)

        self.assertEqual(res["tp"], 1)
        self.assertEqual(res["fp"], 1)
        self.assertEqual(res["tn"], 2)
        self.assertEqual(res["fn"], 1)
        self.assertAlmostEqual(res["precision"], 0.5)
        self.assertAlmostEqual(res["recall"], 0.5)
        self.assertAlmostEqual(res["f1"], 0.5)
        self.assertAlmostEqual(res["specificity"], 2 / 3)


if __name__ == "__main__":
    unittest.main()
