import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { fetchQuarantineList } from "../features/quarantine/quarantineSlice";
import ClassificationBadge from "../components/ClassificationBadge";

const STATUS_OPTIONS = ["all", "pending", "approved", "rejected", "corrected"];

export default function QuarantinePage() {
  const dispatch = useDispatch();
  const { list, listStatus, listError } = useSelector((s) => s.quarantine);
  const [statusFilter, setStatusFilter] = useState("pending");

  useEffect(() => {
    const params = statusFilter === "all" ? {} : { status: statusFilter };
    dispatch(fetchQuarantineList(params));
  }, [dispatch, statusFilter]);

  return (
    <div className="page">
      <h1 className="page-title">Quarantine Queue</h1>
      <p className="muted">
        Records flagged as suspicious or invalid by the semantic engine, awaiting human review.
      </p>

      <div className="filter-row">
        <label htmlFor="status-filter" className="filter-label">Status:</label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="select"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {listStatus === "loading" && <p className="muted">Loading...</p>}
        {listStatus === "failed" && <p className="error-text">Failed to load: {listError}</p>}
        {listStatus === "succeeded" && list.length === 0 && (
          <p className="muted">No records match this filter.</p>
        )}

        {listStatus === "succeeded" && list.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Timestamp</th>
                <th>Classification</th>
                <th>Risk Score</th>
                <th>Review Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r._id}>
                  <td>{r.entityId}</td>
                  <td>{new Date(r.timestamp).toLocaleString()}</td>
                  <td><ClassificationBadge classification={r.classification} /></td>
                  <td>{r.semanticRiskScore !== null ? r.semanticRiskScore.toFixed(2) : "—"}</td>
                  <td><span className={`badge badge-review-${r.reviewStatus}`}>{r.reviewStatus}</span></td>
                  <td>
                    <Link to={`/quarantine/${r._id}`} className="link-small">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
