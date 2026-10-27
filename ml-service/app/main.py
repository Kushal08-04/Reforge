"""
FastAPI application for REFORGE ML Anomaly Detection Service.
Exposes endpoints for health, model listing, inference, evaluation, and training.
"""

import time
import datetime
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from sklearn.model_selection import train_test_split

from .schemas import (
    PredictRequest,
    PredictResponse,
    PredictionItem,
    ModelsListResponse,
    ModelInfo,
    TrainRequest,
    TrainResponse,
    EvaluateRequest,
    EvaluateResponse,
)
from .features import (
    FEATURE_SCHEMA_VERSION,
    extract_feature_vector,
    extract_feature_matrix,
    extract_features_for_model,
)
from .models import (
    registry,
    IsolationForestAnomalyModel,
    RandomForestAnomalyModel,
)
from .evaluation import calculate_metrics


def _bootstrap_initial_model():
    """Ensure at least one approved baseline model is in registry."""
    active = registry.get_active_meta()
    if active is not None:
        return

    print("[REFORGE ML] Bootstrapping initial baseline multi-sensor Isolation Forest model (v1.2.0)...")
    np.random.seed(42)
    # Generate realistic multi-sensor samples for temperature, humidity, pressure
    # across normal operational distributions to eliminate sensor-type bias.
    configs = {
        "temperature": {"base": 25.0, "amp": 3.0, "noise": 0.6},
        "humidity": {"base": 50.0, "amp": 8.0, "noise": 2.0},
        "pressure": {"base": 1010.0, "amp": 1.5, "noise": 0.4},
    }
    zones = ["zone-a", "zone-b", "zone-c"]
    zone_offsets = {"zone-a": 0.0, "zone-b": 0.8, "zone-c": -0.6}

    normal_records = []
    # Generate 5 days of normal multi-sensor telemetry with realistic cross-sensor peer dynamics
    total_steps = 40
    step_readings = []
    for step in range(total_steps):
        hour = (step * 3) % 24
        rad = (hour / 24.0) * 2 * np.pi
        sin_t = float(np.sin(rad))
        cos_t = float(np.cos(rad))
        
        readings_at_step = {}
        for st, cfg in configs.items():
            readings_at_step[st] = {}
            for zone in zones:
                daily = sin_t * cfg["amp"]
                noise = float(np.random.normal(0, cfg["noise"]))
                val = float(cfg["base"] + zone_offsets[zone] + daily + noise)
                readings_at_step[st][zone] = round(val, 2)
        step_readings.append((sin_t, cos_t, readings_at_step))

    history_buffers: Dict[str, List[float]] = {}
    for sin_t, cos_t, readings_at_step in step_readings:
        for st, cfg in configs.items():
            for zone in zones:
                entity_id = f"{zone}-{st}"
                val = readings_at_step[st][zone]
                hist = history_buffers.setdefault(entity_id, [])
                hist.append(val)

                peers = [readings_at_step[st][z] for z in zones if z != zone]
                p_mean = float(np.mean(peers))
                p_std = float(np.std(peers)) if len(peers) > 1 else cfg["noise"]

                fast_hist = hist[-5:]
                slow_hist = hist[-20:]
                fast_mean = float(np.mean(fast_hist))
                fast_std = float(np.std(fast_hist)) if len(fast_hist) > 1 else cfg["noise"]
                slow_mean = float(np.mean(slow_hist))
                slow_std = float(np.std(slow_hist)) if len(slow_hist) > 1 else cfg["noise"]

                if fast_std < 0.1:
                    fast_std = 0.1
                if slow_std < 0.1:
                    slow_std = 0.1

                roc = float(val - hist[-2]) if len(hist) > 1 else 0.0
                z_score = float((val - slow_mean) / slow_std) if len(hist) > 1 else 0.0
                vol_ratio = float((fast_std + 0.01) / (slow_std + 0.01))
                mean_div = float(fast_mean - slow_mean)

                min_scale = {"temperature": 0.6, "humidity": 2.0, "pressure": 0.4}.get(st, 0.5)
                eff_peer_std = max(p_std, min_scale)
                peer_res = float((val - p_mean) / eff_peer_std)

                normal_records.append({
                    "entityId": entity_id,
                    "values": {"value": val},
                    "features": {
                        "value": val,
                        "rateOfChange": roc,
                        "rollingMean": slow_mean,
                        "rollingStd": slow_std,
                        "historicalZScore": z_score,
                        "crossSensorMean": p_mean,
                        "crossSensorStd": p_std,
                        "crossSensorDeviation": peer_res,
                        "normalizedPeerResidual": peer_res,
                        "minutesSincePrevious": 180.0,
                        "historyWindowSize": len(slow_hist),
                        "peerGroupSize": 2.0,
                        "type": st,
                        "timeOfDaySin": sin_t,
                        "timeOfDayCos": cos_t,
                        "fastRollingMean": fast_mean,
                        "fastRollingStd": fast_std,
                        "volatilityRatio": vol_ratio,
                        "meanDivergence": mean_div,
                    },
                    "_meta": {"isAnomalySeed": False, "anomalyType": None},
                })

    # Generate synthetic validation partition with controlled anomaly signatures
    val_records = []
    val_labels = []
    for r in normal_records[-60:]:
        val_records.append(r)
        val_labels.append(0)

    # Injected validation anomalies
    val_anomalies = [
        # Implausible jump
        {"st": "temperature", "base": 25.0, "val": 80.0, "roc": 55.0, "z": 18.0, "vol": 6.5, "peer": 10.0, "type": "implausible_jump"},
        {"st": "pressure", "base": 1010.0, "val": 1070.0, "roc": 60.0, "z": 15.0, "vol": 7.0, "peer": 10.0, "type": "implausible_jump"},
        # Historical deviation
        {"st": "pressure", "base": 1010.0, "val": 998.0, "roc": 2.0, "z": -6.0, "vol": 1.2, "peer": -6.0, "type": "historical_deviation"},
        {"st": "temperature", "base": 25.0, "val": 5.0, "roc": -22.0, "z": -6.5, "vol": 1.3, "peer": -8.0, "type": "historical_deviation"},
        # Cross-sensor contradiction
        {"st": "humidity", "base": 50.0, "val": 12.0, "roc": 1.0, "z": -1.5, "vol": 1.1, "peer": -8.0, "type": "cross_sensor_contradiction"},
        {"st": "humidity", "base": 50.0, "val": 88.0, "roc": 2.0, "z": 1.2, "vol": 1.0, "peer": 8.0, "type": "cross_sensor_contradiction"},
    ]
    for anom in val_anomalies:
        val_records.append({
            "entityId": f"zone-a-{anom['st']}",
            "values": {"value": anom["val"]},
            "features": {
                "value": anom["val"],
                "rateOfChange": anom["roc"],
                "rollingMean": anom["base"],
                "rollingStd": 1.0,
                "historicalZScore": anom["z"],
                "crossSensorDeviation": anom["peer"],
                "normalizedPeerResidual": anom["peer"],
                "minutesSincePrevious": 180.0,
                "historyWindowSize": 20,
                "peerGroupSize": 2,
                "type": anom["st"],
                "timeOfDaySin": 0.0,
                "timeOfDayCos": 1.0,
                "fastRollingMean": anom["val"],
                "fastRollingStd": anom["vol"],
                "volatilityRatio": anom["vol"],
                "meanDivergence": anom["val"] - anom["base"],
            },
            "_meta": {"isAnomalySeed": True, "anomalyType": anom["type"]},
        })
        val_labels.append(1)

    X_train, _ = extract_feature_matrix(normal_records[:-60])
    X_val, _ = extract_feature_matrix(val_records)
    y_val = np.array(val_labels, dtype=int)

    model = IsolationForestAnomalyModel(
        name="isolation_forest",
        version="v1.2.0",
        hyperparameters={
            "n_estimators": 150,
            "contamination": 0.03,
            "random_state": 42,
            "max_samples": "auto",
        },
        feature_schema_version=FEATURE_SCHEMA_VERSION,
    )
    model.fit(X_train)

    # Calibrate threshold on the independent validation set
    _, _, val_norm = model.predict_scores(X_val)
    best_thresh = 0.54
    best_score = -1.0
    for candidate in np.linspace(0.52, 0.70, 37):
        val_preds = (val_norm >= candidate).astype(int)
        val_m = calculate_metrics(y_val.tolist(), val_preds.tolist())
        # Penalize false positives strongly while preserving high recall
        score = val_m["f1"] + 2.5 * val_m["specificity"]
        if score > best_score:
            best_score = score
            best_thresh = float(candidate)

    model.hyperparameters["calibrated_threshold"] = best_thresh

    registry.register_model(
        model=model,
        metrics={
            "baseline_samples": len(normal_records[:-60]),
            "val_samples": len(val_records),
            "calibrated_threshold": best_thresh,
            "feature_schema_version": FEATURE_SCHEMA_VERSION,
        },
        status="active",
        make_active=True,
    )
    print(f"[REFORGE ML] Multi-sensor Baseline Isolation Forest v1.2.0 registered and active (threshold={best_thresh:.3f}).")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _bootstrap_initial_model()
    yield


