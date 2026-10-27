import { useState, useEffect } from "react";
import apiClient from "../api/client";
import ClassificationBadge from "../components/ClassificationBadge";
import StatCard from "../components/StatCard";
import { Link } from "react-router-dom";

export default function ComparisonPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  async function fetchComparison(cat = "") {
    setLoading(true);
    setError("");
    try {
      const url = cat ? `/comparison?category=${cat}` : "/comparison";
      const res = await apiClient.get(url);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load comparison data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchComparison(selectedCategory);
  }, [selectedCategory]);

  const summary = data?.summary || {};
  const catCounts = summary.categoryCounts || {};

  return (
    <div className="page">
      <h1 className="page-title">Rule vs ML Comparison</h1>
      <p className="muted">
        Examine consensus and divergence between deterministic semantic rules and ML anomaly scores in real-time.
      </p>

      {summary.totalEvaluated > 0 && (
        <div className="stat-grid">
          <StatCard
            label="Rule/ML Agreement"
            value={`${(summary.agreementRate * 100).toFixed(1)}%`}
            tone="valid"
          />
          <StatCard
            label="Total Evaluated"
            value={summary.totalEvaluated}
            tone="neutral"
          />
          <StatCard
            label="Consensus Normal"
            value={catCounts.rule_normal_ml_normal || 0}
            tone="valid"
          />
          <StatCard
            label="Consensus Anomaly"
            value={catCounts.rule_anomaly_ml_anomaly || 0}
            tone="invalid"
          />
          <StatCard
            label="Rule Only Anomaly"
            value={catCounts.rule_anomaly_ml_normal || 0}
            tone={catCounts.rule_anomaly_ml_normal ? "suspicious" : "neutral"}
          />
          <StatCard
            label="ML Only Anomaly"
            value={catCounts.rule_normal_ml_anomaly || 0}
            tone={catCounts.rule_normal_ml_anomaly ? "suspicious" : "neutral"}
          />
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Observation Comparison Matrix</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label htmlFor="cat-filter" style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Filter by Category:</label>
            <select
              id="cat-filter"
              className="input"
              style={{ width: "auto", padding: "0.35rem 0.6rem" }}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories ({summary.totalEvaluated || 0})</option>
              <option value="rule_normal_ml_normal">Consensus Normal ({catCounts.rule_normal_ml_normal || 0})</option>
              <option value="rule_anomaly_ml_anomaly">Consensus Anomaly ({catCounts.rule_anomaly_ml_anomaly || 0})</option>
              <option value="rule_anomaly_ml_normal">Disagreement: Rule Anomaly / ML Normal ({catCounts.rule_anomaly_ml_normal || 0})</option>
              <option value="rule_normal_ml_anomaly">Disagreement: Rule Normal / ML Anomaly ({catCounts.rule_normal_ml_anomaly || 0})</option>
            </select>
            <button className="btn btn-neutral" onClick={() => fetchComparison(selectedCategory)}>
              Refresh
            </button>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        {loading && <p className="muted">Loading comparison records...</p>}

        {!loading && data?.records?.length === 0 && (
          <p className="muted">No observations found matching the selected category.</p>
        )}

        {!loading && data?.records?.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Timestamp</th>
                  <th>Value</th>
                  <th>Rule Score</th>
                  <th>Rule Class</th>
                  <th>ML Score</th>
                  <th>ML Anomaly</th>
                  <th>Hybrid Decision</th>
                  <th>Comparison Category</th>
                  <th>Disagreement Context</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => {
                  const isDisagree =
                    r.comparisonCategory === "rule_anomaly_ml_normal" ||
                    r.comparisonCategory === "rule_normal_ml_anomaly";
                  return (
                    <tr key={r.validationResultId} style={isDisagree ? { background: "#fffdf5" } : {}}>
                      <td><strong>{r.entityId}</strong></td>
                      <td>{r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "-"}</td>
                      <td>{r.value}</td>
                      <td><code>{(r.ruleRiskScore || 0).toFixed(2)}</code></td>
                      <td><ClassificationBadge classification={r.ruleClassification} /></td>
                      <td><code>{(r.mlAnomalyScore || 0).toFixed(2)}</code></td>
                      <td>
                        <span className={`badge ${r.mlAnomaly ? "badge-danger" : "badge-success"}`}>
                          {r.mlAnomaly ? "ANOMALY" : "NORMAL"}
                        </span>
                      </td>
                      <td><ClassificationBadge classification={r.hybridClassification} /></td>
                      <td>
                        <span className={isDisagree ? "pill-disagree" : "pill-agree"}>
                          {r.comparisonCategory ? r.comparisonCategory.replace(/_/g, " ") : "n/a"}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.82rem", maxWidth: "260px" }}>
                        {r.disagreementReason || <span className="muted">Consensus agreement</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
