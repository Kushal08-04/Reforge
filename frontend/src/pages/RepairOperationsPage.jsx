import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchRepairs,
  fetchRepairDetail,
  runSandbox,
  exportPR,
  submitRepairReview,
  clearActionFeedback,
} from "../features/repair/repairSlice";
import LifecycleStepper from "../components/repair/LifecycleStepper";
import CandidateComparison from "../components/repair/CandidateComparison";
import DiffViewer from "../components/common/DiffViewer";
import SandboxConsole from "../components/repair/SandboxConsole";
import Badge from "../components/common/Badge";
import {
  Play,
  GitPullRequest,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";

export default function RepairOperationsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { list = [], listStatus, currentProposal, actionStatus, actionError, actionSuccessMsg } = useSelector(
    (s) => s.repair
  );
  const { dataMode } = useSelector((s) => s.ui);

  const [stateFilter, setStateFilter] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const reviewerName = "lead-data-engineer";

  // Load repairs list
  useEffect(() => {
    dispatch(fetchRepairs(stateFilter ? { state: stateFilter } : {}));
  }, [dispatch, stateFilter, dataMode]);

  // Load specific proposal detail when `id` is in URL, or auto-select first proposal
  useEffect(() => {
    if (id) {
      dispatch(fetchRepairDetail(id));
    } else if (list.length > 0 && !currentProposal) {
      navigate(`/repairs/${list[0]._id}`, { replace: true });
    }
  }, [dispatch, id, list, currentProposal, navigate]);

  function handleSelectProposal(proposalId) {
    dispatch(clearActionFeedback());
    navigate(`/repairs/${proposalId}`);
  }

  function handleRunSandbox() {
    if (!currentProposal || actionStatus === "loading") return;
    dispatch(runSandbox({ id: currentProposal._id, reviewer: reviewerName }));
  }

  function handleCreatePR() {
    if (!currentProposal || actionStatus === "loading") return;
    dispatch(exportPR({ id: currentProposal._id, reviewer: reviewerName }));
  }

  function handleReview(decision) {
    if (!currentProposal || actionStatus === "loading") return;
    dispatch(submitRepairReview({ id: currentProposal._id, decision, reviewer: reviewerName, notes: reviewNotes }));
    setReviewNotes("");
  }

  const proposal = currentProposal;
  const isVerified = proposal?.lifecycleState === "VERIFIED";
  const canApprove = proposal && ["VERIFIED", "PR_CREATED", "NEEDS_REVIEW"].includes(proposal.lifecycleState);
  const canRunSandbox = proposal && ["PROPOSED", "SANDBOX_FAILED", "DETECTED", "NEEDS_REVIEW"].includes(proposal.lifecycleState);

  return (
    <div>
      {/* Top Filter and Header Strip */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>Filter by State:</span>
            <select
              className="select"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              style={{ fontSize: "12px" }}
            >
              <option value="">All Lifecycle States</option>
              <option value="PROPOSED">PROPOSED</option>
              <option value="SANDBOX_RUNNING">SANDBOX_RUNNING</option>
              <option value="VERIFIED">VERIFIED (Passed Sandbox)</option>
              <option value="SANDBOX_FAILED">SANDBOX_FAILED</option>
              <option value="PR_CREATED">PR_CREATED</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>

          <button
            onClick={() => dispatch(fetchRepairs(stateFilter ? { state: stateFilter } : {}))}
            className="btn btn-secondary btn-sm"
            title="Refresh repairs"
          >
            <RefreshCw size={13} className={listStatus === "loading" ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Action Error / Success Feedback */}
        {actionError && (
          <div style={{ marginTop: "10px", padding: "8px 12px", backgroundColor: "var(--accent-error-bg)", color: "var(--accent-error)", border: "1px solid var(--accent-error)", borderRadius: "var(--radius-sm)", fontSize: "12px" }}>
            {actionError}
          </div>
        )}
        {actionSuccessMsg && (
          <div style={{ marginTop: "10px", padding: "8px 12px", backgroundColor: "var(--accent-verified-bg)", color: "var(--accent-verified)", border: "1px solid var(--accent-verified)", borderRadius: "var(--radius-sm)", fontSize: "12px" }}>
            {actionSuccessMsg}
          </div>
        )}
      </div>

      {/* Two-Column Master-Detail Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(520px, 1.8fr)", gap: "16px" }}>
        {/* Left Column: Proposals List */}
        <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "calc(100vh - 190px)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", fontWeight: 600, fontSize: "13px" }}>
            Repair Proposals ({list.length})
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {list.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                No repair proposals found. Flagged observations can be diagnosed from the Anomaly Explorer.
              </div>
            ) : (
              list.map((r) => {
                const isSelected = r._id === proposal?._id;
                return (
                  <div
                    key={r._id}
                    onClick={() => handleSelectProposal(r._id)}
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
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "12px" }}>
                        {r.entityId}
                      </span>
                      <Badge tone={r.lifecycleState === "VERIFIED" || r.lifecycleState === "APPROVED" ? "verified" : r.lifecycleState === "SANDBOX_FAILED" || r.lifecycleState === "REJECTED" ? "invalid" : "suspicious"}>
                        {r.lifecycleState}
                      </Badge>
                    </div>

                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Mode: <strong style={{ color: "var(--text-primary)" }}>{r.repairMode}</strong> • Category: {r.failureCategory}
                    </div>

                    <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      Sandbox: {r.sandboxResult?.status || "NOT_RUN"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Execution, Verification & Review Details */}
        <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", height: "calc(100vh - 190px)", overflowY: "auto" }}>
          {!proposal ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              Select a repair proposal to inspect its sandbox results and lifecycle.
            </div>
          ) : (
            <div>
              {/* Proposal Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--border-color)" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                      Repair #{proposal._id.slice(-6)}
                    </h3>
                    <Badge tone={proposal.lifecycleState === "VERIFIED" ? "verified" : "neutral"}>
                      {proposal.lifecycleState}
                    </Badge>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                    Entity: <strong>{proposal.entityId}</strong> • Mode: <strong>{proposal.repairMode}</strong> • Category: <code>{proposal.failureCategory}</code>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleRunSandbox}
                    disabled={!canRunSandbox || actionStatus === "loading"}
                    className="btn btn-primary btn-sm"
                    title="Runs verification suite in isolated Docker container"
                  >
                    <Play size={12} />
                    <span>Execute Sandbox</span>
                  </button>

                  <button
                    onClick={handleCreatePR}
                    disabled={!isVerified || actionStatus === "loading"}
                    className="btn btn-secondary btn-sm"
                    title={isVerified ? "Export verified patch to GitHub PR" : "Requires prior verified sandbox execution"}
                  >
                    <GitPullRequest size={12} />
                    <span>Create GitHub PR</span>
                  </button>
                </div>
              </div>

              {/* State Machine Stepper */}
              <LifecycleStepper currentState={proposal.lifecycleState} />

              {/* GitHub PR Integration Banner (if created) */}
              {proposal.githubIntegration?.prNumber && (
                <div style={{ padding: "10px 14px", backgroundColor: "var(--accent-telemetry-bg)", border: "1px solid var(--accent-telemetry)", borderRadius: "var(--radius-sm)", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: "12px", color: "var(--accent-telemetry)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <GitPullRequest size={14} />
                    <span>
                      Pull Request <strong>#{proposal.githubIntegration.prNumber}</strong> ({proposal.githubIntegration.branchName})
                    </span>
                  </div>
                  {proposal.githubIntegration.prUrl && (
                    <a
                      href={proposal.githubIntegration.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "11px", padding: "2px 8px" }}
                    >
                      View on GitHub &rarr;
                    </a>
                  )}
                </div>
              )}

              {/* Mode A: Data-Level Repair Visualizer */}
              {proposal.repairMode === "DATA_REPAIR" && (
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px" }}>
                    Mode A: Mathematical Candidate Data Repair
                  </h4>
                  <CandidateComparison dataRepair={proposal.dataRepair} />
                </div>
              )}

              {/* Mode B: Code Patch Diff Viewer */}
              {proposal.repairMode === "CODE_PATCH" && (
                <div style={{ marginBottom: "20px" }}>
                  <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px" }}>
                    Mode B: Code Patch Diff ({proposal.proposedPatch?.patchType})
                  </h4>
                  <DiffViewer
                    diff={proposal.proposedPatch?.diff}
                    targetFile={proposal.proposedPatch?.targetFile}
                  />
                </div>
              )}

              {/* Isolated Sandbox Execution Console */}
              <div style={{ marginBottom: "20px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px" }}>
                  Isolated Docker Sandbox Verification
                </h4>
                <SandboxConsole sandboxResult={proposal.sandboxResult} />
              </div>

              {/* Human Approval Gate (Strictly Guarded) */}
              <div style={{ padding: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: "20px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                  Human Review Gate
                </h4>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px" }}>
                  {!canApprove
                    ? "Strict safety guard: Patches must pass isolated sandbox verification (risk < 0.30) before human approval."
                    : "Observation/patch has passed verification. Approving will update the dataset baseline overlay or code branch."}
                </p>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => handleReview("approved")}
                    disabled={!canApprove || actionStatus === "loading"}
                    className="btn btn-success btn-sm"
                    title={canApprove ? "Record human approval" : "Approval blocked: sandbox verification required"}
                  >
                    <CheckCircle size={13} />
                    <span>Approve Repair</span>
                  </button>

                  <button
                    onClick={() => handleReview("rejected")}
                    disabled={actionStatus === "loading"}
                    className="btn btn-danger btn-sm"
                    title="Reject repair proposal"
                  >
                    <XCircle size={13} />
                    <span>Reject Proposal</span>
                  </button>
                </div>
              </div>

              {/* State Transition History Timeline */}
              {proposal.stateHistory && proposal.stateHistory.length > 0 && (
                <div>
                  <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px" }}>
                    Audit History & State Transitions
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {proposal.stateHistory.map((h, idx) => (
                      <div key={idx} style={{ padding: "8px 12px", borderLeft: "2px solid var(--accent-telemetry)", backgroundColor: "var(--bg-secondary)", fontSize: "11px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", marginBottom: "2px" }}>
                          <span>
                            <strong>{h.fromState}</strong> &rarr; <strong>{h.toState}</strong> ({h.actor})
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)" }}>
                            {h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : ""}
                          </span>
                        </div>
                        {h.notes && <div style={{ color: "var(--text-muted)" }}>{h.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