app = FastAPI(
    title="REFORGE ML Anomaly Detection Service",
    description="Isolation Forest & Supervised Random Forest Anomaly Detection Engine",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    active_meta = registry.get_active_meta()
    return {
        "status": "ok",
        "service": "reforge-ml-service",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "active_model": active_meta["model_name"] if active_meta else None,
        "active_version": active_meta["version"] if active_meta else None,
    }


@app.get("/models", response_model=ModelsListResponse)
def list_models():
    models_meta = registry.list_models()
    active_meta = registry.get_active_meta()

    def to_model_info(m: Dict[str, Any]) -> ModelInfo:
        return ModelInfo(
            model_name=m["model_name"],
            version=m["version"],
            algorithm=m["algorithm"],
            status=m["status"],
            feature_schema_version=m["feature_schema_version"],
            created_at=m["created_at"],
            hyperparameters=m.get("hyperparameters", {}),
            metrics=m.get("metrics"),
        )

    return ModelsListResponse(
        active_model=to_model_info(active_meta) if active_meta else None,
        models=[to_model_info(m) for m in models_meta],
    )


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest):
    start_time = time.time()
    try:
        model = registry.get_model(request.model_name, request.model_version)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model error: {str(e)}",
        )

    raw_items = request.features if isinstance(request.features, list) else [request.features]
    items_as_dicts = []
    for item in raw_items:
        if hasattr(item, "model_dump"):
            items_as_dicts.append(item.model_dump())
        elif isinstance(item, dict):
            items_as_dicts.append(item)
        else:
            items_as_dicts.append(dict(item))

    predictions: List[PredictionItem] = []
    iso_now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    try:
        X, feat_names, cleaned_feats = extract_features_for_model(items_as_dicts, model)
        is_anomalies, raw_scores, normalized_scores = model.predict_scores(X)

        for i, raw_dict in enumerate(items_as_dicts):
            predictions.append(
                PredictionItem(
                    model_name=model.name,
                    model_version=model.version,
                    is_anomaly=bool(is_anomalies[i]),
                    raw_score=float(raw_scores[i]),
                    normalized_score=float(normalized_scores[i]),
                    features_used=cleaned_feats[i] if i < len(cleaned_feats) else extract_feature_vector(raw_dict)[1],
                    status="success",
                    timestamp=iso_now,
                )
            )
    except Exception as e:
        for raw_dict in items_as_dicts:
            predictions.append(
                PredictionItem(
                    model_name=model.name,
                    model_version=model.version,
                    is_anomaly=False,
                    raw_score=0.0,
                    normalized_score=0.0,
                    features_used=raw_dict,
                    status="error",
                    timestamp=iso_now,
                    error=str(e),
                )
            )

    elapsed_ms = (time.time() - start_time) * 1000.0
    return PredictResponse(
        predictions=predictions,
        model_name=model.name,
        model_version=model.version,
        inference_time_ms=elapsed_ms,
    )


