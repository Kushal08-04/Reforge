import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { fetchDashboard } from "../features/dashboard/dashboardSlice";
import StatCard from "../components/StatCard";
import ClassificationBadge from "../components/ClassificationBadge";
import { Link } from "react-router-dom";

export default function DashboardPage() {
  const dispatch = useDispatch();
  const { data, status, error } = useSelector((s) => s.dashboard);

  useEffect(() => {
    dispatch(fetchDashboard());
  }, [dispatch]);

  if (status === "loading" && !data) {
    return <div className="page"><p className="muted">Loading pipeline health...</p></div>;
  }

  if (status === "failed") {
    return (
      <div className="page">
        <p className="error-text">Failed to load dashboard: {error}</p>
        <p className="muted">Is the backend running and reachable at VITE_API_BASE_URL?</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    totalIngested,
    classificationCounts = {},
    pendingReviewCount = 0,
    agreementStats = {},
    systemStatus = {},
    perEntity = [],
    recentEvents = [],
    recentRepairs = [],
  } = data;

  const chartData = [
    { name: "Valid", count: classificationCounts.valid || 0 },
    { name: "Suspicious", count: classificationCounts.suspicious || 0 },
    { name: "Invalid", count: classificationCounts.invalid || 0 },
  ];

  const agreementPct =
    agreementStats.agreementRate !== undefined
      ? `${(agreementStats.agreementRate * 100).toFixed(1)}%`
      : "100%";

  return (
    <div className="page">
      <div className="system-banner">
        <div className="system-banner-group">
          <span><strong>Engine Version:</strong> {systemStatus.engineVersion || "v0.2.0-hybrid"}</span>
          <span><strong>Active ML Model:</strong> <span className="badge badge-info">{systemStatus.activeModel || "isolation_forest:v1.0.0"}</span></span>
          <span><strong>Decision Mode:</strong> <span className={`badge ${systemStatus.validationMode === "hybrid" ? "badge-success" : "badge-neutral"}`}>{systemStatus.validationMode || "shadow"}</span></span>
        </div>
        <div>
          <Link to="/comparison" className="link-small">View Rule vs ML Comparison &rarr;</Link>
        </div>
      </div>

      <h1 className="page-title">Pipeline Overview</h1>
      <p className="muted">Live operational health of the REFORGE hybrid validation engine.</p>

      <div className="stat-grid">
        <StatCard label="Total Ingested" value={totalIngested} />
        <StatCard label="Valid" value={classificationCounts.valid || 0} tone="valid" />
        <StatCard label="Suspicious" value={classificationCounts.suspicious || 0} tone="suspicious" />
        <StatCard label="Invalid" value={classificationCounts.invalid || 0} tone="invalid" />
        <StatCard label="Pending Review" value={pendingReviewCount} tone="pending" />
        <StatCard label="Rule/ML Agreement" value={agreementPct} tone="valid" />
        <StatCard label="Disagreements" value={agreementStats.disagreementCount || 0} tone={agreementStats.disagreementCount ? "suspicious" : "neutral"} />
        <StatCard label="ML Failures" value={agreementStats.mlFailuresCount || 0} tone={agreementStats.mlFailuresCount ? "invalid" : "neutral"} />
      </div>

      <div className="card">
        <h2 className="card-title">Classification Breakdown</h2>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" />
              <YAxis stroke="#6b7280" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {recentRepairs && recentRepairs.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="card-title">Recent Automated Repairs</h2>
            <Link to="/repairs" className="link-small">Open Repair Center &rarr;</Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Failure Category</th>
                <th>Patch Type</th>
                <th>Status</th>
                <th>Sandbox</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentRepairs.map((r) => (
                <tr key={r._id}>
                  <td>{r.entityId}</td>
                  <td><code>{r.failureCategory}</code></td>
                  <td>{r.proposedPatch?.patchType}</td>
                  <td>
                    <span className={`badge ${r.lifecycleState === "VERIFIED" || r.lifecycleState === "APPROVED"
                        ? "badge-success"
                        : r.lifecycleState === "SANDBOX_FAILED" || r.lifecycleState === "REJECTED"
                          ? "badge-danger"
                          : "badge-info"
                      }`}>
                      {r.lifecycleState}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${r.sandboxResult?.status === "PASS" ? "badge-success" : "badge-neutral"}`}>
                      {r.sandboxResult?.status || "NOT_RUN"}
                    </span>
                  </td>
                  <td>
                    <Link to={`/repairs/${r._id}`} className="link-small">inspect</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Per-Entity Health</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Total</th>
              <th>Valid</th>
              <th>Suspicious</th>
              <th>Invalid</th>
              <th>Avg Risk Score</th>
            </tr>
          </thead>
          <tbody>
            {perEntity.map((e) => (
              <tr key={e._id}>
                <td>{e._id}</td>
                <td>{e.total}</td>
                <td>{e.valid}</td>
                <td>{e.suspicious}</td>
                <td>{e.invalid}</td>
                <td>{e.avgRiskScore !== null && e.avgRiskScore !== undefined ? e.avgRiskScore.toFixed(2) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="card-title">Recent Validation Events</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Timestamp</th>
              <th>Value</th>
              <th>Rule Risk</th>
              <th>ML Anomaly</th>
              <th>Classification</th>
              <th>Category</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recentEvents.map((e) => (
              <tr key={e.validationResultId}>
                <td>{e.entityId}</td>
                <td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : "-"}</td>
                <td>{e.value}</td>
                <td>{e.semanticRiskScore !== null && e.semanticRiskScore !== undefined ? e.semanticRiskScore.toFixed(2) : "-"}</td>
                <td>{e.mlAnomalyScore !== null && e.mlAnomalyScore !== undefined ? e.mlAnomalyScore.toFixed(2) : "0.00"}</td>
                <td><ClassificationBadge classification={e.classification} /></td>
                <td>
                  {e.comparisonCategory && e.comparisonCategory !== "not_applicable" ? (
                    <span className={e.comparisonCategory.includes("anomaly") && e.comparisonCategory.includes("normal") ? "pill-disagree" : "pill-agree"}>
                      {e.comparisonCategory.replace(/_/g, " ")}
                    </span>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td>
                  {e.rawObservationId && (
                    <Link to={`/audit/${e.rawObservationId}`} className="link-small">audit</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
