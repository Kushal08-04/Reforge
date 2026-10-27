import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import {
  fetchComparisonData,
  fetchLatestEvaluation,
  runEvaluationBenchmark,
} from "../api/endpoints";
import Badge from "../components/common/Badge";
import { BarChart2, RefreshCw, Play, CheckCircle } from "lucide-react";

export default function AnalyticsPage() {
  const { dataMode } = useSelector((s) => s.ui);
  const [comparison, setComparison] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const [loadingEval, setLoadingEval] = useState(false);
  const [runningEval, setRunningEval] = useState(false);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  async function loadComparison() {
    setLoadingComp(true);
    try {
      const data = await fetchComparisonData(selectedCategory ? { category: selectedCategory } : {});
      setComparison(data);
    } catch (err) {
      setError(err.message || "Failed to load comparison data.");
    } finally {
      setLoadingComp(false);
    }
  }

  async function loadEvaluation() {
    setLoadingEval(true);
    try {
      const data = await fetchLatestEvaluation();
      setEvaluation(data.evaluation);
    } catch (err) {
      setError(err.message || "Failed to load benchmark evaluation.");
    } finally {
      setLoadingEval(false);
    }
  }

  async function handleTriggerRun() {
    setRunningEval(true);
    setError("");
    try {
      const res = await runEvaluationBenchmark();
      setEvaluation(res.evaluation);
    } catch (err) {
      setError(err.message || "Failed to execute benchmark run.");
    } finally {
      setRunningEval(false);
    }
  }

  useEffect(() => {
    loadComparison();
    loadEvaluation();
  }, [selectedCategory, dataMode]);

  const summary = comparison?.summary || {};
  const catCounts = summary.categoryCounts || {};
  const evalReport = evaluation || {};

  const rule = evalReport.ruleMetrics || {};
  const ml = evalReport.mlMetrics || {};
  const hybrid = evalReport.hybridMetrics || {};

  return (
    <div>
      {/* Page Title & Controls */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <BarChart2 size={18} style={{ color: "var(--accent-telemetry)" }} />
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              Engine Analytics & Benchmark Evaluation
            </h3>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => { loadComparison(); loadEvaluation(); }}
              className="btn btn-secondary btn-sm"
              title="Refresh comparison & evaluation metrics"
            >
              <RefreshCw size={13} className={loadingComp || loadingEval ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleTriggerRun}
              disabled={runningEval}
              className="btn btn-primary btn-sm"
              title="Triggers real benchmark evaluation across held-out synthetic test set"
            >
              <Play size={13} />
              <span>{runningEval ? "Evaluating..." : "Run Benchmark Evaluation"}</span>
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: "10px", padding: "8px 12px", backgroundColor: "var(--accent-error-bg)", color: "var(--accent-error)", border: "1px solid var(--accent-error)", borderRadius: "var(--radius-sm)", fontSize: "12px" }}>
            {error}
          </div>
        )}
      </div>

      {/* Part 1: Rule vs ML Consensus Matrix */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Rule Engine vs ML Model Consensus Matrix</h3>
            <p className="card-subtitle">
              Evaluates agreement and divergence between deterministic rule checks and ML anomaly detection
            </p>
          </div>
        </div>

        {/* 2x2 Contingency Matrix Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "16px" }}>
          <div style={{ padding: "12px", backgroundColor: "var(--accent-verified-bg)", border: "1px solid var(--accent-verified)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "11px", color: "var(--accent-verified)", fontWeight: 600 }}>CONSENSUS NORMAL</div>
            <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-verified)", marginTop: "2px" }}>
              {catCounts.rule_normal_ml_normal ?? 0}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Rule Normal • ML Normal</div>
          </div>

          <div style={{ padding: "12px", backgroundColor: "var(--accent-error-bg)", border: "1px solid var(--accent-error)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "11px", color: "var(--accent-error)", fontWeight: 600 }}>CONSENSUS ANOMALY</div>
            <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-error)", marginTop: "2px" }}>
              {catCounts.rule_anomaly_ml_anomaly ?? 0}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Rule Anomaly • ML Anomaly</div>
          </div>

          <div style={{ padding: "12px", backgroundColor: "var(--accent-anomaly-bg)", border: "1px solid var(--accent-anomaly)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "11px", color: "var(--accent-anomaly)", fontWeight: 600 }}>RULE-ONLY ANOMALY</div>
            <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-anomaly)", marginTop: "2px" }}>
              {catCounts.rule_anomaly_ml_normal ?? 0}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Rule Anomaly • ML Normal</div>
          </div>

          <div style={{ padding: "12px", backgroundColor: "var(--accent-anomaly-bg)", border: "1px solid var(--accent-anomaly)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "11px", color: "var(--accent-anomaly)", fontWeight: 600 }}>ML-ONLY ANOMALY</div>
            <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-anomaly)", marginTop: "2px" }}>
              {catCounts.rule_normal_ml_anomaly ?? 0}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Rule Normal • ML Anomaly</div>
          </div>
        </div>

        {/* Filter Bar for Comparison Records */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Filter Records by Category:</span>
          <select
            className="select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ fontSize: "12px" }}
          >
            <option value="">All Comparison Categories</option>
            <option value="rule_normal_ml_normal">rule_normal_ml_normal</option>
            <option value="rule_anomaly_ml_anomaly">rule_anomaly_ml_anomaly</option>
            <option value="rule_anomaly_ml_normal">rule_anomaly_ml_normal (Divergence)</option>
            <option value="rule_normal_ml_anomaly">rule_normal_ml_anomaly (Divergence)</option>
          </select>
        </div>

        {/* Comparison Observations Table */}
        <div className="table-container">
          <table className="table" aria-label="Rule vs ML observations table">
            <thead>
              <tr>
                <th>Entity ID</th>
                <th>Observed</th>
                <th>Rule Risk</th>
                <th>ML Score</th>
                <th>Classification</th>
                <th>Category</th>
                <th>Disagreement Rationale</th>
              </tr>
            </thead>
            <tbody>
              {!comparison?.records || comparison.records.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: "16px" }}>
                    No observations matching the selected comparison category.
                  </td>
                </tr>
              ) : (
                comparison.records.slice(0, 8).map((r) => (
                  <tr key={r.validationResultId}>
                    <td><code>{r.entityId}</code></td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.value ?? "-"}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{r.ruleRiskScore ? r.ruleRiskScore.toFixed(2) : "0.00"}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{r.mlAnomalyScore ? r.mlAnomalyScore.toFixed(2) : "0.00"}</td>
                    <td><Badge tone={r.officialClassification}>{r.officialClassification}</Badge></td>
                    <td>
                      <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                        {r.comparisonCategory?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ fontSize: "11px", color: "var(--text-secondary)", maxWidth: "260px" }}>
                      {r.disagreementReason || "Consensus agreement."}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Part 2: Rigorous Benchmark Evaluation Report */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Rigorous Benchmark Evaluation Report</h3>
            <p className="card-subtitle">
              Reproducible benchmark comparing Rule-only, ML Isolation Forest, and Calibrated Hybrid decisions
            </p>
          </div>
          {evalReport.evaluatedAt && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Evaluated: {new Date(evalReport.evaluatedAt).toLocaleString()} • Size: {evalReport.datasetSize || 500} samples
            </span>
          )}
        </div>

        {/* Benchmark Metrics Comparison Table */}
        <div className="table-container">
          <table className="table" aria-label="Benchmark comparison metrics table">
            <thead>
              <tr>
                <th>Decision Layer Mode</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1 Score</th>
                <th>Specificity</th>
                <th>False Positive Rate (FPR)</th>
                <th>ROC-AUC</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Deterministic Rule Engine</strong></td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{rule.precision ? (rule.precision * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{rule.recall ? (rule.recall * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{rule.f1 ? (rule.f1 * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{rule.specificity ? (rule.specificity * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--accent-error)" }}>{rule.fpr ? (rule.fpr * 100).toFixed(2) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>N/A (Rule)</td>
              </tr>
              <tr>
                <td><strong>ML Isolation Forest (FastAPI)</strong></td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{ml.precision ? (ml.precision * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{ml.recall ? (ml.recall * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{ml.f1 ? (ml.f1 * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{ml.specificity ? (ml.specificity * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--accent-error)" }}>{ml.fpr ? (ml.fpr * 100).toFixed(2) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent-telemetry)" }}>{ml.roc_auc ? ml.roc_auc.toFixed(3) : "-"}</td>
              </tr>
              <tr style={{ backgroundColor: "var(--bg-secondary)", fontWeight: 600 }}>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <CheckCircle size={14} style={{ color: "var(--accent-verified)" }} />
                    <strong>Calibrated Hybrid Engine (REFORGE)</strong>
                  </span>
                </td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--accent-verified)" }}>{hybrid.precision ? (hybrid.precision * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--accent-verified)" }}>{hybrid.recall ? (hybrid.recall * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--accent-verified)", fontSize: "14px" }}>{hybrid.f1 ? (hybrid.f1 * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{hybrid.specificity ? (hybrid.specificity * 100).toFixed(1) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--accent-verified)" }}>{hybrid.fpr ? (hybrid.fpr * 100).toFixed(2) + "%" : "-"}</td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--accent-verified)" }}>Superior Balance</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
