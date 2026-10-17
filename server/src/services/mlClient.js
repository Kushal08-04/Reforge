/**
 * mlClient.js
 * ----------------
 * HTTP client for communicating with the Python ML Service (FastAPI).
 * Implements bounded timeouts, error handling, and safe fallback so that
 * an ML service outage NEVER crashes or blocks the core validation pipeline.
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS || "2000", 10);

async function checkHealth() {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { status: "unreachable", error: err.message };
  }
}

/**
 * Predict anomaly for a single observation feature snapshot.
 *
 * @param {Object} opts
 * @param {string} opts.entityId
 * @param {number} opts.value
 * @param {Date}   opts.timestamp
 * @param {Object} opts.features - feature snapshot from featureBuilder.js
 * @returns {Promise<Object>} ML inference result
 */
async function predictAnomaly({ entityId, value, timestamp, features }) {
  const payload = {
    features: {
      entityId,
      timestamp,
      values: { value },
      features,
    },
    model_name: process.env.ML_ACTIVE_MODEL || "isolation_forest",
  };

  try {
    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ML service returned HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const item = data.predictions?.[0] || {};

    return {
      modelName: item.model_name || data.model_name || "isolation_forest",
      modelVersion: item.model_version || data.model_version || "v1.0.0",
      isAnomaly: Boolean(item.is_anomaly),
      rawScore: typeof item.raw_score === "number" ? item.raw_score : 0,
      anomalyScore: typeof item.normalized_score === "number" ? item.normalized_score : 0,
      status: item.status || "success",
      inferenceTimeMs: data.inference_time_ms || null,
      error: item.error || null,
    };
  } catch (err) {
    console.warn(`[REFORGE ML Client] Inference failed: ${err.message}. Using safe fallback.`);
    return {
      modelName: "isolation_forest",
      modelVersion: "unknown",
      isAnomaly: false,
      rawScore: 0,
      anomalyScore: 0,
      status: "fallback",
      inferenceTimeMs: null,
      error: err.message,
    };
  }
}

/**
 * List models from registry.
 */
async function listModels() {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/models`, {
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { active_model: null, models: [], error: err.message };
  }
}

/**
 * Request training of a candidate model.
 */
async function trainModel(trainPayload) {
  const res = await fetch(`${ML_SERVICE_URL}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trainPayload),
    signal: AbortSignal.timeout(30000), // longer timeout for training
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `Training failed with status ${res.status}`);
  }

  return await res.json();
}

/**
 * Promote model version.
 */
async function promoteModel(version, modelName = "isolation_forest") {
  const res = await fetch(`${ML_SERVICE_URL}/models/${version}/promote?model_name=${modelName}`, {
    method: "POST",
    signal: AbortSignal.timeout(ML_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `Promotion failed with status ${res.status}`);
  }

  return await res.json();
}

/**
 * Rollback model to previous active version.
 */
async function rollbackModel() {
  const res = await fetch(`${ML_SERVICE_URL}/models/rollback`, {
    method: "POST",
    signal: AbortSignal.timeout(ML_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `Rollback failed with status ${res.status}`);
  }

  return await res.json();
}

/**
 * Evaluate on dataset.
 */
async function evaluateDataset(records, modelName = null, modelVersion = null) {
  const payload = {
    data: records,
    model_name: modelName,
    model_version: modelVersion,
  };

  const res = await fetch(`${ML_SERVICE_URL}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `Evaluation failed with status ${res.status}`);
  }

  return await res.json();
}

module.exports = {
  checkHealth,
  predictAnomaly,
  listModels,
  trainModel,
  promoteModel,
  rollbackModel,
  evaluateDataset,
  ML_SERVICE_URL,
};