@app.post("/evaluate", response_model=EvaluateResponse)
def evaluate(request: EvaluateRequest):
    try:
        model = registry.get_model(request.model_name, request.model_version)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model lookup failed: {str(e)}",
        )

    records = request.data
    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No evaluation records provided.",
        )

    X, _, _ = extract_features_for_model(records, model)
    is_anomalies, _, normalized_scores = model.predict_scores(X)

    y_true: List[int] = []
    anomaly_types: List[Optional[str]] = []
    rule_predictions: List[int] = []

    for r in records:
        meta = r.get("_meta", {})
        is_true = meta.get("isAnomalySeed", r.get("isAnomaly", False))
        y_true.append(1 if is_true else 0)
        anomaly_types.append(meta.get("anomalyType"))

        rule_flag = r.get("ruleClassification")
        if rule_flag:
            rule_predictions.append(1 if rule_flag != "valid" else 0)

    rule_preds_opt = rule_predictions if len(rule_predictions) == len(records) else None
    metrics = calculate_metrics(
        y_true=y_true,
        y_pred=[int(x) for x in is_anomalies],
        scores=[float(s) for s in normalized_scores],
        anomaly_types=anomaly_types,
        rule_predictions=rule_preds_opt,
    )

    return EvaluateResponse(
        model_name=model.name,
        model_version=model.version,
        total_samples=metrics["total_samples"],
        tp=metrics["tp"],
        fp=metrics["fp"],
        tn=metrics["tn"],
        fn=metrics["fn"],
        precision=metrics["precision"],
        recall=metrics["recall"],
        f1=metrics["f1"],
        specificity=metrics["specificity"],
        fpr=metrics.get("fpr"),
        roc_auc=metrics.get("roc_auc"),
        pr_auc=metrics.get("pr_auc"),
        by_anomaly_type=metrics.get("by_anomaly_type", {}),
        agreement_with_rules=metrics.get("agreement_with_rules"),
    )


