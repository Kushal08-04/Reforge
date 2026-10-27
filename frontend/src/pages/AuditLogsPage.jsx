import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import {
  fetchAuditTrail,
  fetchModelsRegistry,
  triggerModelTraining,
  promoteModelVersion,
  rollbackModelVersion,
  downloadExportFile,
  exportToGitHub,
} from "../api/endpoints";
import Badge from "../components/common/Badge";
import {
  FileText,
  Download,
  GitBranch,
  Cpu,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  Play,
  RotateCcw,
} from "lucide-react";

export default function AuditLogsPage() {
  const { rawObservationId: routeObservationId } = useParams();
  const { dataMode } = useSelector((s) => s.ui);

  const [activeTab, setActiveTab] = useState("audit"); // "audit" | "exports" | "models"

  // 1. Audit Trail State
  const [obsId, setObsId] = useState(routeObservationId || "demo-raw-001");
  const [auditData, setAuditData] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");

  // 2. Export Hub State
  const [exporting, setExporting] = useState("");
  const [ghResult, setGhResult] = useState(null);

  // 3. Model Registry State
  const [modelsData, setModelsData] = useState(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelType, setModelType] = useState("isolation_forest");
  const [testSplit, setTestSplit] = useState(0.25);
  const [modelActionMsg, setModelActionMsg] = useState("");

  async function loadAudit(idToLoad) {
    if (!idToLoad) return;
    setAuditLoading(true);
    setAuditError("");
    try {
      const data = await fetchAuditTrail(idToLoad);
      setAuditData(data);
    } catch (err) {
      setAuditError(err.message || "Failed to load audit trail.");
      setAuditData(null);
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadModels() {
    setModelsLoading(true);
    try {
      const data = await fetchModelsRegistry();
      setModelsData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setModelsLoading(false);
    }
  }

  useEffect(() => {
    const targetId = routeObservationId || obsId;
    if (routeObservationId) {
      setObsId(routeObservationId);
    }
    loadAudit(targetId);
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeObservationId, dataMode]);

  async function handleDownload(format, filename) {
    setExporting(format);
    try {
      await downloadExportFile(format, filename);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setExporting("");
    }
  }

  async function handleGitHubPush() {
    setExporting("github");
    setGhResult(null);
    try {
      const res = await exportToGitHub();
      setGhResult(res);
    } catch (err) {
      alert(`GitHub export failed: ${err.message}`);
    } finally {
      setExporting("");
    }
  }

  async function handleTrain(e) {
    e.preventDefault();
    setModelActionMsg("");
    try {
      const res = await triggerModelTraining({ modelType, testSize: parseFloat(testSplit) });
      setModelActionMsg(res.message || "Candidate model successfully trained.");
      loadModels();
    } catch (err) {
      alert(`Training failed: ${err.message}`);
    }
  }

  async function handlePromote(version, name) {
    if (!confirm(`Are you sure you want to promote ${name}:${version} to ACTIVE production model?`)) return;
    try {
      await promoteModelVersion(version, name);
      setModelActionMsg(`Model ${name}:${version} successfully promoted to ACTIVE.`);
      loadModels();
    } catch (err) {
      alert(`Promotion failed: ${err.message}`);
    }
  }

  async function handleRollback() {
    if (!confirm("Are you sure you want to roll back to the previously active model version?")) return;
    try {
      const res = await rollbackModelVersion();
      setModelActionMsg(`Rolled back to active model: ${res.activeModel?.version || "previous"}.`);
      loadModels();
    } catch (err) {
      alert(`Rollback failed: ${err.message}`);
    }
  }

  return (
    <div>
      {/* Tab Navigation Ribbon */}
      <div className="card" style={{ padding: "8px 16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setActiveTab("audit")}
            className={`btn btn-sm ${activeTab === "audit" ? "btn-primary" : "btn-secondary"}`}
          >
            <FileText size={13} />
            <span>Cryptographic Audit Trail</span>
          </button>
          <button
            onClick={() => setActiveTab("exports")}
            className={`btn btn-sm ${activeTab === "exports" ? "btn-primary" : "btn-secondary"}`}
          >
            <Download size={13} />
            <span>Dataset Snapshots & Exports</span>
          </button>
          <button
            onClick={() => setActiveTab("models")}
            className={`btn btn-sm ${activeTab === "models" ? "btn-primary" : "btn-secondary"}`}
          >
            <Cpu size={13} />
            <span>ML Model Registry & Training</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Cryptographic Audit Trail */}
      {activeTab === "audit" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Observation Lineage & State Timeline</h3>
              <p className="card-subtitle">
                Immutable chronological trail from raw ingestion through schema, rules, ML inference, sandbox repair, and approval
              </p>
            </div>

            {/* Audit Search Bar */}
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                type="text"
                placeholder="Observation ID..."
                className="input"
                value={obsId}
                onChange={(e) => setObsId(e.target.value)}
                style={{ width: "220px", fontSize: "12px", fontFamily: "var(--font-mono)" }}
              />
              <button onClick={() => loadAudit(obsId)} className="btn btn-secondary btn-sm">
                <Search size={13} />
                <span>Lookup</span>
              </button>
            </div>
          </div>

          {auditError && (
            <div style={{ padding: "8px 12px", backgroundColor: "var(--accent-error-bg)", color: "var(--accent-error)", borderRadius: "var(--radius-sm)", fontSize: "12px", marginBottom: "16px" }}>
              {auditError}
            </div>
          )}

          {auditData && (
            <div>
              {/* Raw Observation Context Strip */}
              <div style={{ padding: "12px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>ENTITY ID</span>
                  <code style={{ fontWeight: 600 }}>{auditData.rawObservation?.entityId}</code>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>RECORDED TIMESTAMP</span>
                  <span>{auditData.rawObservation?.timestamp ? new Date(auditData.rawObservation.timestamp).toLocaleString() : "-"}</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>RAW UNMUTATED VALUE</span>
                  <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                    {auditData.rawObservation?.values?.value ?? "-"} {auditData.rawObservation?.units?.value || "°C"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px", display: "block" }}>IMMUTABILITY STATUS</span>
                  <Badge tone="valid">NEVER MUTATED (GROUND TRUTH)</Badge>
                </div>
              </div>

              {/* Vertical Audit Trail */}
              <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>
                Chronological Lineage ({auditData.auditTrail?.length || 0} Events)
              </h4>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(auditData.auditTrail || []).map((entry, idx) => (
                  <div
                    key={entry._id || idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "10px 14px",
                      backgroundColor: "var(--bg-secondary)",
                      borderLeft: "3px solid var(--accent-telemetry)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ minWidth: "160px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", textTransform: "capitalize" }}>
                        {entry.action?.replace(/_/g, " ")}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Actor: {entry.actor}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : ""}
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <pre className="diff-container" style={{ margin: 0, padding: "6px 10px", fontSize: "11px" }}>
                        {JSON.stringify(entry.details || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Dataset Snapshots & Exports */}
      {activeTab === "exports" && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Dataset Snapshots & Verified Data Exports</h3>
              <p className="card-subtitle">
                Export verified telemetry overlays as binary PDF 1.4 reports, CSV, Excel, or commit directly to GitHub
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "20px" }}>
            {/* CSV Export */}
            <div style={{ padding: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                CSV Telemetry Export
              </h4>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "14px" }}>
                Raw telemetry stream merged with verified sandbox data repairs.
              </p>
              <button
                onClick={() => handleDownload("csv", "reforge_dataset.csv")}
                disabled={exporting === "csv"}
                className="btn btn-secondary btn-sm"
              >
                <Download size={13} />
                <span>{exporting === "csv" ? "Generating..." : "Download .CSV"}</span>
              </button>
            </div>

            {/* Excel XLSX Export */}
            <div style={{ padding: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                Excel Spreadsheet (.xlsx)
              </h4>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "14px" }}>
                Structured multi-sheet workbook including validation classifications and rule flags.
              </p>
              <button
                onClick={() => handleDownload("xlsx", "reforge_dataset.xlsx")}
                disabled={exporting === "xlsx"}
                className="btn btn-secondary btn-sm"
              >
                <Download size={13} />
                <span>{exporting === "xlsx" ? "Generating..." : "Download .XLSX"}</span>
              </button>
            </div>

            {/* Binary PDF 1.4 Audit Report */}
            <div style={{ padding: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                PDF 1.4 Verification Report
              </h4>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "14px" }}>
                Pure-JS generated cryptographic audit report with mathematical repair summaries.
              </p>
              <button
                onClick={() => handleDownload("pdf", "reforge_audit_report.pdf")}
                disabled={exporting === "pdf"}
                className="btn btn-secondary btn-sm"
              >
                <Download size={13} />
                <span>{exporting === "pdf" ? "Generating..." : "Download .PDF"}</span>
              </button>
            </div>

            {/* GitHub Direct Commit */}
            <div style={{ padding: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                GitHub Repository Push
              </h4>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "14px" }}>
                Pushes cleansed dataset commit directly to repository branch.
              </p>
              <button
                onClick={handleGitHubPush}
                disabled={exporting === "github"}
                className="btn btn-primary btn-sm"
              >
                <GitBranch size={13} />
                <span>{exporting === "github" ? "Pushing..." : "Push Cleaned Dataset"}</span>
              </button>
            </div>
          </div>

          {ghResult && (
            <div style={{ padding: "12px", backgroundColor: "var(--accent-verified-bg)", border: "1px solid var(--accent-verified)", color: "var(--accent-verified)", borderRadius: "var(--radius-sm)", fontSize: "12px" }}>
              {ghResult.message} (SHA: <code>{ghResult.commitSha}</code>)
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ML Model Registry & Training */}
      {activeTab === "models" && (
        <div>
          {modelActionMsg && (
            <div style={{ padding: "10px 14px", backgroundColor: "var(--accent-verified-bg)", border: "1px solid var(--accent-verified)", color: "var(--accent-verified)", borderRadius: "var(--radius-sm)", fontSize: "12px", marginBottom: "16px" }}>
              {modelActionMsg}
            </div>
          )}

          {/* Model Registry List */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Registered Model Versions (ml-service FastAPI)</h3>
                <p className="card-subtitle">Active and candidate anomaly detection models in registry</p>
              </div>
              <button onClick={handleRollback} className="btn btn-secondary btn-sm" title="Roll back to previous model">
                <RotateCcw size={12} />
                <span>Instant Rollback</span>
              </button>
            </div>

            <div className="table-container">
              <table className="table" aria-label="ML models registry table">
                <thead>
                  <tr>
                    <th>Model Name</th>
                    <th>Version Tag</th>
                    <th>Algorithm</th>
                    <th>Status</th>
                    <th>Precision / Recall</th>
                    <th>ROC-AUC</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(modelsData?.registeredVersions || []).map((m) => (
                    <tr key={m._id || m.version}>
                      <td><strong>{m.modelName}</strong></td>
                      <td><code>{m.version}</code></td>
                      <td>{m.algorithm}</td>
                      <td>
                        <Badge tone={m.status === "active" ? "verified" : m.status === "candidate" ? "telemetry" : "neutral"}>
                          {m.status}
                        </Badge>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                        {m.metrics ? `${(m.metrics.precision * 100).toFixed(1)}% / ${(m.metrics.recall * 100).toFixed(1)}%` : "-"}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                        {m.metrics?.roc_auc ? m.metrics.roc_auc.toFixed(3) : "-"}
                      </td>
                      <td>
                        {m.status === "candidate" && (
                          <button
                            onClick={() => handlePromote(m.version, m.modelName)}
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: "11px", padding: "2px 8px" }}
                          >
                            Promote to Active
                          </button>
                        )}
                        {m.status === "active" && (
                          <span style={{ fontSize: "11px", color: "var(--accent-verified)", fontWeight: 600 }}>
                            Serving Traffic
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Train Candidate Model Form */}
          <div className="card">
            <h3 className="card-title">Train Candidate Model</h3>
            <p className="card-subtitle" style={{ marginBottom: "14px" }}>
              Trains a new model on database observations and registers it as a candidate for evaluation
            </p>

            <form onSubmit={handleTrain} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Algorithm</label>
                <select className="select" value={modelType} onChange={(e) => setModelType(e.target.value)} style={{ width: "100%" }}>
                  <option value="isolation_forest">Isolation Forest (Unsupervised)</option>
                  <option value="random_forest">Random Forest Classifier (Supervised)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Validation Split</label>
                <select className="select" value={testSplit} onChange={(e) => setTestSplit(e.target.value)} style={{ width: "100%" }}>
                  <option value={0.20}>20% Held-Out Split</option>
                  <option value={0.25}>25% Held-Out Split</option>
                  <option value={0.30}>30% Held-Out Split</option>
                </select>
              </div>

              <div>
                <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                  <Play size={13} />
                  <span>Train & Register Candidate</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
