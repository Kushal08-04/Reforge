"""
Base class for REFORGE anomaly detection models.
Ensures uniform interface across unsupervised (Isolation Forest) and supervised (Random Forest) models.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple, Optional
import numpy as np


class BaseAnomalyModel(ABC):
    def __init__(
        self,
        name: str,
        version: str,
        algorithm: str,
        hyperparameters: Optional[Dict[str, Any]] = None,
        feature_schema_version: str = "v1.0.0",
    ):
        self.name = name
        self.version = version
        self.algorithm = algorithm
        self.hyperparameters = hyperparameters or {}
        self.feature_schema_version = feature_schema_version
        self.is_fitted = False

    @abstractmethod
    def fit(self, X: np.ndarray, y: Optional[np.ndarray] = None) -> "BaseAnomalyModel":
        """Fit model to training data."""
        pass

    @abstractmethod
    def predict_scores(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Returns:
            is_anomaly: np.ndarray[bool]
            raw_scores: np.ndarray[float]
            normalized_scores: np.ndarray[float] (bounded in [0.0, 1.0], 1.0 = highly anomalous)
        """
        pass

    @abstractmethod
    def save(self, filepath: str) -> None:
        """Persist model artifact."""
        pass

    @classmethod
    @abstractmethod
    def load(cls, filepath: str) -> "BaseAnomalyModel":
        """Load persisted model artifact."""
        pass
