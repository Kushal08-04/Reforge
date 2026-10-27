"""
Isolation Forest implementation for unsupervised anomaly detection.
Uses scikit-learn IsolationForest with calibrated [0, 1] normalization.
"""

from typing import Dict, Any, Tuple, Optional
import numpy as np
import joblib
from sklearn.ensemble import IsolationForest

from .base import BaseAnomalyModel


class IsolationForestAnomalyModel(BaseAnomalyModel):
    def __init__(
        self,
        name: str = "isolation_forest",
        version: str = "v1.0.0",
        hyperparameters: Optional[Dict[str, Any]] = None,
        feature_schema_version: str = "v1.0.0",
    ):
        super().__init__(
            name=name,
            version=version,
            algorithm="IsolationForest",
            hyperparameters=hyperparameters or {
                "n_estimators": 100,
                "contamination": 0.05,
                "random_state": 42,
                "max_samples": "auto",
            },
            feature_schema_version=feature_schema_version,
        )
        self.model: Optional[IsolationForest] = None
        self._init_model()

    def _init_model(self):
        hp = self.hyperparameters
        self.model = IsolationForest(
            n_estimators=int(hp.get("n_estimators", 100)),
            contamination=float(hp.get("contamination", 0.05)),
            random_state=int(hp.get("random_state", 42)),
            max_samples=hp.get("max_samples", "auto"),
            n_jobs=-1,
        )

    def fit(self, X: np.ndarray, y: Optional[np.ndarray] = None) -> "IsolationForestAnomalyModel":
        if X.shape[0] < 5:
            raise ValueError(f"Insufficient samples to fit Isolation Forest (found {X.shape[0]}, minimum 5 required)")
        self.model.fit(X)
        self.is_fitted = True
        return self

    def predict_scores(
        self, X: np.ndarray, threshold: Optional[float] = None
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted. Train or load weights before inference.")

        # decision_function gives negative for anomalies, positive for inliers
        dec_func = self.model.decision_function(X)
        raw_scores = -dec_func.astype(float)  # higher = more anomalous

        # Sigmoid calibration centered at decision boundary (0.0 maps to 0.5)
        k = 12.0
        normalized = 1.0 / (1.0 + np.exp(-k * raw_scores))
        normalized = np.clip(normalized, 0.0, 1.0)

        # Use calibrated threshold if available, otherwise default 0.5
        thresh = threshold if threshold is not None else float(self.hyperparameters.get("calibrated_threshold", 0.5))
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
        return instance
