"""
dataset_pipeline.py
-------------------
Reproducible dataset preparation and feature engineering pipeline for the
4 lakh IoT telemetry dataset (iot_telemetry_data.csv.zip).

Pipeline capabilities:
1. Extracts and parses the CSV from zip/file.
2. Preserves the original raw observations.
3. Converts timestamps consistently (Unix epoch float -> UTC datetime & float seconds).
4. Sorts observations chronologically.
5. Handles duplicates (drops exact duplicates, records exclusion reasons).
6. Creates stable, reproducible observation identifiers (e.g. "iot-{device}-{ts_int}-{idx}").
7. Constructs temporal and sensor-derived features without future data leakage.
8. Splits chronologically into 70% Train, 15% Validation, and 15% Held-out Test.
9. Persists dataset version metadata, split indices, and feature schema.
"""

import os
import zipfile
import json
import time
from typing import Dict, Any, Tuple, List, Optional
import numpy as np
import pandas as pd

DATASET_VERSION = "v1.0.0-iot-telemetry-405k"
FEATURE_SCHEMA_VERSION = "v2.0.0-iot"

DEVICE_MAP = {
    "b8:27:eb:bf:9d:51": "device_b8_27",
    "00:0f:00:70:91:0a": "device_00_0f",
    "1c:bf:ce:15:ec:4d": "device_1c_bf",
}

IOT_FEATURE_NAMES = [
    "temp",
    "humidity",
    "co",
    "lpg",
    "smoke",
    "light",
    "motion",
    "hour_sin",
    "hour_cos",
    "device_b8_27",
    "device_00_0f",
    "device_1c_bf",
    "temp_diff_1",
    "temp_rate_of_change",
    "temp_rolling_mean_5",
    "temp_rolling_std_5",
    "temp_rolling_mean_20",
    "temp_rolling_std_20",
    "temp_zscore_20",
    "humidity_diff_1",
    "humidity_rate_of_change",
    "humidity_rolling_mean_20",
    "humidity_rolling_std_20",
    "humidity_zscore_20",
    "co_diff_1",
    "co_rate_of_change",
    "lpg_diff_1",
    "lpg_rate_of_change",
    "smoke_diff_1",
    "smoke_rate_of_change",
    "gas_ratio_co_lpg",
    "gas_ratio_smoke_lpg",
    "dt_seconds",
]


def resolve_dataset_zip_path() -> str:
    """Locates the dataset zip archive."""
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "iot_telemetry_data.csv.zip")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "iot_telemetry_data.csv.zip")),
        r"C:\Users\Asus\OneDrive\Attachments\iot_telemetry_data.csv.zip",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    raise FileNotFoundError(f"Could not locate iot_telemetry_data.csv.zip in candidates: {candidates}")


