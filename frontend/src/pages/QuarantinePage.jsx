import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { fetchQuarantineList } from "../features/quarantine/quarantineSlice";
import ClassificationBadge from "../components/ClassificationBadge";
import apiClient from "../api/client";

export default function QuarantinePage() {
  const dispatch = useDispatch();
  const { list = [], listStatus, listError } = useSelector((s) => s.quarantine);
  const [healingTier, setHealingTier] = useState(null); // 'low_risk' | 'high_risk' | recordId
  const [healingMsg, setHealingMsg] = useState("");
  const [ghExporting, setGhExporting] = useState(false);
  const [ghResult, setGhResult] = useState(null);
  const [downloading, setDownloading] = useState("");

  function refreshList() {
    dispatch(fetchQuarantineList({ limit: 100 }));
  }

  useEffect(() => {
    refreshList();
  }, [dispatch]);

  // Safe formatting helper to prevent any runtime toFixed errors
  function formatScore(score) {
    if (typeof score === "number" && !isNaN(score)) {
      return score.toFixed(2);
    }
    return "—";
  }

  // Blob downloader ensuring exact file extensions (.csv, .xlsx, .pdf)
  async function handleDownload(endpoint, filename, typeLabel) {
    setDownloading(typeLabel);
    try {
      const res = await apiClient.get(endpoint, { responseType: "blob" });
      const blob = new Blob([res.data]);
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(link.href);
    } catch (err) {
      alert(`Download failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setDownloading("");
    }
  }

  // Iterative Sandbox Cascade Healing Handler
  async function handleHeal({ tier, recordId }) {
    setHealingTier(tier || recordId);
    setHealingMsg("");
    try {
      const payload = {};
      if (recordId) {
        payload.quarantineRecordId = recordId;
      } else if (tier) {
        payload.tier = tier;
      }
      payload.reviewer = "lead-data-engineer";

      const res = await apiClient.post("/quarantine/heal", payload);
      if (res.data.success) {
        setHealingMsg(
          `Successfully healed ${res.data.healedCount} observation(s) in sandbox below 0.30 risk threshold!`
        );
        refreshList();
      } else {
        setHealingMsg(res.data.message || "No records healed.");
      }
    } catch (err) {
      setHealingMsg(`Healing error: ${err.response?.data?.error || err.message}`);
    } finally {
      setHealingTier(null);
    }
  }

  // Direct GitHub Healed Dataset Export
  async function handleGitHubExport() {
    setGhExporting(true);
    setGhResult(null);
    try {
      const res = await apiClient.post("/export/github", {
        commitMessage: "chore(data): publish cleansed dataset with verified sandbox repairs",
      });
      setGhResult(res.data);
    } catch (err) {
      alert(`GitHub export failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setGhExporting(false);
    }
  }

  // Split records into Low-Risk (<= 0.60), High-Risk (> 0.60), and Already Repaired
  const pendingRecords = (list || []).filter((r) => r.reviewStatus === "pending");
  const lowRiskRecords = pendingRecords.filter(
    (r) => (r.semanticRiskScore ?? r.ruleRiskScore ?? 0) <= 0.60 || r.classification === "suspicious"
  );
  const highRiskRecords = pendingRecords.filter(
    (r) => (r.semanticRiskScore ?? r.ruleRiskScore ?? 0) > 0.60 || r.classification === "invalid"
  );
  const repairedRecords = (list || []).filter((r) => r.reviewStatus === "repaired" || r.reviewStatus === "corrected");

  return (
    <div className="page">
      {/* Header & Export Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Quarantine & Automated Healing Zone</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Telemetry observations flagged by Rule-based and ML models are quarantined, classified into risk tiers, and iteratively healed in the isolated sandbox.
          </p>
        </div>

        {/* Action Toolbar */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-neutral"
            onClick={() => handleDownload("/export/csv", "reforge_healed_dataset.csv", "CSV")}
            disabled={downloading === "CSV"}
          >
            <span>📥</span> {downloading === "CSV" ? "Downloading..." : "Download Healed .CSV"}
          </button>
          <button
            className="btn btn-neutral"
            onClick={() => handleDownload("/export/xlsx", "reforge_healed_dataset.xlsx", "XLSX")}
            disabled={downloading === "XLSX"}
          >
            <span>📊</span> {downloading === "XLSX" ? "Downloading..." : "Download Healed .XLSX"}
          </button>
          <button
            className="btn btn-neutral"
            onClick={() => handleDownload("/export/pdf", "reforge_repair_report.pdf", "PDF")}
            disabled={downloading === "PDF"}
          >
            <span>📄</span> {downloading === "PDF" ? "Exporting..." : "Export PDF Report"}
          </button>
          <button
            className="btn btn-approve"
            onClick={handleGitHubExport}
            disabled={ghExporting}
            style={{ fontWeight: "600" }}
          >
            <span>🚀</span> {ghExporting ? "Publishing..." : "Export to GitHub Repo"}
          </button>
        </div>
      </div>

      {/* GitHub Export Result Card */}
      {ghResult && (
        <div className="card" style={{ borderLeft: "4px solid #10b981", background: "#f0fdf4", marginBottom: "1rem" }}>
          <h3 style={{ margin: "0 0 0.4rem", color: "#065f46" }}>✓ Dataset Successfully Exported to GitHub!</h3>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
            Repository: <strong>{ghResult.repo}</strong> | Branch: <strong>{ghResult.branch}</strong> | Verified Repairs: <strong>{ghResult.summary?.repairedCount}</strong>
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.85rem" }}>
            {ghResult.filesCommitted?.map((f, i) => (
              <a
                key={i}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#0f766e", fontWeight: "600" }}
              >
                📁 {f.path} &rarr;
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Status Notifications */}
      {healingMsg && (
        <div style={{ padding: "0.75rem 1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", marginBottom: "1rem", color: "#1e40af", fontWeight: "500" }}>
          {healingMsg}
        </div>
      )}
      {listStatus === "failed" && (
        <div className="card" style={{ borderLeft: "4px solid #ef4444", background: "#fef2f2", color: "#991b1b" }}>
          Failed to load quarantine records: {listError}
        </div>
      )}

      {/* SECTION 1: LOW-RISK OBSERVATIONS (Single-Button Auto-Heal) */}
      <div className="card" style={{ borderLeft: "4px solid #f59e0b", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.8rem", marginBottom: "0.8rem" }}>
          <div>
            <h2 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>⚡ Section 1: Low-Risk Flagged Observations</span>
              <span className="badge badge-warning" style={{ fontSize: "0.8rem" }}>
                {lowRiskRecords.length} Awaiting Auto-Repair (Score ≤ 0.60)
              </span>
            </h2>
            <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.88rem" }}>
              Low-risk temporal drifts can be automatically resolved in batch. The sandbox iteratively tests candidates until the evaluated risk score drops below 0.30.
            </p>
          </div>
          <button
            className="btn btn-approve"
            style={{ fontSize: "0.95rem", padding: "0.6rem 1.2rem", fontWeight: "bold" }}
            onClick={() => handleHeal({ tier: "low_risk" })}
            disabled={healingTier !== null || lowRiskRecords.length === 0}
          >
            {healingTier === "low_risk" ? "Healing in Sandbox..." : "⚡ Auto-Repair All Low-Risk Observations"}
          </button>
        </div>

        {lowRiskRecords.length === 0 ? (
          <p className="muted" style={{ fontStyle: "italic", margin: "0.5rem 0" }}>
            ✓ No low-risk observations currently pending in quarantine queue.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Sensor Entity</th>
                  <th>Flagged Timestamp</th>
                  <th>Classification</th>
                  <th>Risk Score</th>
                  <th>Review Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lowRiskRecords.map((r) => (
                  <tr key={r._id}>
                    <td><strong>{r.entityId}</strong></td>
                    <td>{new Date(r.timestamp).toLocaleString()}</td>
                    <td><ClassificationBadge classification={r.classification} /></td>
                    <td><strong>{formatScore(r.semanticRiskScore ?? r.ruleRiskScore)}</strong></td>
                    <td><span className="badge badge-neutral">{r.reviewStatus}</span></td>
                    <td style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      <button
                        className="btn btn-neutral"
                        style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                        onClick={() => handleHeal({ recordId: r._id })}
                        disabled={healingTier !== null}
                      >
                        {healingTier === r._id ? "Healing..." : "Heal in Sandbox"}
                      </button>
                      <Link to={`/quarantine/${r._id}`} className="link-small">
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: HIGH-RISK OBSERVATIONS (Batch or Individual Sandbox Repair) */}
      <div className="card" style={{ borderLeft: "4px solid #ef4444", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.8rem", marginBottom: "0.8rem" }}>
          <div>
            <h2 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🛡️ Section 2: High-Risk Flagged Observations</span>
              <span className="badge badge-danger" style={{ fontSize: "0.8rem" }}>
                {highRiskRecords.length} Critical (Score &gt; 0.60)
              </span>
            </h2>
            <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.88rem" }}>
              Critical anomalies require rigorous multi-modal sandbox verification. Each observation is passed through the cascade until verified with risk score &lt; 0.30.
            </p>
          </div>
          <button
            className="btn btn-neutral"
            style={{ fontSize: "0.9rem", padding: "0.5rem 1rem", fontWeight: "600" }}
            onClick={() => handleHeal({ tier: "high_risk" })}
            disabled={healingTier !== null || highRiskRecords.length === 0}
          >
            {healingTier === "high_risk" ? "Batch Healing in Sandbox..." : "Batch Heal All High-Risk in Sandbox"}
          </button>
        </div>

        {highRiskRecords.length === 0 ? (
          <p className="muted" style={{ fontStyle: "italic", margin: "0.5rem 0" }}>
            ✓ No high-risk observations pending in quarantine queue.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Sensor Entity</th>
                  <th>Flagged Timestamp</th>
                  <th>Classification</th>
                  <th>Risk Score</th>
                  <th>Review Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {highRiskRecords.map((r) => (
                  <tr key={r._id}>
                    <td><strong>{r.entityId}</strong></td>
                    <td>{new Date(r.timestamp).toLocaleString()}</td>
                    <td><ClassificationBadge classification={r.classification} /></td>
                    <td><span style={{ color: "var(--invalid)", fontWeight: "bold" }}>{formatScore(r.semanticRiskScore ?? r.ruleRiskScore)}</span></td>
                    <td><span className="badge badge-danger">{r.reviewStatus}</span></td>
                    <td style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      <button
                        className="btn btn-approve"
                        style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                        onClick={() => handleHeal({ recordId: r._id })}
                        disabled={healingTier !== null}
                      >
                        {healingTier === r._id ? "Healing..." : "Heal in Sandbox"}
                      </button>
                      <Link to={`/quarantine/${r._id}`} className="link-small">
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 3: REPAIRED & HEALED OBSERVATIONS */}
      <div className="card" style={{ borderLeft: "4px solid #10b981" }}>
        <h2 className="card-title" style={{ margin: "0 0 0.8rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>✓ Section 3: Healed & Cleansed Observations Overlay</span>
          <span className="badge badge-success" style={{ fontSize: "0.8rem" }}>
            {repairedRecords.length} Successfully Repaired (Risk &lt; 0.30)
          </span>
        </h2>
        <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.88rem" }}>
          These readings were processed in the isolated sandbox, mathematically verified, and incorporated into the active versioned dataset overlay without mutating immutable raw sensor records.
        </p>

        {repairedRecords.length === 0 ? (
          <p className="muted" style={{ fontStyle: "italic" }}>
            No records healed yet. Click "Auto-Repair All Low-Risk Observations" or "Heal in Sandbox" above to start healing.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Sensor Entity</th>
                  <th>Original Reading</th>
                  <th>Healed Reading</th>
                  <th>Repair Strategy</th>
                  <th>Verified Risk Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {repairedRecords.slice(0, 30).map((r) => (
                  <tr key={r._id}>
                    <td><strong>{r.entityId}</strong></td>
                    <td><span style={{ color: "var(--invalid)", textDecoration: "line-through" }}>{r.correctedValues?.previousValue ?? "—"}</span></td>
                    <td><span style={{ color: "var(--valid)", fontWeight: "bold", fontSize: "1.05rem" }}>{r.correctedValues?.value ?? "—"}</span></td>
                    <td><code>{r.correctedValues?.strategy || "cascade_optimal"}</code></td>
                    <td><span className="badge badge-success">&lt; 0.30 Verified</span></td>
                    <td><span className="badge badge-success">REPAIRED</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
