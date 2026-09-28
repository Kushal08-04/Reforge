import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, Link } from "react-router-dom";
import { fetchAuditTrail, clearAudit } from "../features/audit/auditSlice";

const ACTION_LABELS = {
  ingested: "Ingested",
  schema_validated: "Schema validated",
  semantic_validated: "Semantic validation ran",
  quarantined: "Quarantined for review",
  review_approved: "Reviewer approved",
  review_rejected: "Reviewer rejected",
  review_corrected: "Reviewer corrected value",
};

export default function AuditPage() {
  const { rawObservationId } = useParams();
  const dispatch = useDispatch();
  const { data, status, error } = useSelector((s) => s.audit);

  useEffect(() => {
    dispatch(fetchAuditTrail(rawObservationId));
    return () => dispatch(clearAudit());
  }, [dispatch, rawObservationId]);

  if (status === "loading" || status === "idle") {
    return <div className="page"><p className="muted">Loading audit trail...</p></div>;
  }
  if (status === "failed") {
    return <div className="page"><p className="error-text">Failed to load: {error}</p></div>;
  }
  if (!data) return null;

  const { rawObservation, auditTrail } = data;

  return (
    <div className="page">
      <p><Link to="/quarantine" className="link-small">Back to quarantine queue</Link></p>
      <h1 className="page-title">Audit Trail</h1>

      <div className="card">
        <h2 className="card-title">Original Observation (never mutated)</h2>
        <div className="detail-grid">
          <div><span className="detail-label">Entity</span><div>{rawObservation.entityId}</div></div>
          <div><span className="detail-label">Timestamp</span><div>{new Date(rawObservation.timestamp).toLocaleString()}</div></div>
          <div><span className="detail-label">Original Value</span><div>{rawObservation.values?.value}</div></div>
          <div><span className="detail-label">Source</span><div>{rawObservation.sourceId} ({rawObservation.sourceType})</div></div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Decision & Review Lineage</h2>
        <div className="timeline">
          {auditTrail.map((entry) => (
            <div key={entry._id} className="timeline-entry">
              <div className="timeline-marker" />
              <div className="timeline-content">
                <div className="timeline-header">
                  <strong>{ACTION_LABELS[entry.action] || entry.action}</strong>
                  <span className="muted"> — {new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <div className="muted">actor: {entry.actor} · engine: {entry.engineVersion}</div>
                {entry.details && Object.keys(entry.details).length > 0 && (
                  <pre className="details-json">{JSON.stringify(entry.details, null, 2)}</pre>
                )}
              </div>
            </div>
          ))}
          {auditTrail.length === 0 && <p className="muted">No audit entries found.</p>}
        </div>
      </div>
    </div>
  );
}