@app.post("/train", response_model=TrainResponse)
def train(request: TrainRequest):
    records = request.data
    if len(records) < 15:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dataset too small for training (received {len(records)}, minimum 15 required).",
        )

    X, _ = extract_feature_matrix(records)

    # Extract target labels if present
    y_labels = []
    for r in records:
        meta = r.get("_meta", {})
        is_anomaly = meta.get("isAnomalySeed", r.get("label", r.get("isAnomaly", 0)))
        y_labels.append(1 if is_anomaly else 0)
    y = np.array(y_labels, dtype=int)

    # 3-Way Independent Partitions: Train (70%), Validation (15%), Held-out Test (15%)
    # This guarantees threshold calibration occurs strictly on validation data without leakage.
    stratify = y if len(np.unique(y)) > 1 and np.min(np.bincount(y)) >= 3 else None
    X_train, X_temp, y_train, y_temp = train_test_split(
        X,
        y,
        test_size=0.30,
        random_state=request.random_state,
        stratify=stratify,
    )

    stratify_temp = y_temp if len(np.unique(y_temp)) > 1 and np.min(np.bincount(y_temp)) >= 2 else None
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp,
        y_temp,
        test_size=0.50,
        random_state=request.random_state,
        stratify=stratify_temp,
    )

    version_str = request.version or f"v{int(time.time())}"
    algo_type = request.model_type.lower()
    hp = dict(request.hyperparameters or {})

    calibrated_thresh = 0.50

    if algo_type == "isolation_forest":
        model = IsolationForestAnomalyModel(
            name="isolation_forest",
            version=version_str,
            hyperparameters=hp,
        )
        # Isolation Forest is unsupervised: fits on training partition
        model.fit(X_train)

        # Calibrate threshold on VALIDATION partition only (prevent test leakage)
        if len(np.unique(y_val)) > 1:
            _, _, val_norm = model.predict_scores(X_val)
            best_thresh = 0.50
            best_score = -1.0
            for candidate in np.linspace(0.40, 0.80, 41):
                val_preds = (val_norm >= candidate).astype(int)
                val_m = calculate_metrics(y_val.tolist(), val_preds.tolist())
                # Prioritize F1 while strongly penalizing false alarms via high specificity weight
                score = val_m["f1"] + 1.2 * val_m["specificity"]
                if score > best_score:
                    best_score = score
                    best_thresh = float(candidate)
            calibrated_thresh = best_thresh
            model.hyperparameters["calibrated_threshold"] = calibrated_thresh

    elif algo_type == "random_forest":
        model = RandomForestAnomalyModel(
            name="random_forest",
            version=version_str,
            hyperparameters=hp,
            feature_schema_version=FEATURE_SCHEMA_VERSION,
        )
        try:
            model.fit(X_train, y_train)
            if len(np.unique(y_val)) > 1:
                _, _, val_norm = model.predict_scores(X_val)
                best_thresh = 0.50
                best_score = -1.0
                for candidate in np.linspace(0.40, 0.80, 41):
                    val_preds = (val_norm >= candidate).astype(int)
                    val_m = calculate_metrics(y_val.tolist(), val_preds.tolist())
                    score = val_m["f1"] + 1.2 * val_m["specificity"]
                    if score > best_score:
                        best_score = score
                        best_thresh = float(candidate)
                calibrated_thresh = best_thresh
                model.hyperparameters["calibrated_threshold"] = calibrated_thresh
        except ValueError as ve:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(ve),
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported model type '{request.model_type}'. Choose 'isolation_forest' or 'random_forest'.",
        )

    # Evaluate candidate model on COMPLETELY HELD-OUT test partition
    test_preds, _, test_scores = model.predict_scores(X_test, threshold=calibrated_thresh)
    test_metrics = calculate_metrics(
        y_true=y_test.tolist(),
        y_pred=[int(p) for p in test_preds],
        scores=[float(s) for s in test_scores],
    )

    # Register as candidate (requires explicit promotion)
    key = registry.register_model(
        model=model,
        metrics=test_metrics,
        status="candidate",
        make_active=False,
    )

    return TrainResponse(
        model_name=model.name,
        model_version=model.version,
        train_records=len(X_train),
        test_records=len(X_test),
        metrics=test_metrics,
        status="candidate",
        message=f"Model {key} trained on {len(X_train)} samples, threshold calibrated on {len(X_val)} validation samples ({calibrated_thresh:.2f}). Held-out test set evaluation: F1={test_metrics['f1']:.3f}, Precision={test_metrics['precision']:.3f}, Specificity={test_metrics['specificity']:.3f}.",
    )


@app.post("/models/{version}/promote")
def promote_model(version: str, model_name: Optional[str] = "isolation_forest"):
    key = f"{model_name}:{version}" if ":" not in version else version
    success = registry.promote_model(key)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model key '{key}' not found in registry.",
        )
    return {"status": "promoted", "active_model": key}


@app.post("/models/rollback")
def rollback_model():
    prev = registry.rollback_model()
    if not prev:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No previous model available to roll back to.",
        )
    return {"status": "rolled_back", "active_model": prev}
