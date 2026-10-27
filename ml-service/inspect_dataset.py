import zipfile
import io
import json
import os
import sys
import numpy as np
import pandas as pd

ZIP_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "iot_telemetry_data.csv.zip"))
if not os.path.exists(ZIP_PATH):
    # fallback
    ZIP_PATH = r"C:\Users\Asus\OneDrive\Attachments\iot_telemetry_data.csv.zip"

print(f"Inspecting archive: {ZIP_PATH}")

with zipfile.ZipFile(ZIP_PATH, 'r') as zf:
    namelist = zf.namelist()
    infolist = zf.infolist()
    print("Files in archive:")
    for info in infolist:
        print(f"  - {info.filename}: compressed {info.compress_size:,} bytes, uncompressed {info.file_size:,} bytes")
    
    target_csv = namelist[0]
    print(f"\nTarget CSV: {target_csv}")
    
    with zf.open(target_csv) as f:
        # Read with chunking
        chunk_size = 100000
        total_rows = 0
        missing_counts = {}
        devices = {}
        light_counts = {}
        motion_counts = {}
        
        # Track min/max timestamps
        min_ts = float('inf')
        max_ts = float('-inf')
        
        # For numeric distributions, accumulate summary statistics
        numeric_cols = ["co", "humidity", "lpg", "smoke", "temp"]
        stats_accum = {col: {"min": float('inf'), "max": float('-inf'), "sum": 0.0, "sq_sum": 0.0, "count": 0} for col in numeric_cols}
        
        # Check duplicate keys (device, ts)
        seen_keys = set()
        duplicate_key_count = 0
        exact_duplicate_count = 0
        
        # Track out of order timestamps per device
        device_last_ts = {}
        out_of_order_count = 0
        
        first_chunk = True
        columns = []
        
        for chunk in pd.read_csv(f, chunksize=chunk_size):
            if first_chunk:
                columns = list(chunk.columns)
                for c in columns:
                    missing_counts[c] = 0
                first_chunk = False
            
            total_rows += len(chunk)
            
            # Check missing
            for c in columns:
                missing_counts[c] += int(chunk[c].isna().sum())
            
            # Devices
            for dev, count in chunk["device"].value_counts().items():
                devices[dev] = devices.get(dev, 0) + int(count)
                
            # Light & Motion
            for val, count in chunk["light"].value_counts().items():
                light_counts[str(val)] = light_counts.get(str(val), 0) + int(count)
            for val, count in chunk["motion"].value_counts().items():
                motion_counts[str(val)] = motion_counts.get(str(val), 0) + int(count)
                
            # Timestamps
            ts_vals = chunk["ts"].astype(float).values
            chunk_min_ts = float(ts_vals.min())
            chunk_max_ts = float(ts_vals.max())
            if chunk_min_ts < min_ts: min_ts = chunk_min_ts
            if chunk_max_ts > max_ts: max_ts = chunk_max_ts
            
            # Numeric stats
            for col in numeric_cols:
                vals = chunk[col].astype(float).values
                col_min = float(vals.min())
                col_max = float(vals.max())
                if col_min < stats_accum[col]["min"]: stats_accum[col]["min"] = col_min
                if col_max > stats_accum[col]["max"]: stats_accum[col]["max"] = col_max
                stats_accum[col]["sum"] += float(vals.sum())
                stats_accum[col]["sq_sum"] += float((vals ** 2).sum())
                stats_accum[col]["count"] += len(vals)
                
            # Chronological check per device in raw file
            for dev, t in zip(chunk["device"].values, ts_vals):
                if dev in device_last_ts and t < device_last_ts[dev]:
                    out_of_order_count += 1
                device_last_ts[dev] = t
                
            # Check duplicates (sample or via hash)
            for dev, t in zip(chunk["device"].values, ts_vals):
                key = (dev, t)
                if key in seen_keys:
                    duplicate_key_count += 1
                else:
                    seen_keys.add(key)

print(f"\n--- DATASET PROFILE SUMMARY ---")
print(f"Total raw observations: {total_rows:,}")
print(f"Columns ({len(columns)}): {columns}")
print(f"\nMissing values per column:")
for c, cnt in missing_counts.items():
    print(f"  {c}: {cnt:,} ({cnt/total_rows*100:.2f}%)")

print(f"\nDevices ({len(devices)} unique):")
for dev, cnt in sorted(devices.items(), key=lambda x: -x[1]):
    print(f"  {dev}: {cnt:,} records ({cnt/total_rows*100:.2f}%)")

print(f"\nTimestamp range:")
start_dt = pd.to_datetime(min_ts, unit='s', utc=True)
end_dt = pd.to_datetime(max_ts, unit='s', utc=True)
print(f"  Min ts: {min_ts} ({start_dt.isoformat()})")
print(f"  Max ts: {max_ts} ({end_dt.isoformat()})")
print(f"  Span: {end_dt - start_dt}")
print(f"  Raw out-of-order sequence steps in file: {out_of_order_count:,}")
print(f"  Duplicate (device, ts) collision count: {duplicate_key_count:,}")

print(f"\nCategorical / Binary distributions:")
print(f"  light: {light_counts}")
print(f"  motion: {motion_counts}")

print(f"\nNumeric Sensor Distributions:")
for col in numeric_cols:
    s = stats_accum[col]
    mean_val = s["sum"] / s["count"] if s["count"] > 0 else 0
    var_val = (s["sq_sum"] / s["count"]) - (mean_val ** 2) if s["count"] > 0 else 0
    std_val = np.sqrt(max(0, var_val))
    print(f"  {col}: min={s['min']:.6f}, max={s['max']:.6f}, mean={mean_val:.6f}, std={std_val:.6f}")
