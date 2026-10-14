"""
Pydantic schemas for the REFORGE ML service.
Provides request and response validation for inference, evaluation, and training.
"""

from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field


class FeatureVector(BaseModel):
    value: float = Field(..., description="Current sensor numeric reading")
    rateOfChange: Optional[float] = Field(None, description="Difference from previous reading")
    rollingMean: Optional[float] = Field(None, description="Rolling mean of historical readings")
    rollingStd: Optional[float] = Field(None, description="Rolling standard deviation")
    historicalZScore: Optional[float] = Field(None, description="Z-score vs historical distribution")
    crossSensorDeviation: Optional[float] = Field(None, description="Deviation vs peer sensor group")
    minutesSincePrevious: Optional[float] = Field(None, description="Minutes elapsed since last reading")
    historyWindowSize: int = Field(0, description="Number of past observations in rolling window")
    peerGroupSize: int = Field(0, description="Number of peer sensors observed")
    zone: Optional[str] = Field(None, description="Sensor zone identifier")
    type: Optional[str] = Field(None, description="Sensor measurement type")


class PredictRequest(BaseModel):
    features: Union[FeatureVector, List[FeatureVector], Dict[str, Any], List[Dict[str, Any]]]
    model_name: Optional[str] = Field("isolation_forest", description="Model name or algorithm")
    model_version: Optional[str] = Field(None, description="Specific model version (or active default)")


class PredictionItem(BaseModel):
    model_name: str
    model_version: str
    is_anomaly: bool
    raw_score: float
    normalized_score: float = Field(
        ...,
        description="Calibrated anomaly score in [0.0, 1.0], where 1.0 = most anomalous, 0.0 = normal"
    )
    features_used: Dict[str, Any]
    status: str
    timestamp: str
    error: Optional[str] = None


class PredictResponse(BaseModel):
    predictions: List[PredictionItem]
    model_name: str
    model_version: str
    inference_time_ms: float


class ModelInfo(BaseModel):
    model_name: str
    version: str
    algorithm: str
    status: str = Field(..., description="active, candidate, or retired")
    feature_schema_version: str
    created_at: str
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    metrics: Optional[Dict[str, Any]] = None


class ModelsListResponse(BaseModel):
    active_model: Optional[ModelInfo]
    models: List[ModelInfo]


class TrainRequest(BaseModel):
    model_type: str = Field("isolation_forest", description="'isolation_forest' or 'random_forest'")
    version: Optional[str] = Field(None, description="Optional custom version string")
    hyperparameters: Optional[Dict[str, Any]] = Field(default_factory=dict)
    data: List[Dict[str, Any]] = Field(..., description="Array of training observations with features and labels")
    test_size: float = Field(0.25, ge=0.1, le=0.5)
    random_state: int = Field(42)


class TrainResponse(BaseModel):
    model_name: str
    model_version: str
    train_records: int
    test_records: int
    metrics: Dict[str, Any]
    status: str
    message: str


class EvaluateRequest(BaseModel):
    model_name: Optional[str] = None
    model_version: Optional[str] = None
    data: List[Dict[str, Any]] = Field(..., description="Evaluation observations with ground-truth labels")


class EvaluateResponse(BaseModel):
    model_name: str
    model_version: str
    total_samples: int
    tp: int
    fp: int
    tn: int
    fn: int
    precision: float
    recall: float
    f1: float
    specificity: float
    roc_auc: Optional[float] = None
    pr_auc: Optional[float] = None
    by_anomaly_type: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    agreement_with_rules: Optional[Dict[str, Any]] = None
