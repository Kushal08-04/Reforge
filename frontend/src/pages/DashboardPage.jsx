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

  const { totalIngested, classificationCounts, pendingReviewCount, perEntity, recentEvents } = data;

  const chartData = [
    { name: "Valid", count: classificationCounts.valid || 0 },
    { name: "Suspicious", count: classificationCounts.suspicious || 0 },
    { name: "Invalid", count: classificationCounts.invalid || 0 },
  ];

  return (
    <div className="page">
      <h1 className="page-title">Pipeline Overview</h1>
      <p className="muted">Live health of the REFORGE semantic validation pipeline.</p>

      <div className="stat-grid">
        <StatCard label="Total Ingested" value={totalIngested} />
        <StatCard label="Valid" value={classificationCounts.valid || 0} tone="valid" />
        <StatCard label="Suspicious" value={classificationCounts.suspicious || 0} tone="suspicious" />
        <StatCard label="Invalid" value={classificationCounts.invalid || 0} tone="invalid" />
        <StatCard label="Pending Review" value={pendingReviewCount} tone="pending" />
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
              <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

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
                <td>{e.avgRiskScore !== null ? e.avgRiskScore.toFixed(2) : "—"}</td>
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
              <th>Classification</th>
              <th>Risk Score</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recentEvents.map((e) => (
              <tr key={e.validationResultId}>
                <td>{e.entityId}</td>
                <td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}</td>
                <td>{e.value}</td>
                <td><ClassificationBadge classification={e.classification} /></td>
                <td>{e.semanticRiskScore !== null ? e.semanticRiskScore.toFixed(2) : "—"}</td>
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
