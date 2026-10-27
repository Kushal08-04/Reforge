import { useState, useEffect } from "react";
import apiClient from "../api/client";
import StatCard from "../components/StatCard";

export default function EvaluationPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function loadEvaluation() {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get("/evaluation/latest");
      setReport(res.data.evaluation);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load evaluation.");
    } finally {
      setLoading(false);
    }
  }

  async function triggerEvaluationRun() {
    setRunning(true);
    setError("");
    try {
      const res = await apiClient.post("/evaluation/run");
      setReport(res.data.evaluation);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to execute evaluation run.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    loadEvaluation();
  }, []);

  const rule = report?.ruleMetrics || {};
  const ml = report?.mlMetrics || {};
  const hybrid = report?.hybridMetrics || {};
  const agreement = report?.agreementStats || {};

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Model & Engine Evaluation</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Reproducible benchmark comparing Rule-only, ML Anomaly Detection, and Calibrated Hybrid decisions.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-neutral" onClick={loadEvaluation} disabled={loading || running}>
            Refresh
          </button>
          <button className="btn btn-approve" onClick={triggerEvaluationRun} disabled={loading || running}>
            {running ? "Evaluating..." : "Run Evaluation Benchmark"}
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading benchmark report...</p>}

      {report && (
        <>
          <div className="system-banner" style={{ marginTop: "1rem" }}>
            <div className="system-banner-group">
              <span><strong>Dataset Size:</strong> {report.datasetSize} labelled samples</span>
              <span><strong>Strategy:</strong> <span className="badge badge-info">{report.splitStrategy || "held-out-benchmark"}</span></span>
              <span><strong>Evaluated At:</strong> {report.evaluatedAt ? new Date(report.evaluatedAt).toLocaleString() : "just now"}</span>
            </div>
            <div>
              <span className="badge badge-success">Benchmark Validated</span>
            </div>
          </div>

          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "1.25rem 0 0.5rem" }}>Hybrid Engine Performance</h2>
          <div className="stat-grid">
            <StatCard label="Hybrid F1-Score" value={hybrid.f1 ? hybrid.f1.toFixed(3) : "-"} tone="valid" />
            <StatCard label="Precision" value={hybrid.precision !== undefined ? `${(hybrid.precision * 100).toFixed(1)}%` : "-"} tone="valid" />
            <StatCard label="Recall" value={hybrid.recall !== undefined ? `${(hybrid.recall * 100).toFixed(1)}%` : "-"} tone="valid" />
            <StatCard label="Specificity" value={hybrid.specificity !== undefined ? `${(hybrid.specificity * 100).toFixed(1)}%` : "-"} tone="neutral" />
            <StatCard label="True Positives (Caught)" value={hybrid.tp ?? 0} tone="valid" />
            <StatCard label="False Positives (Alarms)" value={hybrid.fp ?? 0} tone={hybrid.fp ? "suspicious" : "neutral"} />
            <StatCard label="True Negatives (Clean)" value={hybrid.tn ?? 0} tone="neutral" />
            <StatCard label="Missed Anomalies (FN)" value={hybrid.fn ?? 0} tone={hybrid.fn ? "invalid" : "valid"} />
          </div>

          <div className="card">
            <h2 className="card-title">Comparative Performance Benchmark</h2>
            <p className="muted">Direct side-by-side comparison across all 3 decision layers evaluated on the exact same observations.</p>
            <div style={{ overflowX: "auto" }}>
              <table className="metrics-comparison-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Rule-Only Baseline</th>
                    <th>ML Anomaly Detector (Isolation Forest)</th>
                    <th style={{ background: "#f0fdfa" }}>Calibrated Hybrid Engine</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Precision</strong></td>
                    <td>{rule.precision !== undefined ? `${(rule.precision * 100).toFixed(1)}%` : "-"}</td>
                    <td>{ml.precision !== undefined ? `${(ml.precision * 100).toFixed(1)}%` : "-"}</td>
                    <td className="highlight-row">{hybrid.precision !== undefined ? `${(hybrid.precision * 100).toFixed(1)}%` : "-"}</td>
                  </tr>
                  <tr>
                    <td><strong>Recall (Detection Rate)</strong></td>
                    <td>{rule.recall !== undefined ? `${(rule.recall * 100).toFixed(1)}%` : "-"}</td>
                    <td>{ml.recall !== undefined ? `${(ml.recall * 100).toFixed(1)}%` : "-"}</td>
                    <td className="highlight-row">{hybrid.recall !== undefined ? `${(hybrid.recall * 100).toFixed(1)}%` : "-"}</td>
                  </tr>
                  <tr>
                    <td><strong>F1-Score</strong></td>
                    <td>{rule.f1 !== undefined ? rule.f1.toFixed(3) : "-"}</td>
                    <td>{ml.f1 !== undefined ? ml.f1.toFixed(3) : "-"}</td>
                    <td className="highlight-row">{hybrid.f1 !== undefined ? hybrid.f1.toFixed(3) : "-"}</td>
                  </tr>
                  <tr>
                    <td><strong>Specificity</strong></td>
                    <td>{rule.specificity !== undefined ? `${(rule.specificity * 100).toFixed(1)}%` : "-"}</td>
                    <td>{ml.specificity !== undefined ? `${(ml.specificity * 100).toFixed(1)}%` : "-"}</td>
                    <td className="highlight-row">{hybrid.specificity !== undefined ? `${(hybrid.specificity * 100).toFixed(1)}%` : "-"}</td>
                  </tr>
                  <tr>
                    <td>True Positives (Caught)</td>
                    <td>{rule.tp ?? "-"}</td>
                    <td>{ml.tp ?? "-"}</td>
                    <td className="highlight-row">{hybrid.tp ?? "-"}</td>
                  </tr>
                  <tr>
                    <td>False Positives (Alarms)</td>
                    <td>{rule.fp ?? "-"}</td>
                    <td>{ml.fp ?? "-"}</td>
                    <td className="highlight-row">{hybrid.fp ?? "-"}</td>
                  </tr>
                  <tr>
                    <td>True Negatives (Clean)</td>
                    <td>{rule.tn ?? "-"}</td>
                    <td>{ml.tn ?? "-"}</td>
                    <td className="highlight-row">{hybrid.tn ?? "-"}</td>
                  </tr>
                  <tr>
                    <td>False Negatives (Missed)</td>
                    <td>{rule.fn ?? "-"}</td>
                    <td>{ml.fn ?? "-"}</td>
                    <td className="highlight-row">{hybrid.fn ?? "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {hybrid.byType && Object.keys(hybrid.byType).length > 0 && (
            <div className="card">
              <h2 className="card-title">Detection Rate by Anomaly Category (Hybrid)</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Anomaly Category</th>
                    <th>Caught / Injected</th>
                    <th>Detection Rate</th>
                    <th>Coverage Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(hybrid.byType).map(([type, stats]) => {
                    const pct = Math.round((stats.rate || 0) * 100);
                    return (
                      <tr key={type}>
                        <td><code>{type}</code></td>
                        <td><strong>{stats.caught}</strong> / {stats.total}</td>
                        <td>{pct}%</td>
                        <td style={{ width: "30%" }}>
                          <div style={{ background: "#e2e8f0", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{ background: pct >= 80 ? "var(--valid)" : pct >= 50 ? "var(--suspicious)" : "var(--invalid)", width: `${pct}%`, height: "100%" }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h2 className="card-title">Rule vs ML Consensus & Agreement Analysis</h2>
            <div className="stat-grid" style={{ marginTop: "0.5rem" }}>
              <StatCard label="Overall Agreement Rate" value={`${(agreement.agreementRate * 100).toFixed(1)}%`} tone="valid" />
              <StatCard label="Disagreement Rate" value={`${(agreement.disagreementRate * 100).toFixed(1)}%`} tone={agreement.disagreementRate ? "suspicious" : "neutral"} />
              <StatCard label="Both Normal" value={agreement.bothNormal ?? 0} tone="neutral" />
              <StatCard label="Both Anomaly" value={agreement.bothAnomaly ?? 0} tone="invalid" />
              <StatCard label="Rule Flagged / ML Normal" value={agreement.ruleAnomalyMlNormal ?? 0} tone="suspicious" />
              <StatCard label="ML Flagged / Rule Normal" value={agreement.ruleNormalMlAnomaly ?? 0} tone="suspicious" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
