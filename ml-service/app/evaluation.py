"""
Evaluation module for computing precision, recall, F1, specificity, ROC-AUC, PR-AUC,
detection rates by anomaly type, and rule/ML agreement rates.
"""

from typing import List, Dict, Any, Optional
import numpy as np
from sklearn.metrics import roc_auc_score, precision_recall_curve, auc


def calculate_metrics(
    y_true: List[int],
    y_pred: List[int],
    scores: Optional[List[float]] = None,
    anomaly_types: Optional[List[Optional[str]]] = None,
    rule_predictions: Optional[List[int]] = None,
) -> Dict[str, Any]:
    y_true_arr = np.array(y_true, dtype=int)
    y_pred_arr = np.array(y_pred, dtype=int)

    tp = int(np.sum((y_pred_arr == 1) & (y_true_arr == 1)))
    fp = int(np.sum((y_pred_arr == 1) & (y_true_arr == 0)))
    tn = int(np.sum((y_pred_arr == 0) & (y_true_arr == 0)))
    fn = int(np.sum((y_pred_arr == 0) & (y_true_arr == 1)))

    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = float((2 * precision * recall) / (precision + recall)) if (precision + recall) > 0 else 0.0
    specificity = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
    fpr = float(fp / (tn + fp)) if (tn + fp) > 0 else 0.0

    roc_auc = None
    pr_auc = None
    if scores is not None and len(np.unique(y_true_arr)) > 1:
        try:
            roc_auc = float(roc_auc_score(y_true_arr, scores))
            precisions, recalls, _ = precision_recall_curve(y_true_arr, scores)
            pr_auc = float(auc(recalls, precisions))
        except Exception:
            pass

    # Breakdown by anomaly type
    by_anomaly_type: Dict[str, Dict[str, int]] = {}
    if anomaly_types is not None:
        for actual, pred, atype in zip(y_true, y_pred, anomaly_types):
            if actual == 1 and atype:
                if atype not in by_anomaly_type:
                    by_anomaly_type[atype] = {"total": 0, "caught": 0}
                by_anomaly_type[atype]["total"] += 1
                if pred == 1:
                    by_anomaly_type[atype]["caught"] += 1

    # Agreement with rule engine
    agreement_stats = None
    if rule_predictions is not None:
        rule_arr = np.array(rule_predictions, dtype=int)
        total = len(rule_arr)
        both_normal = int(np.sum((rule_arr == 0) & (y_pred_arr == 0)))
        both_anomaly = int(np.sum((rule_arr == 1) & (y_pred_arr == 1)))
        rule_only = int(np.sum((rule_arr == 1) & (y_pred_arr == 0)))
        ml_only = int(np.sum((rule_arr == 0) & (y_pred_arr == 1)))

        agreement_count = both_normal + both_anomaly
        disagreement_count = rule_only + ml_only
        agreement_rate = float(agreement_count / total) if total > 0 else 1.0

        agreement_stats = {
            "total": total,
            "both_normal": both_normal,
            "both_anomaly": both_anomaly,
            "rule_anomaly_ml_normal": rule_only,
            "rule_normal_ml_anomaly": ml_only,
            "agreement_rate": agreement_rate,
            "disagreement_rate": float(disagreement_count / total) if total > 0 else 0.0,
        }

    return {
        "total_samples": len(y_true),
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "specificity": specificity,
        "fpr": fpr,
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "by_anomaly_type": by_anomaly_type,
        "agreement_with_rules": agreement_stats,
    }
