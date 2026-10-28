import sys
import os
import json
import time
from pathlib import Path
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import numpy as np
import pandas as pd
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    roc_auc_score,
    average_precision_score,
    precision_recall_curve,
)

ml_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ml_dir))

from app.dataset_pipeline import extract_iot_features, split_chronological, DATASET_VERSION, FEATURE_SCHEMA_VERSION
from app.evaluation_dataset import generate_controlled_evaluation_set
from app.models.isolation_forest import IsolationForestAnomalyModel
from app.models.registry import registry

ARTIFACTS_DIR = ml_dir / "artifacts"
dataset_path = Path(r"..\Datasets\iot_telemetry_data.csv").resolve()
if not dataset_path.exists():
    dataset_path = Path(r"C:\Users\Asus\OneDrive\ドキュメント\Projects\Reforge ETL pipeline mini project\Datasets\iot_telemetry_data.csv")

print(f"Loading raw dataset from {dataset_path}...")
df = pd.read_csv(dataset_path)
df.drop_duplicates(subset=["ts", "device", "co", "humidity", "light", "lpg", "motion", "smoke", "temp"], inplace=True)
df["light"] = df["light"].astype(bool)
df["motion"] = df["motion"].astype(bool)
df.sort_values(by=["ts", "device"], inplace=True)
df.reset_index(drop=True, inplace=True)
dev_short = df["device"].apply(lambda d: d.replace(":", "")[-6:])
ts_int = df["ts"].astype(np.int64)
df["observation_id"] = "iot-" + dev_short + "-" + ts_int.astype(str) + "-" + df.index.astype(str)

print("Extracting streaming features for 70,000 observations...")
features, feature_names = extract_iot_features(df.iloc[:70000].copy())
split_data = split_chronological(df.iloc[:70000], features, train_ratio=0.70, val_ratio=0.15)

print("Generating 5,400-record controlled evaluation set...")
eval_df, y_eval_true, anomaly_manifest = generate_controlled_evaluation_set(
    split_data["test_df"], seed=42, normal_sample_size=5000, anomalies_per_type=50
)
eval_features, _ = extract_iot_features(eval_df)

print("Training high-precision Isolation Forest model (v2.0.0-iot / v2.1.0-iot)...")
t0 = time.time()
model = IsolationForestAnomalyModel(
    name="isolation_forest",
    version="v2.0.0-iot",
    hyperparameters={
        "n_estimators": 150,
        "contamination": 0.01,
        "max_samples": 512,
        "random_state": 42,
        "feature_indices": [0, 1, 2, 3, 4],  # temp, humidity, co, lpg, smoke
        "score_shift": -0.103,
        "score_scale": 18.0,
        "calibrated_threshold": 0.50,
        "train_sample_size": 50000,
    },
    feature_schema_version=FEATURE_SCHEMA_VERSION,
)
model.fit(split_data["train_X"][:50000])
train_time = time.time() - t0

# Latency test
sub = eval_features[:500]
t_lat = []
for _ in range(5):
    t_start = time.perf_counter()
    _ = model.predict_scores(sub)
    t_lat.append((time.perf_counter() - t_start) * 1000.0 / len(sub))
latency_ms = float(np.median(t_lat))

print("Evaluating on held-out controlled evaluation set...")
is_anom, raw_scores, norm_scores = model.predict_scores(eval_features)
tn, fp, fn, tp = confusion_matrix(y_eval_true, is_anom).ravel()
prec = float(precision_score(y_eval_true, is_anom, zero_division=0))
rec = float(recall_score(y_eval_true, is_anom, zero_division=0))
f1 = float(f1_score(y_eval_true, is_anom, zero_division=0))
spec = float(tn / (tn + fp))
fpr = float(fp / (tn + fp))
roc_auc = float(roc_auc_score(y_eval_true, norm_scores))
pr_auc = float(average_precision_score(y_eval_true, norm_scores))

metrics = {
    "tp": int(tp),
    "fp": int(fp),
    "tn": int(tn),
    "fn": int(fn),
    "precision": round(prec, 4),
    "recall": round(rec, 4),
    "f1": round(f1, 4),
    "specificity": round(spec, 4),
    "fpr": round(fpr, 4),
    "roc_auc": round(roc_auc, 4),
    "pr_auc": round(pr_auc, 4),
}

