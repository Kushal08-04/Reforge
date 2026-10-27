"""
hybrid_model.py
---------------
Hybrid Anomaly Detection Model for REFORGE.
Combines an unsupervised/supervised ML model (e.g. Isolation Forest) with
the Temporal Statistical & semantic rule engine using a calibrated consensus policy.
"""

from typing import Dict, Any, Tuple, Optional
import numpy as np
import joblib

from .base import BaseAnomalyModel
from .temporal_statistical import TemporalStatisticalAnomalyModel


class HybridAnomalyModel(BaseAnomalyModel):
    def __init__(
        self,
        name: str = "hybrid_detection",
        version: str = "v1.0.0",
        base_ml_model: Optional[BaseAnomalyModel] = None,
        hyperparameters: Optional[Dict[str, Any]] = None,
        feature_schema_version: str = "v2.0.0-iot",
    ):
        super().__init__(
            name=name,
            version=version,
            algorithm="HybridConsensusDetector",
            hyperparameters=hyperparameters or {
                "high_confidence_ml_threshold": 0.80,
                "corroborating_risk_threshold": 0.20,
                "corroborating_ml_threshold": 0.60,
                "calibrated_threshold": 0.50,
            },
            feature_schema_version=feature_schema_version,
        )
        self.base_ml_model = base_ml_model
        self.stat_detector = TemporalStatisticalAnomalyModel(
            name="temporal_statistical_sub",
            version=version,
            feature_schema_version=feature_schema_version,
        )
        self.is_fitted = base_ml_model.is_fitted if base_ml_model else False

    def fit(self, X: np.ndarray, y: Optional[np.ndarray] = None) -> "HybridAnomalyModel":
        if self.base_ml_model is not None:
            self.base_ml_model.fit(X, y)
        self.stat_detector.fit(X, y)
        self.is_fitted = True
        return self

    def predict_scores(
        self, X: np.ndarray, threshold: Optional[float] = None
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if not self.is_fitted:
            raise RuntimeError("Hybrid model is not fitted.")

        N = X.shape[0]

        # 1. Base ML scores
        if self.base_ml_model is not None:
            ml_anomaly, ml_raw, ml_norm = self.base_ml_model.predict_scores(X)
        else:
            ml_anomaly = np.zeros(N, dtype=bool)
            ml_raw = np.zeros(N, dtype=float)
            ml_norm = np.zeros(N, dtype=float)

        # 2. Temporal statistical risk scores
        stat_anomaly, stat_raw, stat_risk = self.stat_detector.predict_scores(X)

        # 3. Apply calibrated hybrid decision logic
        hp = self.hyperparameters
        high_conf_thresh = float(hp.get("high_confidence_ml_threshold", 0.50))
        hard_rule_thresh = float(hp.get("hard_rule_threshold", 0.85))
        corroborate_risk_thresh = float(hp.get("corroborating_risk_threshold", 0.30))
        corroborate_ml_thresh = float(hp.get("corroborating_ml_threshold", 0.25))

        is_anomaly = np.zeros(N, dtype=bool)
        hybrid_scores = np.zeros(N, dtype=float)

        for i in range(N):
            m_norm = float(ml_norm[i])
            s_risk = float(stat_risk[i])

            # Case A: Severe domain / physical rule violation
            if s_risk >= hard_rule_thresh:
                is_anomaly[i] = True
                hybrid_scores[i] = max(s_risk, m_norm)
            # Case B: High confidence ML anomaly
            elif m_norm >= high_conf_thresh:
                is_anomaly[i] = True
                hybrid_scores[i] = max(m_norm, s_risk)
            # Case C: Corroborated subtle anomaly (both ML and rules signal risk)
            elif m_norm >= corroborate_ml_thresh and s_risk >= corroborate_risk_thresh:
                is_anomaly[i] = True
                hybrid_scores[i] = max(m_norm, s_risk)
            else:
                # Borderline noise with negligible corroboration -> suppressed to prevent FPs
                is_anomaly[i] = False
                hybrid_scores[i] = float(np.clip(max(m_norm * 0.4, s_risk * 0.4), 0.0, 0.48))

        return is_anomaly, hybrid_scores, hybrid_scores

    def save(self, filepath: str) -> None:
        payload = {
            "name": self.name,
            "version": self.version,
            "algorithm": self.algorithm,
            "hyperparameters": self.hyperparameters,
            "feature_schema_version": self.feature_schema_version,
            "is_fitted": self.is_fitted,
            "base_ml_model": self.base_ml_model,
            "stat_detector": self.stat_detector,
        }
        joblib.dump(payload, filepath)

    @classmethod
    def load(cls, filepath: str) -> "HybridAnomalyModel":
        payload = joblib.load(filepath)
        instance = cls(
            name=payload["name"],
            version=payload["version"],
            base_ml_model=payload.get("base_ml_model"),
            hyperparameters=payload["hyperparameters"],
            feature_schema_version=payload["feature_schema_version"],
        )
        instance.stat_detector = payload.get("stat_detector", TemporalStatisticalAnomalyModel())
        instance.is_fitted = payload.get("is_fitted", True)
        return instance
