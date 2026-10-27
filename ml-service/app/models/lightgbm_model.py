"""
lightgbm_model.py
-----------------
Supervised LightGBM classifier for REFORGE anomaly detection.
Implements histogram-based gradient boosted trees for high-efficiency classification.
"""

from typing import Dict, Any, Tuple, Optional
import numpy as np
import joblib

from .base import BaseAnomalyModel

try:
    import lightgbm as lgb
    HAS_LIGHTGBM = True
except ImportError:
    HAS_LIGHTGBM = False


class LightGBMAnomalyModel(BaseAnomalyModel):
    def __init__(
        self,
        name: str = "lightgbm",
        version: str = "v1.0.0",
        hyperparameters: Optional[Dict[str, Any]] = None,
        feature_schema_version: str = "v2.0.0-iot",
    ):
        super().__init__(
            name=name,
            version=version,
            algorithm="LightGBMClassifier",
            hyperparameters=hyperparameters or {
                "n_estimators": 100,
                "max_depth": 6,
                "learning_rate": 0.08,
                "num_leaves": 31,
                "subsample": 0.8,
                "colsample_bytree": 0.8,
                "random_state": 42,
                "calibrated_threshold": 0.50,
            },
            feature_schema_version=feature_schema_version,
        )
        self.model = None
        if HAS_LIGHTGBM:
            self._init_model()

    def _init_model(self):
        hp = self.hyperparameters
        self.model = lgb.LGBMClassifier(
            n_estimators=int(hp.get("n_estimators", 100)),
            max_depth=int(hp.get("max_depth", 6)),
            learning_rate=float(hp.get("learning_rate", 0.08)),
            num_leaves=int(hp.get("num_leaves", 31)),
            subsample=float(hp.get("subsample", 0.8)),
            colsample_bytree=float(hp.get("colsample_bytree", 0.8)),
            class_weight="balanced",
            random_state=int(hp.get("random_state", 42)),
            verbose=-1,
            n_jobs=-1,
        )

    def fit(self, X: np.ndarray, y: Optional[np.ndarray] = None) -> "LightGBMAnomalyModel":
        if not HAS_LIGHTGBM:
            raise RuntimeError("LightGBM is not installed in the environment.")
        if y is None:
            raise ValueError("Supervised LightGBM requires target labels 'y'.")

        unique_classes, counts = np.unique(y, return_counts=True)
        if len(unique_classes) < 2:
            raise ValueError(
                f"Cannot train supervised LightGBM with only 1 class present ({unique_classes.tolist()}). "
                "Both normal (0) and anomaly (1) examples are required."
            )

        self.model.fit(X, y)
        self.is_fitted = True
        return self

    def predict_scores(
        self, X: np.ndarray, threshold: Optional[float] = None
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted. Train or load weights before inference.")

        proba = self.model.predict_proba(X)
        if proba.shape[1] >= 2:
            normalized_scores = proba[:, 1].astype(float)
        else:
            normalized_scores = proba[:, 0].astype(float)

        thresh = threshold if threshold is not None else float(self.hyperparameters.get("calibrated_threshold", 0.50))
        is_anomaly = normalized_scores >= thresh
        raw_scores = normalized_scores.copy()

        return is_anomaly, raw_scores, normalized_scores

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
    def load(cls, filepath: str) -> "LightGBMAnomalyModel":
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
