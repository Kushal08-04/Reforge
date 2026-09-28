import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, Link } from "react-router-dom";
import {
  fetchQuarantineDetail,
  submitReview,
  clearDetail,
} from "../features/quarantine/quarantineSlice";
import ClassificationBadge from "../components/ClassificationBadge";

export default function RecordDetailPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { detail, detailStatus, detailError, reviewStatus, reviewError } = useSelector(
    (s) => s.quarantine
  );

  const [reviewer, setReviewer] = useState("demo-reviewer");
  const [notes, setNotes] = useState("");
  const [correctedValue, setCorrectedValue] = useState("");
  const [showCorrectForm, setShowCorrectForm] = useState(false);

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

  const alreadyReviewed = quarantineRecord.reviewStatus !== "pending";

  return (
    <div className="page">
      <p><Link to="/quarantine" className="link-small">Back to quarantine queue</Link></p>
      <h1 className="page-title">Record Detail</h1>

      <div className="card">
        <h2 className="card-title">Observation</h2>
        <div className="detail-grid">
          <div><span className="detail-label">Entity</span><div>{rawObservation.entityId}</div></div>
          <div><span className="detail-label">Timestamp</span><div>{new Date(rawObservation.timestamp).toLocaleString()}</div></div>
          <div><span className="detail-label">Value</span><div>{rawObservation.values?.value}</div></div>
          <div><span className="detail-label">Classification</span><div><ClassificationBadge classification={validationResult.classification} /></div></div>
          <div><span className="detail-label">Risk Score</span><div>{validationResult.semanticRiskScore !== null ? validationResult.semanticRiskScore.toFixed(2) : "—"}</div></div>
          <div><span className="detail-label">Review Status</span><div><span className={`badge badge-review-${quarantineRecord.reviewStatus}`}>{quarantineRecord.reviewStatus}</span></div></div>
        </div>
        <p style={{ marginTop: "1rem" }}>
          <Link to={`/audit/${rawObservation._id}`} className="link-small">View full audit trail</Link>
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Why was this flagged? (Evidence)</h2>
        {!validationResult.schemaValid && validationResult.schemaErrors?.length > 0 && (
          <div className="evidence-item evidence-triggered">
            <strong>Schema validation failed</strong>
            <ul>{validationResult.schemaErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
        {validationResult.evidence?.map((ev) => (
          <div key={ev.source} className={`evidence-item ${ev.triggered ? "evidence-triggered" : "evidence-clear"}`}>
            <strong>{ev.source}</strong> {ev.triggered ? "🚩" : "✓"}
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
        <h2 className="card-title">Review Action</h2>
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
              <label>Reviewer</label>
              <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="input" />
            </div>
            <div className="form-row">
              <label>Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="textarea" rows={2} />
            </div>

            <div className="action-row">
              <button className="btn btn-approve" onClick={() => handleAction("approve")}>
                Approve original
              </button>
              <button className="btn btn-reject" onClick={() => handleAction("reject")}>
                Reject
              </button>
              <button className="btn btn-neutral" onClick={() => setShowCorrectForm((v) => !v)}>
                Correct value
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
