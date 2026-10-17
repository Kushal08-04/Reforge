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

  const [reviewer, setReviewer] = useState("demo-reviewer");
  const [notes, setNotes] = useState("");
  const [correctedValue, setCorrectedValue] = useState("");
  const [showCorrectForm, setShowCorrectForm] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState("");

  useEffect(() => {
    dispatch(fetchQuarantineDetail(id));
    return () => dispatch(clearDetail());
  }, [dispatch, id]);

  if (detailStatus === "loading" || detailStatus === "idle") {
    return <div className="page"><p className="muted">Loading record...</p></div>;
  }
  if (detailStatus === "failed") {
    return <div className="page"><p className="error-text">Failed to load: {detailError}</p></div>;
  }
  if (!detail) return null;

  const { quarantineRecord, rawObservation, validationResult, recentHistory } = detail;

  function handleAction(action) {
    const payload = { id, action, reviewer, notes };
    if (action === "correct") {
      payload.correctedValues = { value: parseFloat(correctedValue) };
    }
    dispatch(submitReview(payload));
  }

  async function handleDiagnoseAndRepair() {
    setDiagnosing(true);
    setDiagnoseError("");
    try {
      const res = await apiClient.post("/repairs/diagnose", {
        quarantineRecordId: quarantineRecord._id,
        reviewer,
      });
      const proposal = res.data.proposal;
      navigate(`/repairs/${proposal._id}`);
    } catch (err) {
      setDiagnoseError(err.response?.data?.error || err.message || "Failed to trigger diagnosis.");
      setDiagnosing(false);
    }
  }

  const alreadyReviewed = quarantineRecord.reviewStatus !== "pending";
  const mlResult = validationResult?.mlResult || {};

  return (
    <div className="page">
      <p><Link to="/quarantine" className="link-small">&larr; Back to quarantine queue</Link></p>
      <h1 className="page-title">Record Detail & Quarantine Inspection</h1>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Observation Metadata</h2>
          {quarantineRecord.repairProposalId ? (
            <Link to={`/repairs/${quarantineRecord.repairProposalId}`} className="btn btn-neutral" style={{ textDecoration: "none" }}>
              View Existing Repair Proposal &rarr;
            </Link>
          ) : (
            <button
              className="btn btn-approve"
              onClick={handleDiagnoseAndRepair}
              disabled={diagnosing}
            >
              {diagnosing ? "Diagnosing Failure..." : "Diagnose & Propose ETL Repair"}
            </button>
          )}
        </div>

        {diagnoseError && <p className="error-text">{diagnoseError}</p>}

        <div className="detail-grid">
          <div><span className="detail-label">Entity</span><div><strong>{rawObservation.entityId}</strong></div></div>
          <div><span className="detail-label">Timestamp</span><div>{new Date(rawObservation.timestamp).toLocaleString()}</div></div>
          <div><span className="detail-label">Raw Value</span><div><strong>{rawObservation.values?.value}</strong></div></div>
          <div><span className="detail-label">Official Classification</span><div><ClassificationBadge classification={validationResult.classification} /></div></div>
          <div><span className="detail-label">Rule Risk Score</span><div>{validationResult.ruleRiskScore !== null && validationResult.ruleRiskScore !== undefined ? validationResult.ruleRiskScore.toFixed(2) : (validationResult.semanticRiskScore?.toFixed(2) ?? "—")}</div></div>
          <div><span className="detail-label">ML Anomaly Score</span><div>{mlResult.anomalyScore !== undefined ? mlResult.anomalyScore.toFixed(2) : "—"}</div></div>
          <div><span className="detail-label">Comparison Category</span><div><span className="badge badge-info">{validationResult.comparisonCategory ? validationResult.comparisonCategory.replace(/_/g, " ") : "n/a"}</span></div></div>
          <div><span className="detail-label">Review Status</span><div><span className={`badge badge-review-${quarantineRecord.reviewStatus}`}>{quarantineRecord.reviewStatus}</span></div></div>
        </div>

        {validationResult.disagreementReason && (
          <p style={{ marginTop: "1rem", fontSize: "0.88rem", background: "#f8fafc", padding: "0.6rem 0.8rem", borderRadius: "4px", border: "1px solid var(--line)" }}>
            <strong>Engine Analysis:</strong> {validationResult.disagreementReason}
          </p>
        )}

        <p style={{ marginTop: "0.75rem" }}>
          <Link to={`/audit/${rawObservation._id}`} className="link-small">View full audit lineage &rarr;</Link>
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Why was this flagged? (Rule & ML Evidence)</h2>
        {!validationResult.schemaValid && validationResult.schemaErrors?.length > 0 && (
          <div className="evidence-item evidence-triggered">
            <strong>Schema validation failed</strong>
            <ul>{validationResult.schemaErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
        {validationResult.evidence?.map((ev) => (
          <div key={ev.source} className={`evidence-item ${ev.triggered ? "evidence-triggered" : "evidence-clear"}`}>
            <strong>{ev.source}</strong> {ev.triggered ? "🚩 Triggered" : "✓ Clear"}
            <p>{ev.message}</p>
          </div>
        ))}
        {(!validationResult.evidence || validationResult.evidence.length === 0) && (
          <p className="muted">No semantic evidence recorded (schema validation failed before the semantic engine ran).</p>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Recent History for this Entity</h2>
        <table className="table">
          <thead><tr><th>Timestamp</th><th>Value</th></tr></thead>
          <tbody>
            {recentHistory.map((h) => (
              <tr key={h._id} className={h._id === rawObservation._id ? "row-highlight" : ""}>
                <td>{new Date(h.timestamp).toLocaleString()}</td>
                <td>{h.values?.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="card-title">Manual Review Actions</h2>
        {alreadyReviewed ? (
          <div>
            <p>
              This record was already <strong>{quarantineRecord.reviewStatus}</strong> by{" "}
              {quarantineRecord.reviewer} on {new Date(quarantineRecord.reviewedAt).toLocaleString()}.
            </p>
            {quarantineRecord.correctedValues && (
              <p>Corrected value: <strong>{quarantineRecord.correctedValues.value}</strong></p>
            )}
            {quarantineRecord.reviewNotes && <p className="muted">Notes: {quarantineRecord.reviewNotes}</p>}
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
                Supply Corrected Value
              </button>
            </div>

            {showCorrectForm && (
              <div className="correct-form">
                <div className="form-row">
                  <label>Corrected value</label>
                  <input
                    type="number"
                    step="any"
                    value={correctedValue}
                    onChange={(e) => setCorrectedValue(e.target.value)}
                    className="input"
                    placeholder="e.g. 25.4"
                  />
                </div>
                <button
                  className="btn btn-approve"
                  disabled={correctedValue === ""}
                  onClick={() => handleAction("correct")}
                >
                  Submit correction
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