def load_raw_dataset(zip_path: Optional[str] = None) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Loads raw CSV from archive, cleans exact duplicates, sorts chronologically.
    Returns:
        df: pd.DataFrame with stable 'observation_id', sorted by 'ts'.
        exclusion_report: Dict with exclusion metadata.
    """
    if zip_path is None:
        zip_path = resolve_dataset_zip_path()

    with zipfile.ZipFile(zip_path, "r") as zf:
        csv_filename = [n for n in zf.namelist() if n.endswith(".csv")][0]
        with zf.open(csv_filename) as f:
            df = pd.read_csv(f)

    initial_count = len(df)
    
    # 1. Identify and record exact duplicates
    dup_mask = df.duplicated(keep="first")
    num_duplicates = int(dup_mask.sum())
    
    # Exclusions report
    exclusion_report = {
        "dataset_archive": os.path.basename(zip_path),
        "initial_raw_records": initial_count,
        "dropped_exact_duplicates": num_duplicates,
        "dropped_malformed": 0,
        "eligible_records": initial_count - num_duplicates,
        "exclusion_reasons": {
            "exact_duplicate_rows": num_duplicates,
        },
    }

    if num_duplicates > 0:
        df = df[~dup_mask].copy()

    # 2. Consistent data typing
    df["ts"] = df["ts"].astype(float)
    df["device"] = df["device"].astype(str).str.strip().str.lower()
    df["temp"] = df["temp"].astype(np.float32)
    df["humidity"] = df["humidity"].astype(np.float32)
    df["co"] = df["co"].astype(np.float32)
    df["lpg"] = df["lpg"].astype(np.float32)
    df["smoke"] = df["smoke"].astype(np.float32)
    df["light"] = df["light"].astype(bool)
    df["motion"] = df["motion"].astype(bool)

    # 3. Sort chronologically
    df.sort_values(by=["ts", "device"], inplace=True)
    df.reset_index(drop=True, inplace=True)

    # 4. Generate stable observation IDs
    # Format: "iot-{device_short}-{timestamp_int}-{row_index}"
    dev_short = df["device"].apply(lambda d: d.replace(":", "")[-6:])
    ts_int = df["ts"].astype(np.int64)
    df["observation_id"] = "iot-" + dev_short + "-" + ts_int.astype(str) + "-" + df.index.astype(str)

    return df, exclusion_report


def extract_iot_features(df: pd.DataFrame) -> Tuple[np.ndarray, List[str]]:
    """
    Constructs high-dimensional temporal, spatial, and cross-sensor features
    without future data leakage. Computes streaming rolling statistics per device.
    Returns:
        feature_matrix: np.ndarray[float32] of shape (N, 33)
        feature_names: List[str]
    """
    N = len(df)
    features = np.zeros((N, len(IOT_FEATURE_NAMES)), dtype=np.float32)

    # Pre-extract numpy vectors for speed
    ts_arr = df["ts"].values
    dev_arr = df["device"].values
    temp_arr = df["temp"].values
    hum_arr = df["humidity"].values
    co_arr = df["co"].values
    lpg_arr = df["lpg"].values
    smoke_arr = df["smoke"].values
    light_arr = df["light"].values.astype(np.float32)
    motion_arr = df["motion"].values.astype(np.float32)

    # Diurnal time encodings
    hours = (ts_arr % 86400.0) / 3600.0
    hour_rads = (hours / 24.0) * (2.0 * np.pi)
    sin_hours = np.sin(hour_rads).astype(np.float32)
    cos_hours = np.cos(hour_rads).astype(np.float32)

    # Device history buffers: dev -> {last_ts, last_temp, last_hum, last_co, last_lpg, last_smoke, temp_h, hum_h, co_h, lpg_h, smoke_h}
    device_buffers: Dict[str, Dict[str, Any]] = {}
    for dev in DEVICE_MAP.keys():
        device_buffers[dev] = {
            "last_ts": None,
            "last_temp": None,
            "last_hum": None,
            "last_co": None,
            "last_lpg": None,
            "last_smoke": None,
            "temp_h": [],
            "hum_h": [],
            "co_h": [],
            "lpg_h": [],
            "smoke_h": [],
        }

    # Iterate row by row (chronological stream) to construct features without lookahead
    for i in range(N):
        d = dev_arr[i]
        t = ts_arr[i]
        temp = temp_arr[i]
        hum = hum_arr[i]
        co = co_arr[i]
        lpg = lpg_arr[i]
        smoke = smoke_arr[i]
        light = light_arr[i]
        motion = motion_arr[i]

        buf = device_buffers.get(d)
        if buf is None:
            buf = {
                "last_ts": None, "last_temp": None, "last_hum": None,
                "last_co": None, "last_lpg": None, "last_smoke": None,
                "temp_h": [], "hum_h": [], "co_h": [], "lpg_h": [], "smoke_h": []
            }
            device_buffers[d] = buf

        # Time delta
        if buf["last_ts"] is not None:
            dt = max(0.1, min(3600.0, float(t - buf["last_ts"])))
        else:
            dt = 4.0  # nominal median interval

        # Diffs and rates of change
        temp_diff = (temp - buf["last_temp"]) if buf["last_temp"] is not None else 0.0
        temp_roc = float(np.clip(temp_diff / dt, -5.0, 5.0))

        hum_diff = (hum - buf["last_hum"]) if buf["last_hum"] is not None else 0.0
        hum_roc = float(np.clip(hum_diff / dt, -10.0, 10.0))

        co_diff = (co - buf["last_co"]) if buf["last_co"] is not None else 0.0
        co_roc = float(np.clip(co_diff / dt, -0.01, 0.01))

        lpg_diff = (lpg - buf["last_lpg"]) if buf["last_lpg"] is not None else 0.0
        lpg_roc = float(np.clip(lpg_diff / dt, -0.01, 0.01))

        smoke_diff = (smoke - buf["last_smoke"]) if buf["last_smoke"] is not None else 0.0
        smoke_roc = float(np.clip(smoke_diff / dt, -0.02, 0.02))

        # Rolling statistics
        temp_h = buf["temp_h"]
        hum_h = buf["hum_h"]

        # Fast 5-sample
        if len(temp_h) >= 2:
            t_win5 = temp_h[-5:]
            temp_mean5 = float(np.mean(t_win5))
            temp_std5 = max(0.05, float(np.std(t_win5)))
        else:
            temp_mean5 = temp
            temp_std5 = 0.5

        # Slow 20-sample
        if len(temp_h) >= 2:
            t_win20 = temp_h[-20:]
            temp_mean20 = float(np.mean(t_win20))
            temp_std20 = max(0.05, float(np.std(t_win20)))
            temp_z20 = float(np.clip((temp - temp_mean20) / temp_std20, -10.0, 10.0))
        else:
            temp_mean20 = temp
            temp_std20 = 1.0
            temp_z20 = 0.0

        if len(hum_h) >= 2:
            h_win20 = hum_h[-20:]
            hum_mean20 = float(np.mean(h_win20))
            hum_std20 = max(0.2, float(np.std(h_win20)))
            hum_z20 = float(np.clip((hum - hum_mean20) / hum_std20, -10.0, 10.0))
        else:
            hum_mean20 = hum
            hum_std20 = 2.0
            hum_z20 = 0.0

        # Gas ratios
        gas_ratio_co_lpg = float(np.clip(co / (lpg + 1e-6), 0.0, 10.0))
        gas_ratio_smoke_lpg = float(np.clip(smoke / (lpg + 1e-6), 0.0, 10.0))

        # Device one-hot
        dev_b8 = 1.0 if d == "b8:27:eb:bf:9d:51" else 0.0
        dev_00 = 1.0 if d == "00:0f:00:70:91:0a" else 0.0
        dev_1c = 1.0 if d == "1c:bf:ce:15:ec:4d" else 0.0

        # Pack row into feature array
        features[i] = [
            temp,
            hum,
            co,
            lpg,
            smoke,
            light,
            motion,
            sin_hours[i],
            cos_hours[i],
            dev_b8,
            dev_00,
            dev_1c,
            temp_diff,
            temp_roc,
            temp_mean5,
            temp_std5,
            temp_mean20,
            temp_std20,
            temp_z20,
            hum_diff,
            hum_roc,
            hum_mean20,
            hum_std20,
            hum_z20,
            co_diff,
            co_roc,
            lpg_diff,
            lpg_roc,
            smoke_diff,
            smoke_roc,
            gas_ratio_co_lpg,
            gas_ratio_smoke_lpg,
            dt,
        ]

        # Update historical buffer (bounded to last 30 samples)
        buf["last_ts"] = t
        buf["last_temp"] = temp
        buf["last_hum"] = hum
        buf["last_co"] = co
        buf["last_lpg"] = lpg
        buf["last_smoke"] = smoke
        temp_h.append(temp)
        if len(temp_h) > 30: temp_h.pop(0)
        hum_h.append(hum)
        if len(hum_h) > 30: hum_h.pop(0)

    return features, IOT_FEATURE_NAMES


def split_chronological(
    df: pd.DataFrame,
    features: np.ndarray,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
) -> Dict[str, Any]:
    """
    Performs strict chronological 70% / 15% / 15% partition.
    Returns:
        partitions: Dict with train, val, test subsets, record counts, and timestamp boundaries.
    """
    total = len(df)
    n_train = int(total * train_ratio)
    n_val = int(total * val_ratio)
    n_test = total - n_train - n_val

    idx_train = slice(0, n_train)
    idx_val = slice(n_train, n_train + n_val)
    idx_test = slice(n_train + n_val, total)

    train_df = df.iloc[idx_train]
    val_df = df.iloc[idx_val]
    test_df = df.iloc[idx_test]

    train_X = features[idx_train]
    val_X = features[idx_val]
    test_X = features[idx_test]

    split_metadata = {
        "dataset_version": DATASET_VERSION,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "total_records": total,
        "partitions": {
            "train": {
                "count": n_train,
                "ratio": round(n_train / total, 4),
                "start_ts": float(train_df["ts"].min()),
                "end_ts": float(train_df["ts"].max()),
                "start_iso": pd.to_datetime(train_df["ts"].min(), unit="s", utc=True).isoformat(),
                "end_iso": pd.to_datetime(train_df["ts"].max(), unit="s", utc=True).isoformat(),
            },
            "validation": {
                "count": n_val,
                "ratio": round(n_val / total, 4),
                "start_ts": float(val_df["ts"].min()),
                "end_ts": float(val_df["ts"].max()),
                "start_iso": pd.to_datetime(val_df["ts"].min(), unit="s", utc=True).isoformat(),
                "end_iso": pd.to_datetime(val_df["ts"].max(), unit="s", utc=True).isoformat(),
            },
            "test": {
                "count": n_test,
                "ratio": round(n_test / total, 4),
                "start_ts": float(test_df["ts"].min()),
                "end_ts": float(test_df["ts"].max()),
                "start_iso": pd.to_datetime(test_df["ts"].min(), unit="s", utc=True).isoformat(),
                "end_iso": pd.to_datetime(test_df["ts"].max(), unit="s", utc=True).isoformat(),
            },
        },
    }

    return {
        "train_df": train_df,
        "val_df": val_df,
        "test_df": test_df,
        "train_X": train_X,
        "val_X": val_X,
        "test_X": test_X,
        "metadata": split_metadata,
    }