print(f"\nFinal Metrics for Isolation Forest:")
print(f"  Precision:   {metrics['precision'] * 100:.2f}% (Target was >91%)")
print(f"  Recall:      {metrics['recall'] * 100:.2f}%")
print(f"  F1 Score:    {metrics['f1']:.4f}")
print(f"  Specificity: {metrics['specificity'] * 100:.2f}%")
print(f"  FPR:         {metrics['fpr'] * 100:.2f}%")
print(f"  ROC-AUC:     {metrics['roc_auc']:.4f}")
print(f"  PR-AUC:      {metrics['pr_auc']:.4f}")
print(f"  Confusion:   TP={tp}, FP={fp}, TN={tn}, FN={fn}")

# Save artifacts
v2_path = ARTIFACTS_DIR / "isolation_forest_v2.0.0-iot.joblib"
model.save(str(v2_path))
print(f"Saved model artifact to {v2_path}")

# Update registry.json
registry_path = ARTIFACTS_DIR / "registry.json"
if registry_path.exists():
    with open(registry_path, "r", encoding="utf-8") as f:
        reg_data = json.load(f)
    
    key = "isolation_forest:v2.0.0-iot"
    if key in reg_data.get("models", {}):
        reg_data["models"][key]["metrics"]["controlled_eval"] = metrics
        reg_data["models"][key]["metrics"]["training_duration_s"] = round(train_time, 2)
        reg_data["models"][key]["metrics"]["inference_latency_ms"] = round(latency_ms, 3)
        reg_data["models"][key]["hyperparameters"] = model.hyperparameters
        with open(registry_path, "w", encoding="utf-8") as f:
            json.dump(reg_data, f, indent=2)
        print("Updated registry.json with tuned Isolation Forest metrics.")

# Update model_comparison_report.json
report_json_path = ARTIFACTS_DIR / "model_comparison_report.json"
if report_json_path.exists():
    with open(report_json_path, "r", encoding="utf-8") as f:
        rep_json = json.load(f)
    for m in rep_json.get("models", []):
        if m.get("model_name") == "Isolation Forest":
            m["metrics"] = metrics
            m["threshold"] = 0.50
            m["training_time_s"] = round(train_time, 2)
            m["inference_latency_ms"] = round(latency_ms, 3)
    with open(report_json_path, "w", encoding="utf-8") as f:
        json.dump(rep_json, f, indent=2)
    print("Updated model_comparison_report.json.")

# Update precision_curves_data.json for isolation_forest
curves_path = ARTIFACTS_DIR / "precision_curves_data.json"
if curves_path.exists():
    with open(curves_path, "r", encoding="utf-8") as f:
        curves_data = json.load(f)
    
    pr_precs, pr_recs, pr_threshs = precision_recall_curve(y_eval_true, norm_scores)
    # Subsample curve points for compactness
    step = max(1, len(pr_threshs) // 100)
    sub_precs = [round(float(p), 4) for p in pr_precs[::step]]
    sub_recs = [round(float(r), 4) for r in pr_recs[::step]]
    sub_threshs = [round(float(t), 4) for t in pr_threshs[::step]]
    
    curves_data["isolation_forest"]["precisions"] = sub_precs
    curves_data["isolation_forest"]["recalls"] = sub_recs
    curves_data["isolation_forest"]["thresholds"] = sub_threshs
    curves_data["isolation_forest"]["pr_auc"] = round(pr_auc, 4)
    curves_data["isolation_forest"]["average_precision"] = round(pr_auc, 4)
    
    with open(curves_path, "w", encoding="utf-8") as f:
        json.dump(curves_data, f, indent=2)
    print("Updated precision_curves_data.json for isolation_forest.")

# Update model_comparison_report.md table
report_md_path = ARTIFACTS_DIR / "model_comparison_report.md"
if report_md_path.exists():
    content = report_md_path.read_text(encoding="utf-8")
    # Replace the Isolation Forest row in the table
    # | Model | Type | Precision | Recall | F1 Score | Specificity | FPR | ROC-AUC | PR-AUC | Latency (ms) |
    old_row = "| Isolation Forest | Unsupervised | 18.67% | 91.25% | 0.3100 | 68.20% | 31.80% | 0.8681 | 0.3302 | 0.027 |"
    new_row = f"| Isolation Forest | Unsupervised | {metrics['precision']*100:.2f}% | {metrics['recall']*100:.2f}% | {metrics['f1']:.4f} | {metrics['specificity']*100:.2f}% | {metrics['fpr']*100:.2f}% | {metrics['roc_auc']:.4f} | {metrics['pr_auc']:.4f} | {latency_ms:.3f} |"
    if old_row in content:
        content = content.replace(old_row, new_row)
        report_md_path.write_text(content, encoding="utf-8")
        print("Updated model_comparison_report.md table.")

print("All artifacts successfully updated!")
