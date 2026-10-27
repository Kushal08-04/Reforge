import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchQuarantineList,
  cascadeHeal,
  clearHealResult,
} from "../features/quarantine/quarantineSlice";
import Badge from "../components/common/Badge";
import EvidenceCard from "../components/anomaly/EvidenceCard";
import TelemetryChart from "../components/telemetry/TelemetryChart";
import {
  fetchQuarantineDetail,
  submitQuarantineReview,
  diagnoseRepair,
} from "../api/endpoints";
import {
  AlertTriangle,
  ShieldCheck,
  Check,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AnomalyExplorerPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { list = [], listStatus, listError, healStatus, healResult, healError } = useSelector(
    (s) => s.quarantine
  );
  const { dataMode } = useSelector((s) => s.ui);

  const [selectedId, setSelectedId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");

  function refresh() {
    dispatch(fetchQuarantineList({ limit: 100 }));
  }

  useEffect(() => {
    refresh();
  }, [dispatch, dataMode]);

  // When list loads, auto-select first item if none selected
  useEffect(() => {
    if (list.length > 0 && !selectedId) {
      setSelectedId(list[0]._id);
    }
  }, [list, selectedId]);

  // Load detail whenever selectedId changes
  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    setFeedback(null);
    fetchQuarantineDetail(selectedId)
      .then((data) => setDetailData(data))
      .catch((err) => {
        setDetailData(null);
        setFeedback({ type: "error", msg: err.message });
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // Batch Healing Handler
  function handleBatchHeal(tier) {
    setFeedback(null);
    dispatch(cascadeHeal({ tier, reviewer: "lead-data-engineer" })).then((res) => {
      if (res.payload?.success) {
        setFeedback({
          type: "success",
          msg: `Cascade healing completed: ${res.payload.healedCount} observation(s) verified <0.30 risk in isolated sandbox.`,
        });
        refresh();
      }
    });
  }

  async function handleSingleReview(action) {
    if (!selectedId) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await submitQuarantineReview({
        id: selectedId,
        action,
        reviewer: "lead-data-engineer",
        notes: `Review action: ${action.toUpperCase()}`,
      });
      setFeedback({ type: "success", msg: `Observation marked as ${action.toUpperCase()}.` });
      refresh();
      // Reload current detail
      const updated = await fetchQuarantineDetail(selectedId);
      setDetailData(updated);
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.error || err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDiagnoseProposal() {
    if (!selectedId) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await diagnoseRepair({
        quarantineRecordId: selectedId,
        reviewer: "lead-data-engineer",
        mode: "DATA_REPAIR",
      });
      setFeedback({ type: "success", msg: "Diagnosis complete. Redirecting to Repair Operations..." });
      setTimeout(() => {
        navigate(`/repairs/${res.proposal._id}`);
      }, 1000);
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.error || err.message });
    } finally {
      setActionLoading(false);
    }
  }

  // Filter list records
  const filteredList = list.filter((r) => {
    if (statusFilter && statusFilter !== "all" && r.reviewStatus !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.entityId?.toLowerCase().includes(q) || r.classification?.toLowerCase().includes(q);
    }
    return true;
  });

  const raw = detailData?.rawObservation || {};
  const val = detailData?.validationResult || {};
  const history = detailData?.recentHistory || [];

  return (
    <div>
      {/* Top Action Bar: Filters & Batch Auto-Healing */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search entity or modality..."
                className="input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "30px", width: "200px" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Filter size={14} style={{ color: "var(--text-muted)" }} />
              <select
                className="select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Review States</option>
                <option value="pending">Pending Review</option>
                <option value="repaired">Sandbox Repaired</option>
                <option value="approved">Approved Normal</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Batch Cascade Healing Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => handleBatchHeal("low_risk")}
              disabled={healStatus === "loading"}
              className="btn btn-primary btn-sm"
              title="Iteratively heals observations with risk <= 0.60 until verified < 0.30"
            >
              <ShieldCheck size={13} />
              <span>Cascade Heal Low-Risk (&le;0.60)</span>
            </button>
            <button
              onClick={() => handleBatchHeal("all")}
              disabled={healStatus === "loading"}
              className="btn btn-secondary btn-sm"
              title="Runs sandbox repair cascade across all pending quarantined observations"
            >
              <span>Cascade Heal All Pending</span>
            </button>
            <button
              onClick={refresh}
              className="btn btn-secondary btn-sm"
              title="Refresh queue"
            >
              <RefreshCw size={13} className={listStatus === "loading" ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {feedback && (
          <div
            style={{
              marginTop: "10px",
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              backgroundColor: feedback.type === "success" ? "var(--accent-verified-bg)" : "var(--accent-error-bg)",
              color: feedback.type === "success" ? "var(--accent-verified)" : "var(--accent-error)",
              border: `1px solid ${feedback.type === "success" ? "var(--accent-verified)" : "var(--accent-error)"}`,
            }}
          >
            {feedback.msg}
          </div>
        )}
      </div>

      {/* Two-Column Master-Detail Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(420px, 1.4fr)", gap: "16px" }}>
        {/* Left Column: Quarantine Stream */}
        <div className="card" style={{ padding: "0", overflow: "hidden", display: "flex", flexDirection: "column", height: "calc(100vh - 190px)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 600 }}>
              Quarantined Observations ({filteredList.length})
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredList.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                No quarantined observations matching the selected filters.
              </div>
            ) : (
              filteredList.map((r) => {
                const isSelected = r._id === selectedId;
                return (
                  <div
                    key={r._id}
                    onClick={() => setSelectedId(r._id)}
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "var(--bg-secondary)" : "transparent",
                      borderLeft: isSelected ? "3px solid var(--accent-telemetry)" : "3px solid transparent",
                      transition: "var(--transition)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "12px", color: "var(--text-primary)" }}>
                        {r.entityId}
                      </span>
                      <Badge tone={r.reviewStatus === "repaired" ? "verified" : r.reviewStatus === "approved" ? "valid" : r.reviewStatus === "rejected" ? "invalid" : "suspicious"}>
                        {r.reviewStatus}
                      </Badge>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-muted)" }}>
                      <span>{r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "-"}</span>
                      <span>
                        Risk: <strong style={{ color: "var(--accent-error)", fontFamily: "var(--font-mono)" }}>
                          {r.ruleRiskScore !== null && r.ruleRiskScore !== undefined ? r.ruleRiskScore.toFixed(2) : (r.semanticRiskScore?.toFixed(2) ?? "-")}
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Deep Investigation & Evidence Panel */}
        <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", height: "calc(100vh - 190px)", overflowY: "auto" }}>
          {!selectedId || !detailData ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              Select an observation from the queue to inspect its explainable evidence.
            </div>
          ) : (
            <div>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--border-color)" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {raw.entityId}
                    </h3>
                    <Badge tone={detailData.quarantineRecord?.classification}>
                      {detailData.quarantineRecord?.classification}
                    </Badge>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                    Observation ID: {raw._id} • Recorded: {raw.timestamp ? new Date(raw.timestamp).toLocaleString() : "-"}
                  </div>
                </div>

                {/* Remediation Action Toolbar */}
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={handleDiagnoseProposal}
                    disabled={actionLoading}
                    className="btn btn-primary btn-sm"
                    title="Generate formal repair proposal in Repair Center"
                  >
                    <span>Diagnose Repair</span>
                  </button>
                  <button
                    onClick={() => handleSingleReview("approve")}
                    disabled={actionLoading}
                    className="btn btn-secondary btn-sm"
                    title="Confirm observation is acceptable"
                  >
                    <Check size={12} />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => handleSingleReview("reject")}
                    disabled={actionLoading}
                    className="btn btn-secondary btn-sm"
                    title="Confirm observation is corrupted"
                  >
                    <Trash2 size={12} />
                    <span>Reject</span>
                  </button>
                </div>
              </div>

              {/* Observed Value & Risk Score Card */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
                <div style={{ padding: "10px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>OBSERVED VALUE</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "2px" }}>
                    {raw.values?.value !== undefined ? raw.values?.value : "-"} {raw.units?.value || "°C"}
                  </div>
                </div>
                <div style={{ padding: "10px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>RULE RISK SCORE</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-error)", marginTop: "2px" }}>
                    {val.ruleRiskScore !== null && val.ruleRiskScore !== undefined ? val.ruleRiskScore.toFixed(2) : "-"}
                  </div>
                </div>
                <div style={{ padding: "10px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>ML ANOMALY SCORE</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-anomaly)", marginTop: "2px" }}>
                    {val.mlResult?.anomalyScore !== undefined ? val.mlResult.anomalyScore.toFixed(2) : "0.00"}
                  </div>
                </div>
              </div>

              {/* Surrounding Telemetry Chart */}
              <div style={{ marginBottom: "16px" }}>
                <h4 style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                  Observation Sequence (Preceding 10 Readings)
                </h4>
                <div style={{ backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", padding: "10px" }}>
                  <TelemetryChart data={history} height={150} />
                </div>
              </div>

              {/* Explainable Semantic Rules Breakdown */}
              <div style={{ marginBottom: "16px" }}>
                <h4 style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                  Deterministic Rule Evidence Breakdown
                </h4>
                {val.evidence && val.evidence.length > 0 ? (
                  val.evidence.map((ev, idx) => <EvidenceCard key={idx} {...ev} />)
                ) : (
                  <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No evidence rules recorded.</p>
                )}
              </div>

              {/* Feature Vector Snapshot */}
              <div>
                <h4 style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                  Engineered Feature Snapshot (featureBuilder.js)
                </h4>
                <pre className="diff-container" style={{ maxHeight: "150px" }}>
                  {JSON.stringify(val.features || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
