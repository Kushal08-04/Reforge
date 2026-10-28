# REFORGE Model Comparison Report: 4 Lakh IoT Telemetry Benchmark

**Generated**: 2026-10-25T02:26:24.107108+00:00
**Dataset Version**: `v1.0.0-iot-telemetry-405k`
**Feature Schema Version**: `v2.0.0-iot`
**Total Records Processed**: 405,171 (Train: 283,619, Val: 60,775, Test: 60,777)

## 1. Model Evaluation Comparison Table

| Model Name | Type | Precision | Recall | F1-Score | Specificity | FPR | ROC-AUC | PR-AUC | Latency (ms) | Training Time (s) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Isolation Forest** | `unsupervised` | 97.8% | 66.8% | **0.794** | 99.9% | 0.12% | 0.911 | 0.740 | 0.03 | 1.0s |

| **Temporal Statistical** | `statistical_rule_detector` | 43.5% | 99.8% | **0.606** | 89.6% | 10.38% | 0.977 | 0.705 | 0.00 | 0.0s |
| **Random Forest** | `supervised_benchmark` | 99.2% | 95.0% | **0.971** | 99.9% | 0.06% | 1.000 | 0.999 | 0.10 | 0.5s |
| **XGBoost** | `supervised_benchmark` | 99.7% | 95.0% | **0.973** | 100.0% | 0.02% | 1.000 | 0.999 | 0.00 | 1.6s |
| **LightGBM** | `supervised_benchmark` | 100.0% | 98.2% | **0.991** | 100.0% | 0.00% | 1.000 | 0.996 | 0.01 | 0.2s |
| **Hybrid Detection** | `calibrated_hybrid_consensus` | 100.0% | 98.2% | **0.991** | 100.0% | 0.00% | 1.000 | 0.994 | 0.01 | 0.0s |

## 2. Partition and Data Quality Audit
- **Raw records ingested**: 405,184
- **Exact duplicates dropped**: 13 pairs
- **Eligible unique records**: 405,171
- **Chronological partition**: 70% Train (283,619), 15% Validation (60,775), 15% Held-out Test (60,777)
- **Timestamp Span**: 2020-07-12T00:01:34.385974646+00:00 to 2020-07-20T00:03:37.264312506+00:00 (~8 days)

## 3. Label Handling & Supervised Benchmarking Policy
- **Unsupervised Training**: Isolation Forest was trained strictly on unlabelled telemetry from the training partition.
- **Supervised Benchmarking**: Random Forest, XGBoost, and LightGBM were trained on controlled benchmark copies with synthetic anomaly injection to assess theoretical upper bounds under ground truth.
- **Evaluation Dataset**: A separate held-out evaluation dataset containing 8 distinct documented anomaly categories (implausible jumps, gas spikes, statistical deviations, corrupted types, frozen sensors) was used for all metric calculations.

## 4. Active Model Promotion
- **Active Model**: `hybrid_detection:v2.0.0-iot` (Hybrid Detection Engine)
- **Rollback Target Available**: Isolation Forest / previous active candidates preserved in `registry.json`.