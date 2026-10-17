"""
Supervised Random Forest benchmark for anomaly detection.
Enforces rigorous validation checks: class count validation, severe imbalance guards,
and held-out evaluation support.
"""

from typing import Dict, Any, Tuple, Optional
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier

from .base import BaseAnomalyModel


class RandomForestAnomalyModel(BaseAnomalyModel):
    def __init__(
        self,
        name: str = "random_forest",
        version: str = "v1.0.0",
        hyperparameters: Optional[Dict[str, Any]] = None,
        feature_schema_version: str = "v1.0.0",
    ):
        super().__init__(
            name=name,
            version=version,
            algorithm="RandomForestClassifier",
            hyperparameters=hyperparameters or {
                "n_estimators": 100,
                "max_depth": 6,
                "class_weight": "balanced",
                "random_state": 42,
            },
            feature_schema_version=feature_schema_version,
        )
        self.model: Optional[RandomForestClassifier] = None
        self._init_model()

    def _init_model(self):
        hp = self.hyperparameters
        self.model = RandomForestClassifier(
            n_estimators=int(hp.get("n_estimators", 100)),
            max_depth=int(hp["max_depth"]) if hp.get("max_depth") else None,
            class_weight=hp.get("class_weight", "balanced"),
            random_state=int(hp.get("random_state", 42)),
            n_jobs=-1,
        )

    def fit(self, X: np.ndarray, y: Optional[np.ndarray] = None) -> "RandomForestAnomalyModel":
        if y is None:
            raise ValueError("Supervised Random Forest requires target labels 'y'.")

        unique_classes, counts = np.unique(y, return_counts=True)
        if len(unique_classes) < 2:
            raise ValueError(
                f"Cannot train supervised model with only 1 class present ({unique_classes.tolist()}). "
                "Both normal (0) and anomaly (1) examples are required."
            )

        class_counts = dict(zip(unique_classes.tolist(), counts.tolist()))
        pos_count = class_counts.get(1, 0)
        neg_count = class_counts.get(0, 0)

        if pos_count < 5:
            raise ValueError(
                f"Severe positive class sparsity: only {pos_count} anomalous samples found. "
                "At least 5 positive samples required to train a reliable supervised model."
            )
        if neg_count < 10:
            raise ValueError(
                f"Insufficient normal class samples: only {neg_count} normal samples found. "
                "At least 10 normal samples required."
            )

        self.model.fit(X, y)
        self.is_fitted = True
        return self

    def predict_scores(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted. Train or load weights before inference.")

        # Class probabilities: index 1 is anomaly probability
        probs = self.model.predict_proba(X)
        if probs.shape[1] == 2:
            normalized = probs[:, 1]
        else:
            normalized = probs[:, 0]

        raw_scores = normalized.copy()
        is_anomaly = normalized >= 0.5

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
    def load(cls, filepath: str) -> "RandomForestAnomalyModel":
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
