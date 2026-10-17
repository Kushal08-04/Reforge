"""
Feature construction, schema definitions, and normalization for REFORGE ML.
Maintains versioned compatibility with the Node.js featureBuilder output.
"""

from typing import Dict, Any, List, Tuple
import numpy as np

FEATURE_SCHEMA_VERSION = "v1.0.0"

NUMERIC_FEATURE_NAMES = [
    "value",
    "rateOfChange",
    "rollingMean",
    "rollingStd",
    "historicalZScore",
    "crossSensorDeviation",
    "minutesSincePrevious",
    "historyWindowSize",
    "peerGroupSize",
]

SENSOR_TYPES = ["temperature", "humidity", "pressure"]


def clean_feature_dict(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts features from an observation dictionary or FeatureVector object.
    Supports both direct feature snapshots and raw observation objects.
    """
    if "features" in raw and isinstance(raw["features"], dict):
        base_features = raw["features"]
    else:
        base_features = raw

    val = base_features.get("value")
    if val is None and "values" in raw and isinstance(raw["values"], dict):
        val = raw["values"].get("value")
    try:
        val = float(val) if val is not None else 0.0
    except (TypeError, ValueError):
        val = 0.0

    def get_float(k: str, default: float = 0.0) -> float:
        v = base_features.get(k)
        if v is None:
            return default
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    rate_of_change = get_float("rateOfChange", 0.0)
    rolling_mean = get_float("rollingMean", val)
    rolling_std = get_float("rollingStd", 1.0)
    if rolling_std <= 0:
        rolling_std = 1.0

    hist_z = get_float("historicalZScore", 0.0)
    cross_dev = get_float("crossSensorDeviation", 0.0)
    min_prev = get_float("minutesSincePrevious", 180.0)
    window_sz = get_float("historyWindowSize", 0.0)
    peer_sz = get_float("peerGroupSize", 0.0)

    # Sensor type one-hot encoding
    sensor_type = base_features.get("type", "")
    if not sensor_type and "entityId" in raw:
        entity_id = str(raw["entityId"])
        parts = entity_id.split("-")
        sensor_type = parts[-1] if parts else ""

    return {
        "value": val,
        "rateOfChange": rate_of_change,
        "rollingMean": rolling_mean,
        "rollingStd": rolling_std,
        "historicalZScore": hist_z,
        "crossSensorDeviation": cross_dev,
        "minutesSincePrevious": min_prev,
        "historyWindowSize": window_sz,
        "peerGroupSize": peer_sz,
        "type": sensor_type,
    }


def extract_feature_vector(raw: Dict[str, Any]) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Converts a single record into a numeric 1D numpy vector suitable for model inference.
    """
    cleaned = clean_feature_dict(raw)
    vec = [
        cleaned["value"],
        cleaned["rateOfChange"],
        cleaned["rollingMean"],
        cleaned["rollingStd"],
        cleaned["historicalZScore"],
        cleaned["crossSensorDeviation"],
        cleaned["minutesSincePrevious"],
        cleaned["historyWindowSize"],
        cleaned["peerGroupSize"],
    ]
    # Add one-hot flags for sensor type
    t = cleaned.get("type", "").lower()
    for st in SENSOR_TYPES:
        vec.append(1.0 if t == st else 0.0)

    return np.array(vec, dtype=np.float32), cleaned


def extract_feature_matrix(records: List[Dict[str, Any]]) -> Tuple[np.ndarray, List[str]]:
    """
    Converts a list of records into a 2D numpy matrix X.
    Returns (X, feature_names).
    """
    rows = []
    for r in records:
        vec, _ = extract_feature_vector(r)
        rows.append(vec)

    feature_names = list(NUMERIC_FEATURE_NAMES) + [f"is_type_{st}" for st in SENSOR_TYPES]
    return np.array(rows, dtype=np.float32), feature_names
