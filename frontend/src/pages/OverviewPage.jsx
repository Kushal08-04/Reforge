/**
 * OverviewPage.jsx - Premium redesigned dashboard overview
 * Four primary stat cards with colored top-accents and large metric values,
 * classification distribution chart, self-healing pulse, and live incident table.
 */

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";
import { fetchDashboard } from "../features/dashboard/dashboardSlice";
import Badge from "../components/common/Badge";
import DataFreshnessBar from "../components/common/DataFreshnessBar";
import AnomalyDetailDrawer from "../components/anomaly/AnomalyDetailDrawer";
import { switchDataMode } from "../features/ui/uiSlice";
import {
  ShieldCheck, ServerCrash, ArrowRight, Activity,
  AlertTriangle, Wrench, TrendingUp, BarChart2,
} from "lucide-react";

function MetricCard({ label, value, sub, tone, icon: Icon, infoText }) {
  const toneClass = tone ? `stat-${tone}` : "";
  return (
    <div className={`stat-card ${toneClass}`}>
      <div className="stat-card-label">
        <span>{label}</span>
        {Icon && (
          <Icon
            size={14}
            style={{ opacity: 0.5 }}
            strokeWidth={1.75}
          />
        )}
      </div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
      {infoText && (
        <div style={{
          marginTop: "10px",
          paddingTop: "10px",
          borderTop: "1px solid var(--border-subtle)",
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
          lineHeight: 1.5,
        }}>
          {infoText}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{
      padding: "48px 24px",
      textAlign: "center",
      color: "var(--text-muted)",
      fontSize: "var(--text-sm)",
    }}>
      <Activity
        size={32}
        style={{ margin: "0 auto 12px", opacity: 0.3 }}
        strokeWidth={1.25}
      />
      <div>{message}</div>
    </div>
  );
}

function ClassificationBadge({ value }) {
  const toneMap = { valid: "valid", suspicious: "suspicious", invalid: "invalid" };
  return (
    <Badge tone={toneMap[value] || "neutral"}>
      {value}
    </Badge>
  );
}

export default function OverviewPage() {
  const dispatch = useDispatch();
  const { data, status, error } = useSelector((s) => s.dashboard);
  const { theme, dataMode } = useSelector((s) => s.ui);
  const [selectedIncident, setSelectedIncident] = useState(null);

  useEffect(() => {
    dispatch(fetchDashboard());
  }, [dispatch, dataMode]);

  function handleRefresh(options) {
    dispatch(fetchDashboard(options));
  }

  const isDark = theme === "dark";

  // ── Connection failure ────────────────────────────────────────────────
  if (status === "failed" && !data) {
    return (
      <div style={{ padding: "48px 0", maxWidth: "560px", margin: "0 auto" }}>
        <div className="card" style={{
          padding: "40px",
          textAlign: "center",
          borderColor: "var(--accent-error-mid)",
          background: "var(--accent-error-dim)",
        }}>
          <ServerCrash
            size={40}
            style={{ color: "var(--accent-error)", margin: "0 auto 16px" }}
            strokeWidth={1.5}
          />
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700, marginBottom: "12px" }}>
            Backend Unreachable
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "24px" }}>
            Could not connect to the REFORGE server at{" "}
            <code style={{ color: "var(--accent-telemetry)" }}>http://localhost:5000/api</code>.
            Start the Express backend and MongoDB, then retry.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
            <button onClick={() => handleRefresh({ silent: false })} className="btn btn-primary">
              Retry Connection
            </button>
            <button onClick={() => dispatch(switchDataMode("demo"))} className="btn btn-secondary">
              Switch to Demo Mode
            </button>
          </div>
          {error && (
            <div style={{
              marginTop: "20px",
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              background: "var(--bg-secondary)",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              textAlign: "left",
            }}>
              {String(error)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (status === "loading" && !data) {
    return (
      <div style={{ padding: "64px 0", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: 40, height: 40,
            border: "3px solid var(--border-color)",
            borderTopColor: "var(--accent-telemetry)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
            Loading pipeline health from{" "}
            {dataMode === "demo" ? "demo scenarios" : "live backend"}…
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    totalIngested = 0,
    classificationCounts = {},
    pendingReviewCount = 0,
    agreementStats = {},
    systemStatus = {},
    recentEvents = [],
    recentRepairs = [],
  } = data;

  const validCount = classificationCounts.valid || 0;
  const suspiciousCount = classificationCounts.suspicious || 0;
  const invalidCount = classificationCounts.invalid || 0;
  const verifiedCount = (recentRepairs || []).filter(
    (r) => r.lifecycleState === "VERIFIED" || r.lifecycleState === "APPROVED"
  ).length;

  const agreementPct =
    agreementStats.agreementRate !== undefined
      ? `${(agreementStats.agreementRate * 100).toFixed(1)}%`
      : "-";

  const validPct = totalIngested > 0
    ? ((validCount / totalIngested) * 100).toFixed(1)
    : "100";

  const chartData = [
    { name: "Valid", count: validCount, fill: isDark ? "#36C878" : "#16A34A" },
    { name: "Suspicious", count: suspiciousCount, fill: isDark ? "#FF9F43" : "#D97706" },
    { name: "Invalid", count: invalidCount, fill: isDark ? "#FF5D5D" : "#DC2626" },
  ];

  return (
    <div className="page">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Activity size={20} strokeWidth={1.75} style={{ color: "var(--accent-telemetry)" }} />
            Pipeline Overview
          </h1>
          <p className="page-description">
            Real-time health of the REFORGE validation, anomaly detection, and self-healing pipeline.
          </p>
        </div>
        <DataFreshnessBar onRefresh={handleRefresh} loading={status === "loading"} />
      </div>

      {/* ── System Status Strip ───────────────────────────────────────── */}
      <div className="system-status-strip">
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--accent-verified)",
            animation: "pulse-dot 2s ease-in-out infinite",
          }} />
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {systemStatus.engineVersion || "v0.2.0-hybrid"}
          </span>
        </div>
        <span className="status-sep">·</span>
        <span>Active Model:</span>
        <Badge tone="telemetry">{systemStatus.activeModel || "isolation_forest:v1.2.0"}</Badge>
        <span className="status-sep">·</span>
        <span>Decision Mode:</span>
        <Badge tone={systemStatus.validationMode === "hybrid" ? "valid" : "neutral"}>
          {(systemStatus.validationMode || "shadow").toUpperCase()}
        </Badge>
        <span className="status-sep">·</span>
        <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>
          Risk thresholds: suspicious ≥ 0.30 · invalid ≥ 0.60
        </span>
      </div>

      {/* ── Primary Metric Cards ──────────────────────────────────────── */}
      <div className="stat-grid">
        <MetricCard
          label="Valid Observations"
          value={validCount.toLocaleString()}
          sub={`${validPct}% passed all checks`}
          tone="valid"
          icon={ShieldCheck}
          infoText="Passed schema + all 4 semantic rules"
        />
        <MetricCard
          label="Active Quarantine"
          value={pendingReviewCount.toLocaleString()}
          sub={`${suspiciousCount + invalidCount} total anomalies`}
          tone={pendingReviewCount > 0 ? "suspicious" : "neutral"}
          icon={AlertTriangle}
          infoText="Pending human review or cascade healing"
        />
        <MetricCard
          label="Verified Recoveries"
          value={verifiedCount.toLocaleString()}
          sub="Risk score < 0.30 confirmed"
          tone="valid"
          icon={Wrench}
          infoText="Repairs with post-repair risk < 0.30"
        />
        <MetricCard
          label="Rule / ML Consensus"
          value={agreementPct}
          sub={`${agreementStats.disagreementCount || 0} disagreements flagged`}
          tone="telemetry"
          icon={TrendingUp}
          infoText="Agreement rate between rule engine and ML model"
        />
      </div>

      {/* ── Middle Row ────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        gap: "16px",
        marginBottom: "16px",
      }}>
        {/* Classification Chart */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <div className="card-title">
                <BarChart2 size={16} style={{ color: "var(--accent-telemetry)" }} />
                Classification Distribution
              </div>
              <div className="card-subtitle">Validated vs quarantined volume</div>
            </div>
            <Link
              to="/analytics"
              style={{ fontSize: "var(--text-xs)", color: "var(--accent-telemetry)", textDecoration: "none", fontWeight: 600, flexShrink: 0 }}
            >
              Analytics →
            </Link>
          </div>

          {totalIngested === 0 ? (
            <EmptyState message="No observations ingested yet. Use Inject Dataset to stream test telemetry." />
          ) : (
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 6"
                    stroke={isDark ? "#1E1E1E" : "#EBEBEB"}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    stroke={isDark ? "#444" : "#BBB"}
                    tick={{ fontSize: 11, fontFamily: "var(--font-mono)", fill: isDark ? "#666" : "#999" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke={isDark ? "#444" : "#BBB"}
                    tick={{ fontSize: 12, fontFamily: "var(--font-sans)", fontWeight: 600, fill: isDark ? "#A0A0A0" : "#666" }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}
                    contentStyle={{
                      backgroundColor: isDark ? "#181818" : "#FFF",
                      borderColor: isDark ? "#2A2A2A" : "#E2E2E6",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)",
                      color: isDark ? "#F0F0F0" : "#111",
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Self-Healing Pulse */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div>
              <div className="card-title">
                <ShieldCheck size={16} style={{ color: "var(--accent-verified)" }} />
                Self-Healing Pulse
              </div>
              <div className="card-subtitle">Sandbox diagnosis & post-repair verification</div>
            </div>
            <Link
              to="/repairs"
              style={{ fontSize: "var(--text-xs)", color: "var(--accent-telemetry)", textDecoration: "none", fontWeight: 600, flexShrink: 0 }}
            >
              Repair Center →
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              {
                label: "Verified Recoveries",
                value: <Badge tone="valid">{verifiedCount} verified (&lt;0.30 risk)</Badge>,
              },
              {
                label: "Pending Quarantine Decisions",
                value: <Badge tone={pendingReviewCount > 0 ? "suspicious" : "neutral"}>{pendingReviewCount} awaiting review</Badge>,
              },
              {
                label: "ML Inference Health",
                value: (
                  <Badge tone={agreementStats.mlFailuresCount ? "invalid" : "valid"}>
                    {agreementStats.mlFailuresCount === 0
                      ? "Zero inference failures"
                      : `${agreementStats.mlFailuresCount} failures`}
                  </Badge>
                ),
              },
              {
                label: "Total Ingested",
                value: (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)" }}>
                    {totalIngested.toLocaleString()}
                  </span>
                ),
              },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-sm)",
                gap: "12px",
              }}>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.3 }}>{label}</span>
                {value}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Incidents Table ────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Recent Validation Events</div>
            <div className="card-subtitle">Latest 15 observations evaluated through the REFORGE pipeline</div>
          </div>
          <Link
            to="/anomalies"
            style={{ fontSize: "var(--text-xs)", color: "var(--accent-telemetry)", textDecoration: "none", fontWeight: 600, flexShrink: 0 }}
          >
            Anomaly Explorer →
          </Link>
        </div>

        <div className="table-container">
          <table className="table" aria-label="Recent validation events">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Entity ID</th>
                <th>Value</th>
                <th>Rule Risk</th>
                <th>ML Score</th>
                <th>Classification</th>
                <th>Consensus</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState message='No recent events. Use "Inject Dataset" to stream test telemetry into REFORGE.' />
                  </td>
                </tr>
              ) : (
                recentEvents.slice(0, 15).map((e) => {
                  const rowClass =
                    e.classification === "invalid" ? "table-row-invalid"
                      : e.classification === "suspicious" ? "table-row-suspicious"
                        : e.classification === "valid" ? "table-row-valid"
                          : "";
                  return (
                    <tr key={e.validationResultId || e._id} className={rowClass}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "-"}
                      </td>
                      <td>
                        <code style={{ color: "var(--text-primary)", fontSize: "var(--text-xs)" }}>
                          {e.entityId}
                        </code>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "var(--text-sm)" }}>
                        {e.value !== undefined ? e.value : "-"}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
                        {e.ruleRiskScore != null
                          ? e.ruleRiskScore.toFixed(2)
                          : (e.semanticRiskScore?.toFixed(2) ?? "-")}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
                        {e.mlAnomalyScore != null ? e.mlAnomalyScore.toFixed(2) : "0.00"}
                      </td>
                      <td>
                        <ClassificationBadge value={e.classification} />
                      </td>
                      <td style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                        {e.comparisonCategory && e.comparisonCategory !== "not_applicable"
                          ? e.comparisonCategory.replace(/_/g, " ")
                          : "-"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          onClick={() => setSelectedIncident(e)}
                          className="btn btn-secondary btn-xs"
                          title="Open Quick-Investigation Drawer"
                        >
                          Inspect <ArrowRight size={10} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Investigation Drawer ──────────────────────────────────────── */}
      <AnomalyDetailDrawer
        incident={selectedIncident}
        isOpen={Boolean(selectedIncident)}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
