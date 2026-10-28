import { useState, useEffect } from "react";
import apiClient from "../api/client";

export default function ModelManagementPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [modelType, setModelType] = useState("isolation_forest");
  const [testSplit, setTestSplit] = useState(0.25);

  async function loadModels() {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get("/models");
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load model registry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadModels();
  }, []);

  async function handleTrain(e) {
    e.preventDefault();
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await apiClient.post("/models/train", {
        modelType,
        testSize: parseFloat(testSplit),
      });
      setSuccessMsg(res.data.message || "Model trained successfully and registered as candidate.");
      await loadModels();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Model training failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePromote(modelName, version) {
    if (!confirm(`Are you sure you want to promote ${modelName} (${version}) to active production model?`)) {
      return;
    }
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await apiClient.post(`/models/${version}/promote`, {
        modelName,
        reviewer: "authorized-admin",
      });
      setSuccessMsg(`Model ${modelName}:${version} successfully promoted to ACTIVE.`);
      await loadModels();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Promotion failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRollback() {
    if (!confirm("Are you sure you want to roll back to the previously active model version?")) {
      return;
    }
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await apiClient.post("/models/rollback");
      setSuccessMsg(`Rolled back to ${res.data.activeModel?.version || "previous model"}.`);
      await loadModels();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Rollback failed.");
    } finally {
      setActionLoading(false);
    }
  }

  const mlStatus = data?.mlServiceStatus || {};
  const activeModel = mlStatus.active_model;
  const registered = data?.registeredVersions || [];
  const serviceModels = mlStatus.models || [];

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Model Lifecycle Management</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Model registry, repeatable training, candidate evaluation, and safe promotion/rollback workflows.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-neutral" onClick={loadModels} disabled={loading || actionLoading}>
            Refresh
          </button>
          <button className="btn btn-reject" onClick={handleRollback} disabled={actionLoading}>
            Rollback to Previous
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {successMsg && <p style={{ color: "var(--valid)", fontWeight: 500 }}>{successMsg}</p>}

      {/* Active Model Card */}
      <div className="card">
        <h2 className="card-title">Active Production Model</h2>
        {activeModel ? (
          <div className="detail-grid">
            <div><span className="detail-label">Model Name</span><div><strong>{activeModel.model_name}</strong></div></div>
            <div><span className="detail-label">Version</span><div><span className="badge badge-info">{activeModel.version}</span></div></div>
            <div><span className="detail-label">Algorithm</span><div><code>{activeModel.algorithm}</code></div></div>
            <div><span className="detail-label">Feature Schema</span><div><code>{activeModel.feature_schema_version}</code></div></div>
            <div><span className="detail-label">Status</span><div><span className="badge badge-success">{activeModel.status}</span></div></div>
            <div><span className="detail-label">Registered At</span><div>{new Date(activeModel.created_at).toLocaleString()}</div></div>
          </div>
        ) : (
          <p className="muted">No active ML model found in registry.</p>
        )}
      </div>

      {/* Train Candidate Model Form */}
      <div className="card">
        <h2 className="card-title">Train Candidate Model</h2>
        <p className="muted">
          Trains a new candidate model on current verified observations. The candidate is evaluated on a held-out test split and registered as a candidate (not auto-promoted).
        </p>
        <form onSubmit={handleTrain} style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-row" style={{ minWidth: "200px" }}>
            <label htmlFor="model-type">Model Algorithm</label>
            <select
              id="model-type"
              className="input"
              value={modelType}
              onChange={(e) => setModelType(e.target.value)}
            >
              <option value="hybrid_detection">Hybrid Consensus Detector (Calibrated)</option>
              <option value="lightgbm">LightGBM (Supervised Gradient Booster)</option>
              <option value="xgboost">XGBoost (Supervised Gradient Booster)</option>
              <option value="random_forest">Random Forest (Supervised Benchmark)</option>
              <option value="isolation_forest">Isolation Forest (Unsupervised Baseline)</option>
              <option value="temporal_statistical">Temporal Statistical Detector</option>
            </select>
          </div>

          <div className="form-row" style={{ minWidth: "150px" }}>
            <label htmlFor="test-split">Test Split Ratio</label>
            <input
              id="test-split"
              type="number"
              step="0.05"
              min="0.1"
              max="0.5"
              className="input"
              value={testSplit}
              onChange={(e) => setTestSplit(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: "0.8rem" }}>
            <button className="btn btn-approve" type="submit" disabled={actionLoading}>
              {actionLoading ? "Training..." : "Train Candidate Model"}
            </button>
          </div>
        </form>
      </div>

      {/* Model Registry Table */}
      <div className="card">
        <h2 className="card-title">Registered Model Versions</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Model Name</th>
              <th>Version</th>
              <th>Algorithm</th>
              <th>Status</th>
              <th>Held-out F1</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {serviceModels.map((m) => {
              const metrics = m.metrics?.controlled_eval
                ? { ...m.metrics, ...m.metrics.controlled_eval }
                : (m.metrics || {});
              const isActive = m.status === "active";
              return (
                <tr key={`${m.model_name}-${m.version}`}>
                  <td><strong>{m.model_name}</strong></td>
                  <td><code>{m.version}</code></td>
                  <td>{m.algorithm}</td>
                  <td>
                    <span className={`badge ${isActive ? "badge-success" : m.status === "candidate" ? "badge-warning" : "badge-neutral"}`}>
                      {m.status}
                    </span>
                  </td>
                  <td>{metrics.f1 !== undefined ? metrics.f1.toFixed(3) : "—"}</td>
                  <td>{metrics.precision !== undefined ? `${(metrics.precision * 100).toFixed(1)}%` : "—"}</td>
                  <td>{metrics.recall !== undefined ? `${(metrics.recall * 100).toFixed(1)}%` : "—"}</td>
                  <td>{m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}</td>
                  <td>
                    {!isActive ? (
                      <button
                        className="btn btn-neutral"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                        onClick={() => handlePromote(m.model_name, m.version)}
                        disabled={actionLoading}
                      >
                        Promote to Active
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: "0.8rem" }}>Active</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
