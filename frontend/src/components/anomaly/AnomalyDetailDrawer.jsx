import { useState, useEffect } from "react";
import { X, Wrench, ShieldCheck, Check, Trash2, Edit3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Badge from "../common/Badge";
import EvidenceCard from "./EvidenceCard";
import TelemetryChart from "../telemetry/TelemetryChart";
import {
  fetchQuarantineDetail,
  submitQuarantineReview,
  triggerCascadeHealing,
  diagnoseRepair,
} from "../../api/endpoints";

export default function AnomalyDetailDrawer({ incident, isOpen, onClose }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const incidentId = incident?.quarantineRecordId || incident?._id || incident?.rawObservationId;

  useEffect(() => {
    if (!isOpen || !incident) {
      setDetail(null);
      setFeedback(null);
      return;
    }

    async function load() {
      setFeedback(null);
      try {
        const data = await fetchQuarantineDetail(incidentId);
        setDetail(data);
      } catch {
        // If not found in quarantine, use incident props
        setDetail({
          rawObservation: {
            entityId: incident.entityId,
            timestamp: incident.timestamp,
            values: { value: incident.value },
          },
          validationResult: {
            ruleRiskScore: incident.ruleRiskScore ?? incident.semanticRiskScore,
            classification: incident.classification,
            evidence: [
              {
                source: "rateOfChangeRule",
                triggered: incident.classification !== "valid",
                severity: incident.ruleRiskScore || 0.8,
                message: "Observed telemetry value departs from recent trend.",
              },
            ],
            features: { observedValue: incident.value, riskScore: incident.ruleRiskScore },
          },
          recentHistory: [
            { timestamp: incident.timestamp, values: { value: incident.value }, classification: incident.classification },
          ],
        });
      }
    }

    load();
  }, [isOpen, incident, incidentId]);

  if (!isOpen || !incident) return null;

  const raw = detail?.rawObservation || {};
  const validation = detail?.validationResult || {};
  const history = detail?.recentHistory || [];
  const qRecord = detail?.quarantineRecord || incident;

  async function handleAutoHeal() {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await triggerCascadeHealing({
        quarantineRecordId: qRecord._id,
        reviewer: "lead-data-engineer",
      });
      if (res.success && res.results?.[0]?.success) {
        setFeedback({
          type: "success",
          msg: `Observation verified & healed in sandbox! Healed value: ${res.results[0].healedValue} (Final risk: ${res.results[0].finalRiskScore} < 0.30)`,
        });
      } else {
        setFeedback({ type: "error", msg: res.message || "Cascade healing failed to lower risk below 0.30." });
      }
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.error || err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDiagnose() {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await diagnoseRepair({
        quarantineRecordId: qRecord._id,
        reviewer: "lead-data-engineer",
        mode: "DATA_REPAIR",
      });
      setFeedback({
        type: "success",
        msg: "Repair proposal generated. Redirecting to Repair Center...",
      });
      setTimeout(() => {
        onClose();
        navigate(`/repairs/${res.proposal._id}`);
      }, 1200);
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.error || err.message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReview(action) {
    setActionLoading(true);
    setFeedback(null);
    try {
      await submitQuarantineReview({
        id: qRecord._id,
        action,
        correctedValues: action === "correct" ? { value: parseFloat(correctedValue) } : undefined,
        reviewer: "lead-data-engineer",
        notes: `Review action: ${action.toUpperCase()}`,
      });
      setFeedback({
        type: "success",
        msg: `Observation marked as ${action.toUpperCase()}.`,
      });
      setShowCorrectModal(false);
    } catch (err) {
      setFeedback({ type: "error", msg: err.response?.data?.error || err.message });
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label="Investigation Drawer">
        {/* Drawer Header */}
        <div className="drawer-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                Incident Investigation
              </h3>
              <Badge tone={incident.classification}>{incident.classification}</Badge>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
              Entity: {incident.entityId}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close investigation drawer"
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="drawer-body">
          {feedback && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                marginBottom: "12px",
                fontSize: "12px",
                backgroundColor: feedback.type === "success" ? "var(--accent-verified-bg)" : "var(--accent-error-bg)",
                color: feedback.type === "success" ? "var(--accent-verified)" : "var(--accent-error)",
                border: `1px solid ${feedback.type === "success" ? "var(--accent-verified)" : "var(--accent-error)"}`,
              }}
            >
              {feedback.msg}
            </div>
          )}

          {/* Metric Overview Strip */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            <div style={{ padding: "10px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Observed Reading</div>
              <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "2px" }}>
                {incident.value !== undefined ? incident.value : "-"} {raw.units?.value || "°C"}
              </div>
            </div>
            <div style={{ padding: "10px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Rule Risk Score</div>
              <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-error)", marginTop: "2px" }}>
                {validation.ruleRiskScore !== null && validation.ruleRiskScore !== undefined ? validation.ruleRiskScore.toFixed(2) : "-"}
              </div>
            </div>
          </div>

          {/* Surrounding Telemetry Chart */}
          <div style={{ marginBottom: "18px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
              Surrounding Observation History
            </div>
            <div style={{ backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", padding: "10px" }}>
              <TelemetryChart data={history} height={160} />
            </div>
          </div>

          {/* Explainable Semantic Evidence Cards */}
          <div style={{ marginBottom: "18px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
              Explainable Rule Evidence ({validation.evidence?.filter((e) => e.triggered).length || 0} Triggered)
            </div>
            {validation.evidence && validation.evidence.length > 0 ? (
              validation.evidence.map((ev, idx) => (
                <EvidenceCard key={idx} {...ev} />
              ))
            ) : (
              <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No rule evidence available.</p>
            )}
          </div>

          {/* Engineered Feature Vector Snapshot */}
          <div style={{ marginBottom: "18px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
              Semantic Feature Vector Snapshot
            </div>
            <pre className="diff-container" style={{ maxHeight: "140px" }}>
              {JSON.stringify(validation.features || {}, null, 2)}
            </pre>
          </div>
        </div>

        {/* Drawer Action Toolbar */}
        <div className="drawer-footer">
          <button
            onClick={handleAutoHeal}
            disabled={actionLoading}
            className="btn btn-primary btn-sm"
            title="Automatically compute candidate repairs in isolated sandbox"
          >
            <ShieldCheck size={13} />
            <span>Sandbox Cascade Heal</span>
          </button>

          <button
            onClick={handleDiagnose}
            disabled={actionLoading}
            className="btn btn-secondary btn-sm"
            title="Create formal proposal in Repair Center"
          >
            <Wrench size={13} />
            <span>Diagnose & Propose Repair</span>
          </button>

          <button
            onClick={() => handleReview("approve")}
            disabled={actionLoading}
            className="btn btn-secondary btn-sm"
            title="Confirm observation is acceptable despite anomaly flag"
          >
            <Check size={13} />
            <span>Approve</span>
          </button>

          <button
            onClick={() => handleReview("reject")}
            disabled={actionLoading}
            className="btn btn-secondary btn-sm"
            title="Reject observation"
          >
            <Trash2 size={13} />
            <span>Reject</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
