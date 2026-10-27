"""
Model Registry for REFORGE ML service.
Tracks versioned model artifacts, metadata, active model selection, promotion, and rollback.
"""

import os
import json
import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path

from .base import BaseAnomalyModel
from .isolation_forest import IsolationForestAnomalyModel
from .random_forest import RandomForestAnomalyModel
from .xgboost_model import XGBoostAnomalyModel
from .lightgbm_model import LightGBMAnomalyModel
from .temporal_statistical import TemporalStatisticalAnomalyModel
from .hybrid_model import HybridAnomalyModel

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent.parent / "artifacts"
REGISTRY_FILE = ARTIFACTS_DIR / "registry.json"


class ModelRegistry:
    def __init__(self, artifacts_dir: Path = ARTIFACTS_DIR):
        self.artifacts_dir = artifacts_dir
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.registry_file = self.artifacts_dir / "registry.json"
        self._cache: Dict[str, BaseAnomalyModel] = {}
        self._load_or_init_registry()

    def _load_or_init_registry(self) -> Dict[str, Any]:
        if not self.registry_file.exists():
            data = {
                "active_model_key": None,
                "previous_model_key": None,
                "models": {},
            }
            self._save_registry(data)
            return data
        try:
            with open(self.registry_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"active_model_key": None, "previous_model_key": None, "models": {}}

    def _save_registry(self, data: Dict[str, Any]):
        with open(self.registry_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def register_model(
        self,
        model: BaseAnomalyModel,
        metrics: Optional[Dict[str, Any]] = None,
        status: str = "candidate",
        make_active: bool = False,
    ) -> str:
        key = f"{model.name}:{model.version}"
        artifact_filename = f"{model.name}_{model.version}.joblib"
        artifact_path = self.artifacts_dir / artifact_filename

        model.save(str(artifact_path))
        self._cache[key] = model

        data = self._load_or_init_registry()
        record = {
            "model_name": model.name,
            "version": model.version,
            "algorithm": model.algorithm,
            "status": "active" if make_active else status,
            "feature_schema_version": model.feature_schema_version,
            "artifact_filename": artifact_filename,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "hyperparameters": model.hyperparameters,
            "metrics": metrics or {},
        }

        if make_active:
            if data.get("active_model_key") and data["active_model_key"] != key:
                data["previous_model_key"] = data["active_model_key"]
                prev = data["models"].get(data["previous_model_key"])
                if prev:
                    prev["status"] = "retired"
            data["active_model_key"] = key

        data["models"][key] = record
        self._save_registry(data)
        return key

    def get_model(self, key_or_name: Optional[str] = None, version: Optional[str] = None) -> BaseAnomalyModel:
        data = self._load_or_init_registry()

        if key_or_name and ":" in key_or_name:
            target_key = key_or_name
        elif key_or_name and version:
            target_key = f"{key_or_name}:{version}"
        elif key_or_name:
            # find newest version with matching model_name
            matching = [k for k in data["models"] if data["models"][k]["model_name"] == key_or_name]
            target_key = matching[-1] if matching else data.get("active_model_key")
        else:
            target_key = data.get("active_model_key")

        if not target_key or target_key not in data["models"]:
            raise KeyError(f"Requested model '{target_key}' not found in registry.")

        if target_key in self._cache:
            return self._cache[target_key]

        meta = data["models"][target_key]
        artifact_path = self.artifacts_dir / meta["artifact_filename"]
        if not artifact_path.exists():
            raise FileNotFoundError(f"Model artifact file {artifact_path} does not exist.")

        algo = meta.get("algorithm", "")
        if algo == "IsolationForest":
            model = IsolationForestAnomalyModel.load(str(artifact_path))
        elif algo == "RandomForestClassifier":
            model = RandomForestAnomalyModel.load(str(artifact_path))
        elif algo == "XGBoostClassifier":
            model = XGBoostAnomalyModel.load(str(artifact_path))
        elif algo == "LightGBMClassifier":
            model = LightGBMAnomalyModel.load(str(artifact_path))
        elif algo == "TemporalStatisticalDetector":
            model = TemporalStatisticalAnomalyModel.load(str(artifact_path))
        elif algo == "HybridConsensusDetector":
            model = HybridAnomalyModel.load(str(artifact_path))
        else:
            raise ValueError(f"Unknown model algorithm: {algo}")

        self._cache[target_key] = model
        return model

    def get_active_model(self) -> Optional[BaseAnomalyModel]:
        data = self._load_or_init_registry()
        active_key = data.get("active_model_key")
        if not active_key:
            return None
        return self.get_model(active_key)

    def promote_model(self, key: str) -> bool:
        data = self._load_or_init_registry()
        if key not in data["models"]:
            return False

        current_active = data.get("active_model_key")
        if current_active and current_active != key:
            data["previous_model_key"] = current_active
            if current_active in data["models"]:
                data["models"][current_active]["status"] = "retired"

        data["active_model_key"] = key
        data["models"][key]["status"] = "active"
        self._save_registry(data)
        return True

    def rollback_model(self) -> Optional[str]:
        data = self._load_or_init_registry()
        prev = data.get("previous_model_key")
        if not prev or prev not in data["models"]:
            return None

        curr = data.get("active_model_key")
        if curr and curr in data["models"]:
            data["models"][curr]["status"] = "retired"

        data["active_model_key"] = prev
        data["previous_model_key"] = curr
        data["models"][prev]["status"] = "active"
        self._save_registry(data)
        return prev

    def list_models(self) -> List[Dict[str, Any]]:
        data = self._load_or_init_registry()
        return list(data.get("models", {}).values())

    def get_active_meta(self) -> Optional[Dict[str, Any]]:
        data = self._load_or_init_registry()
        active_key = data.get("active_model_key")
        if active_key and active_key in data["models"]:
            return data["models"][active_key]
        return None


# Global registry singleton
registry = ModelRegistry()
