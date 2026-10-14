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
)
from .models import (
    registry,
    IsolationForestAnomalyModel,
    RandomForestAnomalyModel,
)
from .evaluation import calculate_metrics


def _bootstrap_initial_model():
    """Ensure at least one approved baseline Isolation Forest model is in registry."""
    active = registry.get_active_meta()
    if active is not None:
        return

    print("[REFORGE ML] Bootstrapping initial baseline Isolation Forest model (v1.0.0)...")
    # Generate baseline synthetic normal points for initial fitting
    np.random.seed(42)
    n_samples = 300
    temp_vals = np.random.normal(25.0, 2.0, n_samples)
    roc_vals = np.random.normal(0.0, 0.5, n_samples)
    mean_vals = temp_vals + np.random.normal(0.0, 0.3, n_samples)
    std_vals = np.abs(np.random.normal(1.0, 0.2, n_samples)) + 0.1
    z_vals = roc_vals / std_vals
    cross_dev = np.random.normal(0.0, 0.4, n_samples)
    min_prev = np.full(n_samples, 180.0)
    win_sz = np.full(n_samples, 20.0)
    peer_sz = np.full(n_samples, 2.0)
    type_temp = np.ones(n_samples)
    type_hum = np.zeros(n_samples)
    type_press = np.zeros(n_samples)

    X_baseline = np.column_stack([
        temp_vals,
        roc_vals,
        mean_vals,
        std_vals,
        z_vals,
        cross_dev,
        min_prev,
        win_sz,
        peer_sz,
        type_temp,
        type_hum,
        type_press,
    ]).astype(np.float32)

    model = IsolationForestAnomalyModel(name="isolation_forest", version="v1.0.0")
    model.fit(X_baseline)
    registry.register_model(
        model=model,
        metrics={"baseline_samples": n_samples},
        status="active",
        make_active=True,
    )
    print("[REFORGE ML] Baseline Isolation Forest v1.0.0 registered and active.")


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
        X, _ = extract_feature_matrix(items_as_dicts)
        is_anomalies, raw_scores, normalized_scores = model.predict_scores(X)

        for i, raw_dict in enumerate(items_as_dicts):
            cleaned_feat = extract_feature_vector(raw_dict)[1]
            predictions.append(
                PredictionItem(
                    model_name=model.name,
                    model_version=model.version,
                    is_anomaly=bool(is_anomalies[i]),
                    raw_score=float(raw_scores[i]),
                    normalized_score=float(normalized_scores[i]),
                    features_used=cleaned_feat,
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

    X, _ = extract_feature_matrix(records)
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

    # Train / test split to evaluate candidate model honestly on held-out data
    stratify = y if len(np.unique(y)) > 1 and np.min(np.bincount(y)) >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=request.test_size,
        random_state=request.random_state,
        stratify=stratify,
    )

    version_str = request.version or f"v{int(time.time())}"
    algo_type = request.model_type.lower()

    if algo_type == "isolation_forest":
        model = IsolationForestAnomalyModel(
            name="isolation_forest",
            version=version_str,
            hyperparameters=request.hyperparameters,
        )
        # Isolation Forest is unsupervised: fits on train data
        model.fit(X_train)
    elif algo_type == "random_forest":
        model = RandomForestAnomalyModel(
            name="random_forest",
            version=version_str,
            hyperparameters=request.hyperparameters,
        )
        try:
            model.fit(X_train, y_train)
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

    # Evaluate on held-out test data
    test_preds, _, test_scores = model.predict_scores(X_test)
    metrics = calculate_metrics(
        y_true=y_test.tolist(),
        y_pred=[int(p) for p in test_preds],
        scores=[float(s) for s in test_scores],
    )

    # Register as candidate (requires explicit promotion)
    key = registry.register_model(
        model=model,
        metrics=metrics,
        status="candidate",
        make_active=False,
    )

    return TrainResponse(
        model_name=model.name,
        model_version=model.version,
        train_records=len(X_train),
        test_records=len(X_test),
        metrics=metrics,
        status="candidate",
        message=f"Model {key} trained and registered as candidate. Evaluation on held-out test set: F1={metrics['f1']:.3f}, Precision={metrics['precision']:.3f}, Recall={metrics['recall']:.3f}.",
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
