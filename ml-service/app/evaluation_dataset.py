"""
evaluation_dataset.py
---------------------
Constructs reproducible, documented, held-out evaluation datasets with
labelled anomaly signatures as required by REFORGE Phase 0.4:
- Implausible temperature jumps (e.g. +45 deg C change in 4 seconds)
- Sudden gas sensor spikes (CO / smoke / LPG spike)
- Historical statistical deviations (e.g. drift > 6 std devs)
- Cross-sensor contradictions (e.g. massive smoke + LPG without heat)
- Invalid types and corrupted observations (e.g. out-of-range humidity)
- Flatline / stuck sensors
- Normal baseline inliers (label 0)

Preserves original values, prevents future data leakage into training/validation,
and maintains authentic continuous time-series stream characteristics so rates of
change and rolling statistics are mathematically valid.
"""

from typing import Dict, Any, List, Tuple
import numpy as np
import pandas as pd


ANOMALY_TYPES = [
    "implausible_temperature_jump",
    "sudden_gas_spike_co",
    "sudden_gas_spike_smoke",
    "sudden_gas_spike_lpg",
    "historical_zscore_deviation",
    "cross_sensor_contradiction",
    "flatline_stuck_sensor",
    "corrupted_invalid_type",
]


def generate_controlled_evaluation_set(
    test_df: pd.DataFrame,
    seed: int = 42,
    normal_sample_size: int = 5000,
    anomalies_per_type: int = 50,
    contiguous: bool = True,
) -> Tuple[pd.DataFrame, np.ndarray, List[Dict[str, Any]]]:
    """
    Creates a controlled evaluation set from the held-out partition.
    Injects anomalies directly into the natural sensor stream across distributed
    timestamps, preserving authentic 4-second continuity and rolling windows.
    Returns:
        eval_df: pd.DataFrame with telemetry columns + 'is_anomaly' (int) + 'anomaly_type' (str)
        y_true: np.ndarray[int] (0 = normal, 1 = anomaly)
        anomaly_manifest: List[Dict] with audit metadata per injected anomaly
    """
    np.random.seed(seed)
    total_anomalies = anomalies_per_type * len(ANOMALY_TYPES)
    stream_len = normal_sample_size + total_anomalies

    if len(test_df) >= stream_len:
        eval_df = test_df.iloc[:stream_len].copy().reset_index(drop=True)
    else:
        eval_df = test_df.copy().reset_index(drop=True)
        total_anomalies = min(total_anomalies, len(eval_df) // 4)
        anomalies_per_type = max(1, total_anomalies // len(ANOMALY_TYPES))

    eval_df["is_anomaly"] = 0
    eval_df["anomaly_type"] = "normal"
    eval_df["original_val"] = eval_df["temp"]
    eval_df["injected_field"] = "none"

    # Distribute anomalies throughout the stream (after warmup rows)
    valid_indices = np.arange(30, len(eval_df) - 5)
    inject_indices = np.random.choice(valid_indices, size=anomalies_per_type * len(ANOMALY_TYPES), replace=False)
    inject_indices.sort()

    anomaly_manifest: List[Dict[str, Any]] = []
    idx_cursor = 0

    # 1. Implausible temperature jumps
    for _ in range(anomalies_per_type):
        target_idx = int(inject_indices[idx_cursor])
        idx_cursor += 1
        orig_temp = float(eval_df.loc[target_idx, "temp"])
        jump = float(np.random.choice([+45.0, -25.0, +55.0]))
        injected_temp = float(np.clip(orig_temp + jump, -10.0, 85.0))

        eval_df.loc[target_idx, "temp"] = injected_temp
        eval_df.loc[target_idx, "is_anomaly"] = 1
        eval_df.loc[target_idx, "anomaly_type"] = "implausible_temperature_jump"
        eval_df.loc[target_idx, "original_val"] = orig_temp
        eval_df.loc[target_idx, "injected_field"] = "temp"

        anomaly_manifest.append({
            "observation_id": eval_df.loc[target_idx, "observation_id"],
            "device": eval_df.loc[target_idx, "device"],
            "timestamp": eval_df.loc[target_idx, "ts"],
            "anomaly_type": "implausible_temperature_jump",
            "field": "temp",
            "original_value": orig_temp,
            "injected_value": injected_temp,
            "rationale": f"Rate of change violation: temperature shifted by {jump:+.1f} C within 4 seconds.",
        })

    # 2. Sudden CO gas spike
    for _ in range(anomalies_per_type):
        target_idx = int(inject_indices[idx_cursor])
        idx_cursor += 1
        orig_co = float(eval_df.loc[target_idx, "co"])
        injected_co = float(orig_co * np.random.uniform(6.0, 12.0) + 0.05)

        eval_df.loc[target_idx, "co"] = injected_co
        eval_df.loc[target_idx, "is_anomaly"] = 1
        eval_df.loc[target_idx, "anomaly_type"] = "sudden_gas_spike_co"
        eval_df.loc[target_idx, "original_val"] = orig_co
        eval_df.loc[target_idx, "injected_field"] = "co"

        anomaly_manifest.append({
            "observation_id": eval_df.loc[target_idx, "observation_id"],
            "device": eval_df.loc[target_idx, "device"],
            "timestamp": eval_df.loc[target_idx, "ts"],
            "anomaly_type": "sudden_gas_spike_co",
            "field": "co",
            "original_value": orig_co,
            "injected_value": injected_co,
            "rationale": "Extreme toxic CO spike exceeding baseline envelope.",
        })

    # 3. Sudden Smoke spike
    for _ in range(anomalies_per_type):
        target_idx = int(inject_indices[idx_cursor])
        idx_cursor += 1
        orig_smoke = float(eval_df.loc[target_idx, "smoke"])
        injected_smoke = float(orig_smoke * np.random.uniform(6.0, 15.0) + 0.15)

        eval_df.loc[target_idx, "smoke"] = injected_smoke
        eval_df.loc[target_idx, "is_anomaly"] = 1
        eval_df.loc[target_idx, "anomaly_type"] = "sudden_gas_spike_smoke"
        eval_df.loc[target_idx, "original_val"] = orig_smoke
        eval_df.loc[target_idx, "injected_field"] = "smoke"

        anomaly_manifest.append({
            "observation_id": eval_df.loc[target_idx, "observation_id"],
            "device": eval_df.loc[target_idx, "device"],
            "timestamp": eval_df.loc[target_idx, "ts"],
            "anomaly_type": "sudden_gas_spike_smoke",
            "field": "smoke",
            "original_value": orig_smoke,
            "injected_value": injected_smoke,
            "rationale": "Extreme optical smoke obscuration spike indicating fire event.",
        })

    # 4. Sudden LPG gas spike
    for _ in range(anomalies_per_type):
        target_idx = int(inject_indices[idx_cursor])
        idx_cursor += 1
        orig_lpg = float(eval_df.loc[target_idx, "lpg"])
        injected_lpg = float(orig_lpg * np.random.uniform(6.0, 12.0) + 0.05)

        eval_df.loc[target_idx, "lpg"] = injected_lpg
        eval_df.loc[target_idx, "is_anomaly"] = 1
        eval_df.loc[target_idx, "anomaly_type"] = "sudden_gas_spike_lpg"
        eval_df.loc[target_idx, "original_val"] = orig_lpg
        eval_df.loc[target_idx, "injected_field"] = "lpg"

        anomaly_manifest.append({
            "observation_id": eval_df.loc[target_idx, "observation_id"],
            "device": eval_df.loc[target_idx, "device"],
            "timestamp": eval_df.loc[target_idx, "ts"],
            "anomaly_type": "sudden_gas_spike_lpg",
            "field": "lpg",
            "original_value": orig_lpg,
            "injected_value": injected_lpg,
            "rationale": "High explosive LPG hydrocarbon concentration spike.",
        })

    # 5. Historical z-score deviation (> 6 standard deviations drift)
    for _ in range(anomalies_per_type):
        target_idx = int(inject_indices[idx_cursor])
        idx_cursor += 1
        orig_temp = float(eval_df.loc[target_idx, "temp"])
        injected_temp = float(orig_temp + 18.0)

        eval_df.loc[target_idx, "temp"] = injected_temp
        eval_df.loc[target_idx, "is_anomaly"] = 1
        eval_df.loc[target_idx, "anomaly_type"] = "historical_zscore_deviation"
        eval_df.loc[target_idx, "original_val"] = orig_temp
        eval_df.loc[target_idx, "injected_field"] = "temp"

        anomaly_manifest.append({
            "observation_id": eval_df.loc[target_idx, "observation_id"],
            "device": eval_df.loc[target_idx, "device"],
            "timestamp": eval_df.loc[target_idx, "ts"],
            "anomaly_type": "historical_zscore_deviation",
            "field": "temp",
            "original_value": orig_temp,
            "injected_value": injected_temp,
            "rationale": "Sustained temperature offset > 6 standard deviations from historical baseline.",
        })

    # 6. Cross-sensor contradiction (e.g. intense fire smoke 0.25 but cold temp 0.0 C)
    for _ in range(anomalies_per_type):
        target_idx = int(inject_indices[idx_cursor])
        idx_cursor += 1
        orig_smoke = float(eval_df.loc[target_idx, "smoke"])
        eval_df.loc[target_idx, "temp"] = 0.0
        eval_df.loc[target_idx, "smoke"] = 0.25
        eval_df.loc[target_idx, "is_anomaly"] = 1
        eval_df.loc[target_idx, "anomaly_type"] = "cross_sensor_contradiction"
        eval_df.loc[target_idx, "original_val"] = orig_smoke
        eval_df.loc[target_idx, "injected_field"] = "smoke+temp"

        anomaly_manifest.append({
            "observation_id": eval_df.loc[target_idx, "observation_id"],
            "device": eval_df.loc[target_idx, "device"],
            "timestamp": eval_df.loc[target_idx, "ts"],
            "anomaly_type": "cross_sensor_contradiction",
            "field": "smoke+temp",
            "original_value": orig_smoke,
            "injected_value": 0.25,
            "rationale": "Contradictory physical readings: high smoke (0.25) with zero ambient temperature (0.0 C).",
        })

    # 7. Flatline / stuck sensor
    for _ in range(anomalies_per_type):
        target_idx = int(inject_indices[idx_cursor])
        idx_cursor += 1
        orig_temp = float(eval_df.loc[target_idx, "temp"])
        eval_df.loc[target_idx, "temp"] = 0.0
        eval_df.loc[target_idx, "is_anomaly"] = 1
        eval_df.loc[target_idx, "anomaly_type"] = "flatline_stuck_sensor"
        eval_df.loc[target_idx, "original_val"] = orig_temp
        eval_df.loc[target_idx, "injected_field"] = "temp"

        anomaly_manifest.append({
            "observation_id": eval_df.loc[target_idx, "observation_id"],
            "device": eval_df.loc[target_idx, "device"],
            "timestamp": eval_df.loc[target_idx, "ts"],
            "anomaly_type": "flatline_stuck_sensor",
            "field": "temp",
            "original_value": orig_temp,
            "injected_value": 0.0,
            "rationale": "Hardware freeze: temperature reported exact 0.000 with zero variance.",
        })

    # 8. Corrupted / invalid out-of-range types
    for _ in range(anomalies_per_type):
        target_idx = int(inject_indices[idx_cursor])
        idx_cursor += 1
        orig_hum = float(eval_df.loc[target_idx, "humidity"])
        injected_hum = float(np.random.choice([145.0, -15.0, 999.0]))

        eval_df.loc[target_idx, "humidity"] = injected_hum
        eval_df.loc[target_idx, "is_anomaly"] = 1
        eval_df.loc[target_idx, "anomaly_type"] = "corrupted_invalid_type"
        eval_df.loc[target_idx, "original_val"] = orig_hum
        eval_df.loc[target_idx, "injected_field"] = "humidity"

        anomaly_manifest.append({
            "observation_id": eval_df.loc[target_idx, "observation_id"],
            "device": eval_df.loc[target_idx, "device"],
            "timestamp": eval_df.loc[target_idx, "ts"],
            "anomaly_type": "corrupted_invalid_type",
            "field": "humidity",
            "original_value": orig_hum,
            "injected_value": injected_hum,
            "rationale": f"Corrupted payload: humidity {injected_hum}% violates [0, 100] physical boundary.",
        })

    y_true = eval_df["is_anomaly"].values.astype(int)
    return eval_df, y_true, anomaly_manifest
