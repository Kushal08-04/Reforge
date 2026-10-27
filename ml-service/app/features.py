"""
Feature construction, schema definitions, and normalization for REFORGE ML.
Maintains versioned compatibility with the Node.js featureBuilder output.
"""

from typing import Dict, Any, List, Tuple
import datetime
import math
import numpy as np

FEATURE_SCHEMA_VERSION = "v1.2.0"

NUMERIC_FEATURE_NAMES = [
    "value",
    "stdValue",
    "rateOfChange",
    "relRateOfChange",
    "rollingMean",
    "stdRollingMean",
    "rollingStd",
    "historicalZScore",
    "crossSensorDeviation",
    "normalizedPeerResidual",
    "minutesSincePrevious",
    "historyWindowSize",
    "peerGroupSize",
    "timeOfDaySin",
    "timeOfDayCos",
    "fastRollingMean",
    "fastRollingStd",
    "volatilityRatio",
    "meanDivergence",
]

SENSOR_TYPES = ["temperature", "humidity", "pressure"]

SENSOR_TYPICAL_SCALES = {
    "temperature": {"mean": 25.0, "std": 3.0},
    "humidity": {"mean": 50.0, "std": 8.0},
    "pressure": {"mean": 1010.0, "std": 2.0},
}


def clean_feature_dict(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts and standardizes features from an observation dictionary or FeatureVector.
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

    # Sensor type extraction
    sensor_type = base_features.get("type", "")
    if not sensor_type and "entityId" in raw:
        entity_id = str(raw["entityId"])
        parts = entity_id.split("-")
        sensor_type = parts[-1] if parts else ""
    sensor_type = str(sensor_type).lower()

    scale_cfg = SENSOR_TYPICAL_SCALES.get(sensor_type, {"mean": 25.0, "std": 3.0})
    min_peer_std = {"temperature": 0.6, "humidity": 2.0, "pressure": 0.4}.get(sensor_type, 0.5)

    rolling_mean = get_float("rollingMean", val)
    rolling_std = get_float("rollingStd", scale_cfg["std"])
    if rolling_std <= 0:
        rolling_std = scale_cfg["std"]

    rate_of_change = get_float("rateOfChange", 0.0)
    rel_rate_of_change = float(np.clip(rate_of_change / (rolling_std + 0.01), -10.0, 10.0))

    hist_z = get_float("historicalZScore", 0.0)
    hist_z = float(np.clip(hist_z, -10.0, 10.0))

    # Regularize cross-sensor deviation and normalized peer residual
    peer_mean = base_features.get("crossSensorMean")
    peer_std = base_features.get("crossSensorStd")
    peer_sz = get_float("peerGroupSize", 0.0)

    if peer_mean is not None and peer_sz >= 2:
        eff_peer_std = max(float(peer_std or 0.0), min_peer_std)
        raw_res = val - float(peer_mean)
        norm_peer_res = float(np.clip(raw_res / eff_peer_std, -10.0, 10.0))
        cross_dev = norm_peer_res
    else:
        cross_dev = float(np.clip(get_float("crossSensorDeviation", 0.0), -10.0, 10.0))
        norm_peer_res = float(np.clip(get_float("normalizedPeerResidual", cross_dev), -10.0, 10.0))

    min_prev = get_float("minutesSincePrevious", 180.0)
    window_sz = get_float("historyWindowSize", 0.0)

    # Cyclical time-of-day encodings (sin / cos)
    sin_t = base_features.get("timeOfDaySin")
    cos_t = base_features.get("timeOfDayCos")
    if sin_t is None or cos_t is None:
        ts = raw.get("timestamp") or base_features.get("timestamp")
        if ts:
            try:
                if isinstance(ts, (int, float)):
                    dt = datetime.datetime.fromtimestamp(ts / 1000.0, tz=datetime.timezone.utc)
                elif isinstance(ts, str):
                    clean_ts = ts.replace("Z", "+00:00")
                    dt = datetime.datetime.fromisoformat(clean_ts)
                else:
                    dt = ts
                hour = dt.hour + dt.minute / 60.0 + dt.second / 3600.0
                rad = (hour / 24.0) * 2 * math.pi
                sin_t = math.sin(rad)
                cos_t = math.cos(rad)
            except Exception:
                sin_t = 0.0
                cos_t = 1.0
        else:
            sin_t = 0.0
            cos_t = 1.0
    else:
        sin_t = float(sin_t)
        cos_t = float(cos_t)

    # Dual-scale rolling statistics (fast vs slow)
    fast_mean = get_float("fastRollingMean", rolling_mean)
    fast_std = get_float("fastRollingStd", rolling_std)
    if fast_std <= 0:
        fast_std = scale_cfg["std"]

    vol_ratio = get_float("volatilityRatio", (fast_std + 0.01) / (rolling_std + 0.01))
    vol_ratio = float(np.clip(vol_ratio, 0.05, 20.0))

    mean_div = get_float("meanDivergence", fast_mean - rolling_mean)
    mean_div = float(np.clip(mean_div / scale_cfg["std"], -10.0, 10.0))

    std_val = (val - scale_cfg["mean"]) / (scale_cfg["std"] if scale_cfg["std"] > 0 else 1.0)
    std_rolling_mean = (rolling_mean - scale_cfg["mean"]) / (scale_cfg["std"] if scale_cfg["std"] > 0 else 1.0)

    return {
        "value": val,
        "stdValue": std_val,
        "rateOfChange": rate_of_change,
        "relRateOfChange": rel_rate_of_change,
        "rollingMean": rolling_mean,
        "stdRollingMean": std_rolling_mean,
        "rollingStd": rolling_std,
        "historicalZScore": hist_z,
        "crossSensorDeviation": cross_dev,
        "normalizedPeerResidual": norm_peer_res,
        "minutesSincePrevious": min_prev,
        "historyWindowSize": window_sz,
        "peerGroupSize": peer_sz,
        "timeOfDaySin": sin_t,
        "timeOfDayCos": cos_t,
        "fastRollingMean": fast_mean,
        "fastRollingStd": fast_std,
        "volatilityRatio": vol_ratio,
        "meanDivergence": mean_div,
        "type": sensor_type,
    }


def extract_feature_vector(raw: Dict[str, Any]) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Converts a single record into a numeric 1D numpy vector suitable for model inference.
    Maintains 22-dimensional feature schema with scale-invariant standardized representations.
    """
    cleaned = clean_feature_dict(raw)
    scale_cfg = SENSOR_TYPICAL_SCALES.get(cleaned.get("type", "").lower(), {"mean": 25.0, "std": 3.0})
    std_fast_mean = (cleaned["fastRollingMean"] - scale_cfg["mean"]) / scale_cfg["std"]
    std_rate_of_change = float(np.clip(cleaned["rateOfChange"] / scale_cfg["std"], -10.0, 10.0))

    vec = [
        cleaned["stdValue"],                 # 0: scale-normalized value (eliminates magnitude dominance)
        cleaned["stdValue"],                 # 1: stdValue
        std_rate_of_change,                  # 2: standardized rateOfChange
        cleaned["relRateOfChange"],          # 3: relRateOfChange
        cleaned["stdRollingMean"],           # 4: standardized rollingMean
        cleaned["stdRollingMean"],           # 5: stdRollingMean
        cleaned["rollingStd"],               # 6: rollingStd
        cleaned["historicalZScore"],         # 7: historicalZScore
        cleaned["crossSensorDeviation"],     # 8: crossSensorDeviation
        cleaned["normalizedPeerResidual"],   # 9: normalizedPeerResidual
        cleaned["minutesSincePrevious"],     # 10: minutesSincePrevious
        cleaned["historyWindowSize"],        # 11: historyWindowSize
        cleaned["peerGroupSize"],            # 12: peerGroupSize
        cleaned["timeOfDaySin"],             # 13: timeOfDaySin
        cleaned["timeOfDayCos"],             # 14: timeOfDayCos
        std_fast_mean,                       # 15: standardized fastRollingMean
        cleaned["fastRollingStd"],           # 16: fastRollingStd
        cleaned["volatilityRatio"],          # 17: volatilityRatio
        cleaned["meanDivergence"],           # 18: meanDivergence
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


def extract_features_for_model(
    records: List[Dict[str, Any]], model: Any
) -> Tuple[np.ndarray, List[str], List[Dict[str, Any]]]:
    """
    Dynamically extracts features matching the target model's schema version.
    Supports both v1.2.0 (22-dim multi-sensor) and v2.0.0-iot (33-dim IoT telemetry).
    """
    schema_ver = getattr(model, "feature_schema_version", "v1.2.0")

    if schema_ver == "v2.0.0-iot":
        from .dataset_pipeline import IOT_FEATURE_NAMES

        rows = []
        cleaned_dicts = []
        for r in records:
            base = r.get("features", r) if isinstance(r, dict) else dict(r)
            if not isinstance(base, dict):
                base = {}

            st = str(base.get("type", "")).lower()
            val = base.get("value")
            if val is None and isinstance(r.get("values"), dict):
                val = r["values"].get("value")
            try:
                val = float(val) if val is not None else 0.0
            except (TypeError, ValueError):
                val = 0.0

            roc = float(base.get("rateOfChange", 0.0))
            rmean = float(base.get("rollingMean", val))
            rstd = float(base.get("rollingStd", 1.0))
            zscore = float(base.get("historicalZScore", 0.0))
            sin_t = float(base.get("timeOfDaySin", 0.0))
            cos_t = float(base.get("timeOfDayCos", 1.0))

            temp_val = val if st == "temperature" else float(base.get("temp", 22.0))
            hum_val = val if st == "humidity" else float(base.get("humidity", 50.0))
            co_val = val if st in ("co", "gas_co") else float(base.get("co", 0.004))
            lpg_val = val if st in ("lpg", "gas_lpg") else float(base.get("lpg", 0.007))
            smoke_val = val if st in ("smoke", "gas_smoke") else float(base.get("smoke", 0.019))

            row = [
                temp_val,
                hum_val,
                co_val,
                lpg_val,
                smoke_val,
                float(base.get("light", 0.0)),
                float(base.get("motion", 0.0)),
                sin_t,
                cos_t,
                1.0 if base.get("device_b8_27", True) else 0.0,
                1.0 if base.get("device_00_0f", False) else 0.0,
                1.0 if base.get("device_1c_bf", False) else 0.0,
                (roc * 4.0) if st == "temperature" else float(base.get("temp_diff_1", 0.0)),
                roc if st == "temperature" else float(base.get("temp_rate_of_change", 0.0)),
                rmean if st == "temperature" else float(base.get("temp_rolling_mean_5", temp_val)),
                rstd if st == "temperature" else float(base.get("temp_rolling_std_5", 0.5)),
                rmean if st == "temperature" else float(base.get("temp_rolling_mean_20", temp_val)),
                rstd if st == "temperature" else float(base.get("temp_rolling_std_20", 0.5)),
                zscore if st == "temperature" else float(base.get("temp_zscore_20", 0.0)),
                (roc * 4.0) if st == "humidity" else float(base.get("humidity_diff_1", 0.0)),
                roc if st == "humidity" else float(base.get("humidity_rate_of_change", 0.0)),
                rmean if st == "humidity" else float(base.get("humidity_rolling_mean_20", hum_val)),
                rstd if st == "humidity" else float(base.get("humidity_rolling_std_20", 2.0)),
                zscore if st == "humidity" else float(base.get("humidity_zscore_20", 0.0)),
                float(base.get("co_diff_1", 0.0)),
                float(base.get("co_rate_of_change", 0.0)),
                float(base.get("lpg_diff_1", 0.0)),
                float(base.get("lpg_rate_of_change", 0.0)),
                float(base.get("smoke_diff_1", 0.0)),
                float(base.get("smoke_rate_of_change", 0.0)),
                float(base.get("gas_ratio_co_lpg", 0.57)),
                float(base.get("gas_ratio_smoke_lpg", 2.7)),
                float(base.get("dt_seconds", 4.0)),
            ]
            rows.append(row)
            cleaned_dicts.append(dict(zip(IOT_FEATURE_NAMES, row)))

        return np.array(rows, dtype=np.float32), IOT_FEATURE_NAMES, cleaned_dicts

    # Default fallback: v1.2.0 (22 features)
    X, feat_names = extract_feature_matrix(records)
    cleaned_dicts = [extract_feature_vector(r)[1] for r in records]
    return X, feat_names, cleaned_dicts

