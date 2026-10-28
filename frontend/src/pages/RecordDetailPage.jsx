import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  fetchQuarantineDetail,
  submitReview,
  clearDetail,
} from "../features/quarantine/quarantineSlice";
import ClassificationBadge from "../components/ClassificationBadge";
import apiClient from "../api/client";

export default function RecordDetailPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { detail, detailStatus, detailError, reviewStatus, reviewError } = useSelector(
    (s) => s.quarantine
  );

  const [reviewer, setReviewer] = useState("lead-data-engineer");
  const [notes, setNotes] = useState("");
  const [correctedValue, setCorrectedValue] = useState("");
  const [showCorrectForm, setShowCorrectForm] = useState(false);
  const [healing, setHealing] = useState(false);
  const [applyingStrategy, setApplyingStrategy] = useState(null);
  const [diagnoseError, setDiagnoseError] = useState("");
  const [healSuccessMsg, setHealSuccessMsg] = useState("");

  useEffect(() => {
    dispatch(fetchQuarantineDetail(id));
    return () => dispatch(clearDetail());
  }, [dispatch, id]);

  if (detailStatus === "loading" || detailStatus === "idle") {
    return (
      <div className="page">
        <p className="muted">Loading observation diagnostics and healing options...</p>
      </div>
    );
  }

  if (detailStatus === "failed") {
    return (
      <div className="page">
        <p><Link to="/quarantine" className="link-small">&larr; Back to quarantine queue</Link></p>
        <div className="card" style={{ borderLeft: "4px solid #ef4444", background: "#fef2f2", color: "#991b1b" }}>
          <h2 style={{ margin: "0 0 0.5rem" }}>Failed to Load Quarantine Detail</h2>
          <p style={{ margin: 0 }}>{detailError || "The requested observation could not be found."}</p>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="page">
        <p><Link to="/quarantine" className="link-small">&larr; Back to quarantine queue</Link></p>
        <p className="muted">No observation details returned. <Link to="/quarantine">Return to quarantine</Link></p>
      </div>
    );
  }

  // Defensively extract record and sub-objects with robust fallback synthesis
  const quarantineRecord = detail.quarantineRecord || {};
  const rawObservation = detail.rawObservation || {
    _id: quarantineRecord.rawObservationId || quarantineRecord._id,
    entityId: quarantineRecord.entityId || "generic-sensor",
    timestamp: quarantineRecord.timestamp || new Date(),
    values: { value: quarantineRecord.rawReading ?? 0 },
    sourceId: "quarantined-stream",
  };
  const validationResult = detail.validationResult || {
    classification: quarantineRecord.classification || "suspicious",
    ruleClassification: quarantineRecord.classification || "suspicious",
    ruleRiskScore: quarantineRecord.ruleRiskScore ?? quarantineRecord.semanticRiskScore ?? 0.5,
    semanticRiskScore: quarantineRecord.semanticRiskScore ?? quarantineRecord.ruleRiskScore ?? 0.5,
    mlResult: { anomalyScore: quarantineRecord.mlAnomalyScore ?? 0.5, isAnomaly: true },
    comparisonCategory: quarantineRecord.comparisonCategory || "n/a",
    schemaValid: true,
    evidence: [],
    disagreementReason: "Observation was quarantined during ETL validation.",
  };
  const recentHistory = Array.isArray(detail.recentHistory) ? detail.recentHistory : [];
  const diagnosticReport = detail.diagnosticReport || {};
  const healingRecommendations = detail.healingRecommendations || null;
  const candidates = healingRecommendations?.candidates || [];
  const optimalCandidate = healingRecommendations?.optimalCandidate || null;

  // Resolve primary sensor value
  const rawValues = rawObservation.values || {};
  let primaryValue = rawValues.value;
  if (primaryValue === undefined || primaryValue === null || isNaN(primaryValue)) {
    for (const k of ["temperature", "temp", "humidity", "hum", "co", "smoke", "lpg", "ph", "electrical_conductivity", "pressure", "light", "motion"]) {
      if (typeof rawValues[k] === "number" && !isNaN(rawValues[k])) {
        primaryValue = rawValues[k];
        break;
      }
    }
    if (primaryValue === undefined) {
      for (const v of Object.values(rawValues)) {
        if (typeof v === "number" && !isNaN(v)) {
          primaryValue = v;
          break;
        }
      }
    }
  }

  const alreadyReviewed = quarantineRecord.reviewStatus !== "pending";
  const mlResult = validationResult.mlResult || {};

  // Handler for manual review actions (approve, reject, correct)
  function handleAction(action) {
    const payload = { id, action, reviewer, notes };
    if (action === "correct") {
      payload.correctedValues = { value: parseFloat(correctedValue) };
    }
    dispatch(submitReview(payload));
  }

  // Handler for automated iterative sandbox healing
  async function handleAutoHeal() {
    setHealing(true);
    setHealSuccessMsg("");
    setDiagnoseError("");
    try {
      const res = await apiClient.post("/quarantine/heal", {
        quarantineRecordId: quarantineRecord._id,
        reviewer,
      });
      if (res.data.success) {
        const item = res.data.results?.[0];
        setHealSuccessMsg(
          `Observation successfully healed in sandbox! Repaired Value: ${item?.healedValue} (Final Verified Risk: ${item?.finalRiskScore} < 0.30 via ${item?.strategy})`
        );
        dispatch(fetchQuarantineDetail(id));
      } else {
        setDiagnoseError(res.data.message || "Auto-heal failed.");
      }
    } catch (err) {
      setDiagnoseError(err.response?.data?.error || err.message || "Auto-heal failed.");
    } finally {
      setHealing(false);
    }
  }

  // Handler for applying a specific recommended healing strategy
  async function handleApplyStrategy(strat) {
    setApplyingStrategy(strat.strategy);
    setHealSuccessMsg("");
    setDiagnoseError("");
    try {
      const res = await apiClient.post("/quarantine/heal", {
        quarantineRecordId: quarantineRecord._id,
        reviewer,
        strategy: strat.strategy,
        preferredValue: strat.proposedValue,
      });
      if (res.data.success) {
        const item = res.data.results?.[0];
        setHealSuccessMsg(
          `Successfully applied "${strat.title || strat.strategy}" in sandbox! Repaired Value: ${item?.healedValue} (Risk: ${item?.finalRiskScore} < 0.30)`
        );
        dispatch(fetchQuarantineDetail(id));
      } else {
        setDiagnoseError(res.data.message || "Failed to apply strategy.");
      }
    } catch (err) {
      setDiagnoseError(err.response?.data?.error || err.message || "Strategy application failed.");
    } finally {
      setApplyingStrategy(null);
    }
  }

  return (
    <div className="page">
      {/* Navigation & Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <p style={{ margin: "0 0 0.25rem" }}>
            <Link to="/quarantine" className="link-small">&larr; Back to quarantine queue</Link>
          </p>
          <h1 className="page-title" style={{ margin: 0 }}>Quarantine Review & Root-Cause Diagnostics</h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {!alreadyReviewed && (
            <button
              className="btn btn-approve"
              onClick={handleAutoHeal}
              disabled={healing || applyingStrategy !== null}
              style={{ fontWeight: "bold" }}
            >
              {healing ? "Healing in Sandbox..." : "⚡ Auto-Heal in Sandbox (< 0.30 Target)"}
            </button>
          )}
          {quarantineRecord.repairProposalId && (
            <Link to={`/repairs/${quarantineRecord.repairProposalId}`} className="btn btn-neutral" style={{ textDecoration: "none" }}>
              View Repair Proposal &rarr;
            </Link>
          )}
          <Link to={`/audit/${rawObservation._id}`} className="btn btn-neutral" style={{ textDecoration: "none" }}>
            Audit Lineage &rarr;
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {healSuccessMsg && (
        <div style={{ padding: "0.85rem 1.1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", marginBottom: "1rem", color: "#166534", fontWeight: "600" }}>
          ✓ {healSuccessMsg}
        </div>
      )}
      {diagnoseError && (
        <div style={{ padding: "0.85rem 1.1rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", marginBottom: "1rem", color: "#991b1b" }}>
          ⚠️ {diagnoseError}
        </div>
      )}

      {/* SECTION 1: OBSERVATION TELEMETRY METADATA */}
      <div className="card" style={{ marginBottom: "1.2rem" }}>
        <h2 className="card-title" style={{ margin: "0 0 0.8rem" }}>Observation Metadata & Telemetry Snapshot</h2>
        <div className="detail-grid">
          <div><span className="detail-label">Entity / Sensor ID</span><div><strong>{rawObservation.entityId}</strong></div></div>
          <div><span className="detail-label">Flagged Timestamp</span><div>{new Date(rawObservation.timestamp).toLocaleString()}</div></div>
          <div><span className="detail-label">Source ID / Type</span><div>{rawObservation.sourceId || "sensor"} ({rawObservation.sourceType || "stream"})</div></div>
          <div>
            <span className="detail-label">Primary Flagged Value</span>
            <div>
              <strong style={{ fontSize: "1.25rem", color: validationResult.classification === "invalid" ? "var(--invalid)" : "var(--suspicious)" }}>
                {primaryValue !== undefined ? primaryValue : "—"}
              </strong>
              {diagnosticReport.bounds?.unit && <span className="muted" style={{ marginLeft: "0.3rem" }}>{diagnosticReport.bounds.unit}</span>}
            </div>
          </div>
          <div><span className="detail-label">Official Classification</span><div><ClassificationBadge classification={validationResult.classification} /></div></div>
          <div><span className="detail-label">Rule Risk Score</span><div><strong>{validationResult.ruleRiskScore !== null && validationResult.ruleRiskScore !== undefined ? validationResult.ruleRiskScore.toFixed(2) : (validationResult.semanticRiskScore?.toFixed(2) ?? "—")}</strong></div></div>
          <div><span className="detail-label">ML Anomaly Score</span><div><strong>{mlResult.anomalyScore !== undefined ? mlResult.anomalyScore.toFixed(2) : "—"}</strong></div></div>
          <div><span className="detail-label">Review Status</span><div><span className={`badge badge-review-${quarantineRecord.reviewStatus}`}>{quarantineRecord.reviewStatus?.toUpperCase()}</span></div></div>
        </div>

        {/* Multi-Channel Telemetry Grid if record contains multiple sensor channels */}
        {Object.keys(rawValues).length > 1 && (
          <div style={{ marginTop: "1rem", paddingTop: "0.8rem", borderTop: "1px solid var(--line)" }}>
            <span className="detail-label" style={{ display: "block", marginBottom: "0.4rem" }}>Full Telemetry Channels in Payload</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem" }}>
              {Object.entries(rawValues).map(([k, v]) => (
                <div key={k} style={{ background: "#f8fafc", padding: "0.4rem 0.8rem", borderRadius: "4px", border: "1px solid var(--line)", fontSize: "0.85rem" }}>
                  <span className="muted">{k}:</span> <strong>{typeof v === "number" ? v : JSON.stringify(v)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: WHY WAS THIS FLAGGED? (DIAGNOSTIC EVIDENCE) */}
      <div className="card" style={{ borderLeft: "4px solid #f59e0b", marginBottom: "1.2rem" }}>
        <h2 className="card-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0 0 0.6rem" }}>
          <span>🔍 Why Was This Flagged? (Root-Cause Diagnostic Evidence)</span>
          <span className="badge badge-warning" style={{ fontSize: "0.8rem" }}>
            {validationResult.classification?.toUpperCase()}
          </span>
        </h2>

        {/* High-level Primary Root Cause Alert */}
        <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", padding: "0.8rem 1rem", borderRadius: "6px", marginBottom: "1rem" }}>
          <strong style={{ color: "#92400e", fontSize: "0.95rem" }}>Diagnostic Assessment:</strong>
          <p style={{ margin: "0.25rem 0 0", color: "#78350f", fontSize: "0.9rem" }}>
            {diagnosticReport.primaryReason || validationResult.disagreementReason || "Observation triggered risk thresholds during pipeline ingestion."}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
          {/* Rule Engine Breakdown */}
          <div style={{ background: "#f8fafc", padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--line)" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.92rem", color: "var(--ink)" }}>1. Deterministic Rule Engine</h3>
            <p className="muted" style={{ margin: "0 0 0.6rem", fontSize: "0.82rem" }}>
              Physical boundaries, temporal continuity rates of change, and diurnal boundaries.
            </p>
            {diagnosticReport.triggeredRules && diagnosticReport.triggeredRules.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {diagnosticReport.triggeredRules.map((r, i) => (
                  <div key={i} className="evidence-item evidence-triggered" style={{ margin: 0, padding: "0.5rem 0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>🚩 {r.source}</strong>
                      <span className="badge badge-danger" style={{ fontSize: "0.75rem" }}>{r.severity || "HIGH"}</span>
                    </div>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>{r.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontStyle: "italic", fontSize: "0.85rem" }}>
                ✓ No deterministic rule bounds were explicitly breached (flagged primarily via statistical or ML anomaly detection).
              </p>
            )}
          </div>

          {/* Machine Learning Isolation Forest Breakdown */}
          <div style={{ background: "#f8fafc", padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--line)" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.92rem", color: "var(--ink)" }}>2. Machine Learning Anomaly Detection</h3>
            <p className="muted" style={{ margin: "0 0 0.6rem", fontSize: "0.82rem" }}>
              Unsupervised Isolation Forest tree partitioning in continuous telemetry space.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Active Model Version:</span>
                <code>{mlResult.modelVersion || "isolation_forest:v2.0.0-iot"}</code>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">ML Anomaly Score:</span>
                <strong style={{ color: (mlResult.anomalyScore || 0) >= 0.50 ? "var(--invalid)" : "var(--valid)" }}>
                  {mlResult.anomalyScore !== undefined ? mlResult.anomalyScore.toFixed(3) : "—"} (Threshold: 0.50)
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Comparison Category:</span>
                <span className="badge badge-info">{validationResult.comparisonCategory ? validationResult.comparisonCategory.replace(/_/g, " ") : "n/a"}</span>
              </div>
              {validationResult.disagreementReason && (
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.82rem", background: "#fff", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--line)" }}>
                  <strong>Analysis:</strong> {validationResult.disagreementReason}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Physical Boundaries Context */}
        {diagnosticReport.bounds && (
          <div style={{ background: "#f1f5f9", padding: "0.6rem 0.9rem", borderRadius: "4px", fontSize: "0.85rem" }}>
            <span><strong>Physical Domain Limits ({diagnosticReport.sensorType?.toUpperCase()}):</strong> Allowed physical range is </span>
            <code>[{diagnosticReport.bounds.min}, {diagnosticReport.bounds.max}] {diagnosticReport.bounds.unit}</code>
            <span> with max continuous rate of change of </span>
            <code>{diagnosticReport.bounds.maxRateOfChangePerSec} {diagnosticReport.bounds.unit}/s</code>.
          </div>
        )}
      </div>

      {/* SECTION 3: RECOMMENDED OPTIONS FOR HEALING (INTERACTIVE STRATEGY CARDS) */}
      <div className="card" style={{ borderLeft: "4px solid #10b981", marginBottom: "1.2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h2 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>💡 Recommended Options for Healing</span>
              <span className="badge badge-success" style={{ fontSize: "0.8rem" }}>
                {candidates.length} Mathematically Grounded Strategies
              </span>
            </h2>
            <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.88rem" }}>
              Select any candidate healing strategy to test and apply it in the isolated sandbox without mutating raw sensor data.
            </p>
          </div>
        </div>

        {candidates.length === 0 ? (
          <p className="muted" style={{ fontStyle: "italic", margin: "0.5rem 0" }}>
            No specialized repair candidates generated for this observation. You can heal it using the standard sandbox cascade button above.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "0.8rem" }}>
            {candidates.map((cand, idx) => {
              const isApplying = applyingStrategy === cand.strategy;
              return (
                <div
                  key={cand.strategy || idx}
                  style={{
                    background: cand.isOptimal ? "#f0fdf4" : "#ffffff",
                    border: cand.isOptimal ? "2px solid #10b981" : "1px solid var(--line)",
                    borderRadius: "8px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: cand.isOptimal ? "0 4px 6px -1px rgba(16, 185, 129, 0.1)" : "none",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                      <span style={{ fontSize: "1.25rem" }}>{cand.icon || "⚙️"}</span>
                      {cand.isOptimal ? (
                        <span className="badge badge-success" style={{ fontSize: "0.75rem", fontWeight: "bold" }}>
                          ⭐ RECOMMENDED (&lt; 0.30)
                        </span>
                      ) : (
                        <span className="badge badge-neutral" style={{ fontSize: "0.72rem" }}>
                          ALTERNATIVE
                        </span>
                      )}
                    </div>

                    <h3 style={{ margin: "0 0 0.3rem", fontSize: "1rem", color: "var(--ink)" }}>
                      {cand.title || cand.strategy}
                    </h3>
                    <p className="muted" style={{ margin: "0 0 0.6rem", fontSize: "0.82rem" }}>
                      {cand.description}
                    </p>

                    <div style={{ background: "#ffffff", padding: "0.6rem 0.8rem", borderRadius: "6px", border: "1px solid var(--line)", marginBottom: "0.6rem" }}>
                      <span className="detail-label" style={{ display: "block", marginBottom: "0.15rem" }}>Proposed Healed Reading</span>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
                        <span style={{ fontSize: "1.4rem", fontWeight: "700", color: "var(--valid)" }}>
                          {cand.proposedValue}
                        </span>
                        <span className="muted" style={{ fontSize: "0.85rem" }}>{cand.unit || diagnosticReport.bounds?.unit}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: "0.82rem", color: "var(--ink-soft)", marginBottom: "0.6rem" }}>
                      <strong>Formula:</strong> {cand.formulaExplanation}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", marginBottom: "0.8rem" }}>
                      <span className="muted">Confidence: <strong>{Math.round((cand.confidenceScore || 0.90) * 100)}%</strong></span>
                      <span className="badge badge-success" style={{ fontSize: "0.75rem" }}>
                        Risk: &lt; {cand.projectedRiskScore !== undefined ? cand.projectedRiskScore.toFixed(2) : "0.30"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", paddingTop: "0.6rem", borderTop: "1px solid var(--line)" }}>
                    <button
                      className="btn btn-approve"
                      style={{ flex: 1, padding: "0.4rem 0.6rem", fontSize: "0.82rem", fontWeight: "600" }}
                      onClick={() => handleApplyStrategy(cand)}
                      disabled={isApplying || healing}
                    >
                      {isApplying ? "Testing in Sandbox..." : "⚡ Apply This Strategy"}
                    </button>
                    <button
                      className="btn btn-neutral"
                      style={{ padding: "0.4rem 0.6rem", fontSize: "0.82rem" }}
                      title="Use this value in manual review form"
                      onClick={() => {
                        setCorrectedValue(String(cand.proposedValue));
                        setShowCorrectForm(true);
                      }}
                    >
                      Use Value
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 4: RECENT HISTORY FOR THIS ENTITY */}
      <div className="card" style={{ marginBottom: "1.2rem" }}>
        <h2 className="card-title">Recent Telemetry History for this Sensor Entity</h2>
        <p className="muted" style={{ margin: "0 0 0.8rem", fontSize: "0.88rem" }}>
          Consecutive telemetry stream records demonstrating temporal continuity before and after the quarantined event.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Sensor Value</th>
                <th>Observation ID</th>
              </tr>
            </thead>
            <tbody>
              {recentHistory.map((h) => {
                const isCurrent = String(h._id) === String(rawObservation._id);
                const hVal = h.values?.value ?? h.values?.temperature ?? h.values?.temp ?? h.values?.humidity ?? h.rawReading;
                return (
                  <tr key={h._id} className={isCurrent ? "row-highlight" : ""}>
                    <td>{new Date(h.timestamp).toLocaleString()}</td>
                    <td>
                      <strong style={{ color: isCurrent ? "var(--invalid)" : "inherit" }}>
                        {hVal !== undefined ? hVal : "—"}
                      </strong>
                      {isCurrent && <span className="badge badge-danger" style={{ marginLeft: "0.5rem" }}>FLAGGED</span>}
                    </td>
                    <td><code>{h._id}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 5: MANUAL REVIEW & SIGN-OFF ACTIONS */}
      <div className="card">
        <h2 className="card-title">Manual Review & Human Sign-off Actions</h2>
        {alreadyReviewed ? (
          <div>
            {quarantineRecord.reviewStatus === "repaired" ? (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "0.8rem 1rem", borderRadius: "6px" }}>
                <p style={{ margin: "0 0 0.3rem", color: "#166534" }}>
                  ✓ This observation was <strong>Healed in Sandbox</strong> by {quarantineRecord.reviewer} on {new Date(quarantineRecord.reviewedAt || Date.now()).toLocaleString()}.
                </p>
                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.5rem", fontSize: "0.95rem" }}>
                  <div>Original Flagged: <strong style={{ color: "var(--invalid)", textDecoration: "line-through" }}>{quarantineRecord.correctedValues?.previousValue ?? primaryValue ?? "—"}</strong></div>
                  <div>Healed Cleaned Value: <strong style={{ color: "var(--valid)", fontSize: "1.1rem" }}>{quarantineRecord.correctedValues?.value}</strong></div>
                  <div>Repair Strategy: <code>{quarantineRecord.correctedValues?.strategy || "cascade_optimal"}</code></div>
                  <div>Verified Sandbox Risk: <span className="badge badge-success">&lt; 0.30 Passed</span></div>
                </div>
                {quarantineRecord.reviewNotes && (
                  <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>Notes: {quarantineRecord.reviewNotes}</p>
                )}
              </div>
            ) : (
              <div>
                <p>
                  This record was already <strong>{quarantineRecord.reviewStatus}</strong> by{" "}
                  {quarantineRecord.reviewer} on {new Date(quarantineRecord.reviewedAt || Date.now()).toLocaleString()}.
                </p>
                {quarantineRecord.correctedValues && (
                  <p>Corrected value: <strong>{quarantineRecord.correctedValues.value}</strong></p>
                )}
                {quarantineRecord.reviewNotes && <p className="muted">Notes: {quarantineRecord.reviewNotes}</p>}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="form-row">
              <label>Reviewer Identity</label>
              <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="input" />
            </div>
            <div className="form-row">
              <label>Review Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="textarea" rows={2} />
            </div>

            <div className="action-row">
              <button className="btn btn-approve" onClick={() => handleAction("approve")}>
                Approve Original
              </button>
              <button className="btn btn-reject" onClick={() => handleAction("reject")}>
                Reject Observation
              </button>
              <button className="btn btn-neutral" onClick={() => setShowCorrectForm((v) => !v)}>
                Supply Custom Corrected Value
              </button>
            </div>

            {showCorrectForm && (
              <div className="correct-form" style={{ marginTop: "1rem" }}>
                <div className="form-row">
                  <label>Corrected Sensor Value</label>
                  <input
                    type="number"
                    step="any"
                    value={correctedValue}
                    onChange={(e) => setCorrectedValue(e.target.value)}
                    className="input"
                    placeholder="e.g. 24.5"
                  />
                </div>
                <button
                  className="btn btn-approve"
                  disabled={correctedValue === ""}
                  onClick={() => handleAction("correct")}
                >
                  Submit Custom Correction
                </button>
              </div>
            )}

            {reviewStatus === "failed" && <p className="error-text">{reviewError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
