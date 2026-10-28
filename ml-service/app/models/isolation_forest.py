"""
Isolation Forest implementation for unsupervised anomaly detection.
Uses scikit-learn IsolationForest with calibrated [0, 1] normalization
and feature selection targeting high-precision IoT anomaly detection.
"""

from typing import Dict, Any, Tuple, Optional, List
import numpy as np
import joblib
from sklearn.ensemble import IsolationForest

from .base import BaseAnomalyModel


class IsolationForestAnomalyModel(BaseAnomalyModel):
    def __init__(
        self,
        name: str = "isolation_forest",
        version: str = "v2.1.0-iot",
        hyperparameters: Optional[Dict[str, Any]] = None,
        feature_schema_version: str = "v2.0.0-iot",
    ):
        super().__init__(
            name=name,
            version=version,
            algorithm="IsolationForest",
            hyperparameters=hyperparameters or {
                "n_estimators": 150,
                "contamination": 0.01,
                "max_samples": 512,
                "random_state": 42,
                "feature_indices": [0, 1, 2, 3, 4],  # temp, humidity, co, lpg, smoke
                "score_shift": -0.103,
                "score_scale": 18.0,
                "calibrated_threshold": 0.50,
            },
            feature_schema_version=feature_schema_version,
        )
        self.model: Optional[IsolationForest] = None
        self.feature_indices: Optional[List[int]] = self.hyperparameters.get(
            "feature_indices", [0, 1, 2, 3, 4]
        )
        self.score_shift: float = float(self.hyperparameters.get("score_shift", -0.103))
        self.score_scale: float = float(self.hyperparameters.get("score_scale", 18.0))
        self.calibrated_threshold: float = float(
            self.hyperparameters.get("calibrated_threshold", 0.50)
        )

        self._init_model()

    def _init_model(self):
        hp = self.hyperparameters
        self.model = IsolationForest(
            n_estimators=int(hp.get("n_estimators", 150)),
            contamination=float(hp.get("contamination", 0.01)),
            random_state=int(hp.get("random_state", 42)),
            max_samples=hp.get("max_samples", 512),
            n_jobs=-1,
        )

    def _slice_features(self, X: np.ndarray) -> np.ndarray:
        if self.feature_indices is not None and X.ndim == 2:
            if X.shape[1] > len(self.feature_indices):
                valid_idx = [i for i in self.feature_indices if i < X.shape[1]]
                return X[:, valid_idx]
        return X

    def fit(self, X: np.ndarray, y: Optional[np.ndarray] = None) -> "IsolationForestAnomalyModel":
        if X.shape[0] < 5:
            raise ValueError(f"Insufficient samples to fit Isolation Forest (found {X.shape[0]}, minimum 5 required)")
        X_sub = self._slice_features(X)
        self.model.fit(X_sub)
        self.is_fitted = True
        return self

    def predict_scores(
        self, X: np.ndarray, threshold: Optional[float] = None
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted. Train or load weights before inference.")

        X_sub = self._slice_features(X)
        # decision_function gives negative for anomalies, positive for inliers
        dec_func = self.model.decision_function(X_sub)
        raw_scores = -dec_func.astype(float)  # higher = more anomalous

        # Centered sigmoid calibration targeting high precision:
        # Operating boundary (score_shift) maps to 0.50
        normalized = 1.0 / (1.0 + np.exp(-self.score_scale * (raw_scores - self.score_shift)))
        normalized = np.clip(normalized, 0.0, 1.0)

        # Use calibrated threshold if available, otherwise default 0.50
        thresh = threshold if threshold is not None else self.calibrated_threshold
        is_anomaly = normalized >= thresh

        return is_anomaly, raw_scores, normalized

    def save(self, filepath: str) -> None:
        payload = {
            "name": self.name,
            "version": self.version,
            "algorithm": self.algorithm,
            "hyperparameters": self.hyperparameters,
            "feature_schema_version": self.feature_schema_version,
            "is_fitted": self.is_fitted,
            "model": self.model,
            "feature_indices": self.feature_indices,
            "score_shift": self.score_shift,
            "score_scale": self.score_scale,
            "calibrated_threshold": self.calibrated_threshold,
        }
        joblib.dump(payload, filepath)

    @classmethod
    def load(cls, filepath: str) -> "IsolationForestAnomalyModel":
        payload = joblib.load(filepath)
        instance = cls(
            name=payload["name"],
            version=payload["version"],
            hyperparameters=payload["hyperparameters"],
            feature_schema_version=payload["feature_schema_version"],
        )
        instance.model = payload["model"]
        instance.is_fitted = payload["is_fitted"]
        instance.feature_indices = payload.get("feature_indices", [0, 1, 2, 3, 4])
        instance.score_shift = payload.get("score_shift", -0.103)
        instance.score_scale = payload.get("score_scale", 18.0)
        instance.calibrated_threshold = payload.get("calibrated_threshold", 0.50)
        return instance

