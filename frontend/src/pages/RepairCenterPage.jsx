import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import apiClient from "../api/client";

export default function RepairCenterPage() {
  const { id } = useParams();
  const [repairs, setRepairs] = useState([]);
  const [currentProposal, setCurrentProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [filterState, setFilterState] = useState("");
  const [reviewerName, setReviewerName] = useState("lead-data-engineer");
  const [reviewNotes, setReviewNotes] = useState("");

  async function loadRepairs() {
    setLoading(true);
    setError("");
    try {
      if (id) {
        const res = await apiClient.get(`/repairs/${id}`);
        setCurrentProposal(res.data.proposal);
      } else {
        const url = filterState ? `/repairs?state=${filterState}` : "/repairs";
        const res = await apiClient.get(url);
        setRepairs(res.data.proposals);
        setCurrentProposal(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load repair records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRepairs();
  }, [id, filterState]);

  async function handleRunSandbox() {
    if (!currentProposal) return;
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await apiClient.post(`/repairs/${currentProposal._id}/sandbox`, {
        reviewer: reviewerName,
      });
      setCurrentProposal(res.data.proposal);
      setSuccessMsg("Sandbox verification finished.");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Sandbox verification failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreatePR() {
    if (!currentProposal) return;
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await apiClient.post(`/repairs/${currentProposal._id}/create-pr`, {
        reviewer: reviewerName,
      });
      setCurrentProposal(res.data.proposal);
      setSuccessMsg("GitHub Pull Request created successfully.");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to create Pull Request.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleHumanReview(decision) {
    if (!currentProposal || actionLoading) return;
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await apiClient.patch(`/repairs/${currentProposal._id}/review`, {
        decision,
        reviewer: reviewerName,
        notes: reviewNotes,
      });
      setCurrentProposal(res.data.proposal);
      setSuccessMsg(`Repair proposal successfully marked as ${decision.toUpperCase()}.`);
    } catch (err) {
      const backendErr = err.response?.data?.error;
      const backendCode = err.response?.data?.code;
      const msg = backendErr
        ? (backendCode ? `[${backendCode}] ${backendErr}` : backendErr)
        : err.message || "Review action failed.";
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  }

  function getBadgeClass(state) {
    switch (state) {
      case "VERIFIED":
      case "APPROVED":
        return "badge-success";
      case "PR_CREATED":
        return "badge-info";
      case "SANDBOX_RUNNING":
      case "NEEDS_REVIEW":
        return "badge-warning";
      case "SANDBOX_FAILED":
      case "REJECTED":
        return "badge-danger";
      default:
        return "badge-neutral";
    }
  }

  // --- SINGLE PROPOSAL DETAIL VIEW ---
  if (id && currentProposal) {
    const patch = currentProposal.proposedPatch || {};
    const sandbox = currentProposal.sandboxResult || {};
    const gh = currentProposal.githubIntegration || {};
    const canRunSandbox = ["PROPOSED", "SANDBOX_FAILED", "DETECTED", "NEEDS_REVIEW"].includes(currentProposal.lifecycleState);
    const canCreatePR = currentProposal.lifecycleState === "VERIFIED" && !gh.prUrl;
    const canApprove = ["VERIFIED", "PR_CREATED", "NEEDS_REVIEW"].includes(currentProposal.lifecycleState);
    const isTerminal = ["APPROVED", "REJECTED", "MERGED", "DEPLOYED"].includes(currentProposal.lifecycleState);
    const canReject = !isTerminal;

    const isolationLabel =
      sandbox.runtimeIsolation === "docker_container" || sandbox.containerId === "docker_container"
        ? "Docker Container (Network None)"
        : sandbox.runtimeIsolation === "isolated_subprocess" || sandbox.containerId?.includes("subprocess")
        ? "Isolated Subprocess (Restricted Env)"
        : sandbox.containerId || "Not Run";

    return (
      <div className="page">
        <p><Link to="/repairs" className="link-small">&larr; Back to all repair proposals</Link></p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <h1 className="page-title" style={{ margin: 0 }}>
            ETL Repair: <code>{currentProposal.entityId}</code>
          </h1>
          <span className={`badge ${getBadgeClass(currentProposal.lifecycleState)}`} style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem" }}>
            State: {currentProposal.lifecycleState}
          </span>
        </div>

        {error && <p className="error-text" style={{ padding: "0.6rem 0.8rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "4px" }}>{error}</p>}
        {successMsg && <p style={{ color: "var(--valid)", fontWeight: 500, padding: "0.6rem 0.8rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "4px" }}>{successMsg}</p>}

        {/* Multi-Gate Verification & Status Bar (7 Independent Dimensions) */}
        <div className="card" style={{ borderLeft: "4px solid var(--accent)" }}>
          <h2 className="card-title" style={{ margin: 0, marginBottom: "0.8rem" }}>Verification & Governance Gates</h2>
          <div className="detail-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div>
              <span className="detail-label">1. Lifecycle State</span>
              <div><span className={`badge ${getBadgeClass(currentProposal.lifecycleState)}`}>{currentProposal.lifecycleState}</span></div>
            </div>
            <div>
              <span className="detail-label">2. Patch Application</span>
              <div><span className={`badge ${patch.applicationState === "APPLIED" ? "badge-success" : patch.applicationState === "FAILED" ? "badge-danger" : "badge-neutral"}`}>{patch.applicationState || (patch.codeAfter ? "APPLIED" : "PENDING")}</span></div>
            </div>
            <div>
              <span className="detail-label">3. Sandbox Execution</span>
              <div><span className={`badge ${sandbox.status === "PASS" ? "badge-success" : sandbox.status === "FAIL" ? "badge-danger" : sandbox.status === "NEEDS_HUMAN_REVIEW" ? "badge-warning" : "badge-neutral"}`}>{sandbox.status || "NOT_RUN"}</span></div>
            </div>
            <div>
              <span className="detail-label">4. Test Result</span>
              <div><strong>{sandbox.testsPassed ?? 0} / {sandbox.testsTotal ?? 0} passed</strong></div>
            </div>
            <div>
              <span className="detail-label">5. Semantic Verification</span>
              <div>{sandbox.semanticChecksPassed ? <span className="badge badge-success">PASSED</span> : (sandbox.status === "NOT_RUN" ? <span className="badge badge-neutral">PENDING</span> : <span className="badge badge-warning">NEEDS_REVIEW</span>)}</div>
            </div>
            <div>
              <span className="detail-label">6. Human Review</span>
              <div><span className={`badge ${currentProposal.humanReview?.decision === "approved" ? "badge-success" : currentProposal.humanReview?.decision === "rejected" ? "badge-danger" : "badge-neutral"}`}>{currentProposal.humanReview?.decision ? currentProposal.humanReview.decision.toUpperCase() : "PENDING"}</span></div>
            </div>
            <div>
              <span className="detail-label">7. GitHub PR</span>
              <div>{gh.prUrl ? <span className="badge badge-info">#{gh.prNumber} ACTIVE</span> : <span className="badge badge-neutral">BLOCKED / NONE</span>}</div>
            </div>
          </div>
        </div>

        {/* 1. Diagnosis Overview */}
        <div className="card">
          <h2 className="card-title">1. Root-Cause Diagnosis</h2>
          <div className="detail-grid">
            <div><span className="detail-label">Failure Category</span><div><code>{currentProposal.failureCategory}</code></div></div>
            <div><span className="detail-label">Target File</span><div><code>{patch.targetFile}</code></div></div>
            <div><span className="detail-label">Patch Type</span><div><code>{patch.patchType}</code></div></div>
            <div><span className="detail-label">Observed Reading</span><div><strong>{currentProposal.evidence?.rawReading}</strong></div></div>
          </div>
          <div style={{ marginTop: "1rem", background: "#f8fafc", padding: "0.75rem", borderRadius: "4px", border: "1px solid var(--line)" }}>
            <strong>Diagnostic Hypothesis:</strong>
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.9rem" }}>{currentProposal.rootCauseHypothesis}</p>
          </div>
        </div>

        {/* 2. Semantic Value Correction Preview */}
        {(() => {
          const rawVal = currentProposal.evidence?.rawReading;
          const correctedVal =
            sandbox.semanticMetrics?.correctedValue ??
            sandbox.correctedValue ??
            (Array.isArray(sandbox.testResults)
              ? sandbox.testResults.find(
                  (t) =>
                    (t.name?.includes("clamped") || t.name?.includes("offset") || t.name?.includes("drift") || t.name?.includes("normal")) &&
                    t.outputValue !== undefined &&
                    typeof t.outputValue === "number" &&
                    (t.status === "PASS" || t.passed)
                )?.outputValue
              : undefined);

          return (
            <div className="card" style={{ borderLeft: "4px solid var(--valid)", background: "#fcfdfd" }}>
              <h2 className="card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 0.8rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <span>🎯 Semantically Corrected Sensor Value</span>
                {correctedVal !== undefined ? (
                  <span className="badge badge-success">CORRECTION VERIFIED</span>
                ) : (
                  <span className="badge badge-neutral">AWAITING SANDBOX RUN</span>
                )}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "1.2rem", flexWrap: "wrap", padding: "0.4rem 0" }}>
                <div style={{ background: "#fff", padding: "0.8rem 1.2rem", borderRadius: "6px", border: "1px solid var(--line)", minWidth: "160px" }}>
                  <span className="detail-label" style={{ display: "block", marginBottom: "0.2rem" }}>Raw Quarantined Value</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--invalid)" }}>
                      {rawVal !== undefined ? rawVal : "—"}
                    </span>
                    <span className="badge badge-danger">ANOMALOUS</span>
                  </div>
                </div>

                <div style={{ fontSize: "1.6rem", color: "var(--text-muted)", fontWeight: "bold" }}>&rarr;</div>

                <div style={{ background: "#fff", padding: "0.8rem 1.2rem", borderRadius: "6px", border: "1px solid var(--line)", minWidth: "180px" }}>
                  <span className="detail-label" style={{ display: "block", marginBottom: "0.2rem" }}>Corrected Pipeline Value</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "1.5rem", fontWeight: "700", color: correctedVal !== undefined ? "var(--valid)" : "var(--text-muted)" }}>
                      {correctedVal !== undefined ? (typeof correctedVal === "number" ? correctedVal.toFixed(2) : correctedVal) : "Pending Sandbox"}
                    </span>
                    {correctedVal !== undefined ? (
                      <span className="badge badge-success">VALIDATED</span>
                    ) : (
                      <span className="badge badge-neutral">PENDING</span>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: "240px", fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                  <strong>Correction Method:</strong>{" "}
                  {patch.patchType === "outlier_clamp"
                    ? "Clamps abrupt hardware spike back to previous valid historical observation."
                    : patch.patchType === "calibration_offset"
                    ? "Applies validated cluster consensus calibration offset."
                    : "Bounds extreme drift back to within 3σ normal distribution threshold."}
                  <div style={{ marginTop: "0.4rem" }}>
                    {sandbox.semanticChecksPassed ? (
                      <span style={{ color: "var(--valid)", fontWeight: "600" }}>✓ Passes REFORGE Rule Engine & Domain Bounds</span>
                    ) : (
                      <span style={{ color: "var(--accent)" }}>Execute sandbox verification to validate and confirm this corrected value.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. Candidate Strategy & Estimation Breakdown */}
        {currentProposal.repairMode === "DATA_REPAIR" ? (
          <div className="card" style={{ borderLeft: "4px solid #2563eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                3. Mathematical Data-Level Repair Breakdown (Mode A)
              </h2>
              <span className="badge badge-info" style={{ textTransform: "uppercase" }}>
                {currentProposal.dataRepair?.repairStrategy || "composite_optimal"}
              </span>
            </div>
            <p className="muted" style={{ margin: "0 0 1rem" }}>
              REFORGE Mode A synthesizes continuous, mathematically validated candidate replacements using multi-sensor physics and temporal topology instead of fragile code edits.
            </p>

            <div className="detail-grid" style={{ marginBottom: "1rem" }}>
              <div>
                <span className="detail-label">Selected Strategy</span>
                <div><code>{currentProposal.dataRepair?.repairStrategy || "composite_optimal"}</code></div>
              </div>
              <div>
                <span className="detail-label">Confidence Score</span>
                <div><strong>{((currentProposal.dataRepair?.confidenceScore ?? 0.95) * 100).toFixed(1)}%</strong></div>
              </div>
              <div>
                <span className="detail-label">Original Anomaly</span>
                <div><span style={{ color: "var(--invalid)", fontWeight: "bold" }}>{currentProposal.dataRepair?.originalValue ?? currentProposal.evidence?.rawReading}</span></div>
              </div>
              <div>
                <span className="detail-label">Calibrated Replacement</span>
                <div><span style={{ color: "var(--valid)", fontWeight: "bold", fontSize: "1.1rem" }}>{currentProposal.dataRepair?.proposedValue}</span></div>
              </div>
            </div>

            {currentProposal.dataRepair?.estimationDetails && (
              <div style={{ background: "#f8fafc", padding: "0.8rem", borderRadius: "6px", border: "1px solid var(--line)", marginBottom: "1rem" }}>
                <strong>Estimation Rationale & Topology:</strong>
                <p style={{ margin: "0.3rem 0 0.6rem", fontSize: "0.9rem" }}>
                  {currentProposal.dataRepair.estimationDetails.formulaExplanation || "Calibrated baseline computed from historical continuity and peer consensus."}
                </p>
                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  {currentProposal.dataRepair.estimationDetails.predecessorValue !== null && (
                    <div>Predecessor: <strong>{currentProposal.dataRepair.estimationDetails.predecessorValue}</strong></div>
                  )}
                  {currentProposal.dataRepair.estimationDetails.successorValue !== null && (
                    <div>Successor: <strong>{currentProposal.dataRepair.estimationDetails.successorValue}</strong></div>
                  )}
                  {currentProposal.dataRepair.estimationDetails.deviceRollingMedian !== undefined && (
                    <div>Rolling Median: <strong>{currentProposal.dataRepair.estimationDetails.deviceRollingMedian}</strong></div>
                  )}
                  {currentProposal.dataRepair.estimationDetails.peerClusterMean !== undefined && (
                    <div>Peer Consensus: <strong>{currentProposal.dataRepair.estimationDetails.peerClusterMean}</strong></div>
                  )}
                  {currentProposal.dataRepair.estimationDetails.physicalBounds && (
                    <div>Physical Domain: <strong>[{currentProposal.dataRepair.estimationDetails.physicalBounds.min}, {currentProposal.dataRepair.estimationDetails.physicalBounds.max}] {currentProposal.dataRepair.estimationDetails.physicalBounds.unit}</strong></div>
                  )}
                </div>
              </div>
            )}

            {Array.isArray(currentProposal.dataRepair?.alternativeCandidates) && currentProposal.dataRepair.alternativeCandidates.length > 0 && (
              <div>
                <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Candidate Estimations Evaluated</h3>
                <table className="data-table" style={{ width: "100%", fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th>Candidate Strategy</th>
                      <th>Proposed Value</th>
                      <th>Confidence</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentProposal.dataRepair.alternativeCandidates.map((cand, idx) => {
                      const isSelected = cand.strategy === currentProposal.dataRepair?.repairStrategy;
                      return (
                        <tr key={idx} style={{ background: isSelected ? "#eff6ff" : "transparent" }}>
                          <td><code>{cand.strategy}</code></td>
                          <td><strong>{cand.value}</strong></td>
                          <td>{(cand.confidence * 100).toFixed(0)}%</td>
                          <td>
                            {isSelected ? (
                              <span className="badge badge-success">SELECTED OPTIMAL</span>
                            ) : (
                              <span className="badge badge-neutral">BACKUP</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Mode B: Candidate Code Patch */
          <div className="card">
            <h2 className="card-title">3. Proposed Code Patch (Mode B)</h2>
            <p className="muted">{patch.description}</p>
            <div className="diff-viewer">
              {(patch.diff || "").split("\n").map((line, idx) => {
                let lineClass = "";
                if (line.startsWith("+") && !line.startsWith("+++")) lineClass = "diff-line-add";
                else if (line.startsWith("-") && !line.startsWith("---")) lineClass = "diff-line-del";
                else if (line.startsWith("@")) lineClass = "diff-line-info";
                return (
                  <div key={idx} className={lineClass}>{line || " "}</div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Sandbox Verification */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              4. Sandbox Verification ({sandbox.runtimeIsolation === "docker_container" ? "Isolated Docker Container" : "Isolated Sandbox"})
            </h2>
            <button
              className="btn btn-neutral"
              onClick={handleRunSandbox}
              disabled={actionLoading || !canRunSandbox}
            >
              {actionLoading ? "Executing Sandbox..." : "Run Sandbox Verification"}
            </button>
          </div>
          <p className="muted" style={{ margin: "0.4rem 0 0.8rem" }}>
            Executes candidate patch in a disposable workspace with isolated workdir, CPU/memory limits, and network disabled.
          </p>

          <div className="detail-grid">
            <div><span className="detail-label">Sandbox Status</span><div><span className={`badge ${sandbox.status === "PASS" ? "badge-success" : sandbox.status === "FAIL" ? "badge-danger" : sandbox.status === "NEEDS_HUMAN_REVIEW" ? "badge-warning" : "badge-neutral"}`}>{sandbox.status || "NOT_RUN"}</span></div></div>
            <div><span className="detail-label">Runtime Isolation</span><div><code>{isolationLabel}</code></div></div>
            <div><span className="detail-label">Unit Tests Passed</span><div><strong>{sandbox.testsPassed ?? 0} / {sandbox.testsTotal ?? 0}</strong></div></div>
            <div><span className="detail-label">Semantic Check</span><div>{sandbox.semanticChecksPassed ? <span className="badge badge-success">PASSED</span> : (sandbox.status === "NOT_RUN" ? <span className="badge badge-neutral">PENDING</span> : <span className="badge badge-warning">NEEDS_REVIEW</span>)}</div></div>
            <div><span className="detail-label">Execution Time</span><div>{sandbox.executionTimeMs ? `${sandbox.executionTimeMs} ms` : "—"}</div></div>
          </div>
          {sandbox.failureReason && (
            <div style={{ marginTop: "0.8rem", padding: "0.6rem 0.8rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "4px", fontSize: "0.85rem", color: "#991b1b" }}>
              <strong>Sandbox Diagnostic Output:</strong> {sandbox.failureReason}
            </div>
          )}

          {Array.isArray(sandbox.testResults) && sandbox.testResults.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Sandbox Test Cases Breakdown</h3>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th>Test Case</th>
                      <th>Status</th>
                      <th>Input Value</th>
                      <th>Expected Outcome</th>
                      <th>Actual Corrected Value</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sandbox.testResults.map((tr, idx) => (
                      <tr key={idx}>
                        <td><code>{tr.name || tr.test}</code></td>
                        <td>
                          <span className={`badge ${tr.status === "PASS" || tr.passed ? "badge-success" : "badge-danger"}`}>
                            {tr.status || (tr.passed ? "PASS" : "FAIL")}
                          </span>
                        </td>
                        <td><code>{tr.inputValue !== undefined ? String(tr.inputValue) : "—"}</code></td>
                        <td><small>{String(tr.expectedOutcome ?? "—")}</small></td>
                        <td>
                          <strong style={{ color: tr.status === "FAIL" || !tr.passed ? "var(--invalid)" : "var(--valid)" }}>
                            {String(tr.outputValue !== undefined ? tr.outputValue : tr.actualOutcome ?? "—")}
                          </strong>
                          {tr.error && <div style={{ color: "var(--invalid)", fontSize: "0.78rem" }}>{tr.error}</div>}
                        </td>
                        <td><small>{tr.durationMs ? `${tr.durationMs}ms` : "—"}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 4. GitHub Integration */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="card-title" style={{ margin: 0 }}>4. GitHub Branch & Pull Request</h2>
            <button
              className="btn btn-approve"
              onClick={handleCreatePR}
              disabled={actionLoading || !canCreatePR}
            >
              {actionLoading ? "Creating PR..." : "Create Pull Request"}
            </button>
          </div>
          <p className="muted" style={{ margin: "0.4rem 0 0.8rem" }}>
            Automated PR creation is locked until isolated sandbox verification passes (State: VERIFIED).
          </p>

          {gh.prUrl ? (
            <div style={{ background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: "4px", padding: "0.8rem" }}>
              <p style={{ margin: "0 0 0.4rem" }}>
                <strong>Pull Request Active:</strong>{" "}
                <a href={gh.prUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontWeight: 600 }}>
                  {gh.prUrl}
                </a>
              </p>
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                <span><strong>Branch:</strong> <code>{gh.branchName}</code></span>
                <span><strong>Commit:</strong> <code>{gh.commitSha?.slice(0, 7)}</code></span>
                <span><strong>CI Status:</strong> <span className="badge badge-success">{gh.ciStatus}</span></span>
              </div>
            </div>
          ) : (
            <p className="muted">
              {currentProposal.lifecycleState === "VERIFIED"
                ? "Sandbox verification complete. Click above to create the Pull Request."
                : "No Pull Request created yet. Blocked until sandbox verification passes (State: VERIFIED)."}
            </p>
          )}
        </div>

        {/* 5. Human Approval & Review Gate */}
        <div className="card">
          <h2 className="card-title">5. Human Approval & Production Gate</h2>
          <p className="muted">
            Safety Guard: No automated repair can be merged or deployed without explicit human reviewer signoff. Review decision and sandbox status are tracked separately.
          </p>

          {currentProposal.humanReview?.decision !== "pending" ? (
            <div style={{ background: "#f8fafc", padding: "0.8rem", borderRadius: "4px", border: "1px solid var(--line)" }}>
              <p style={{ margin: 0 }}>
                Decision: <strong style={{ textTransform: "uppercase" }}>{currentProposal.humanReview.decision}</strong> by{" "}
                <strong>{currentProposal.humanReview.reviewer}</strong> on{" "}
                {new Date(currentProposal.humanReview.reviewedAt).toLocaleString()}.
              </p>
              {currentProposal.humanReview.notes && (
                <p className="muted" style={{ margin: "0.4rem 0 0" }}>Notes: {currentProposal.humanReview.notes}</p>
              )}
            </div>
          ) : (
            <>
              <div className="form-row">
                <label>Reviewer Identity</label>
                <input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} className="input" />
              </div>
              <div className="form-row">
                <label>Reviewer Notes / Signoff Rationale</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="textarea"
                  rows={2}
                  placeholder="e.g. Verified sensor clamping logic; acceptable for production deploy."
                />
              </div>
              <div className="action-row">
                <button
                  className="btn btn-approve"
                  onClick={() => handleHumanReview("approved")}
                  disabled={actionLoading || !canApprove}
                >
                  Approve Repair for Merge
                </button>
                <button
                  className="btn btn-reject"
                  onClick={() => handleHumanReview("rejected")}
                  disabled={actionLoading || !canReject}
                >
                  Reject Proposal
                </button>
              </div>
              {!canApprove && (
                <p className="muted" style={{ fontSize: "0.82rem", marginTop: "0.4rem" }}>
                  * Approval is locked while in state <code>{currentProposal.lifecycleState}</code>. Proposals must pass sandbox verification (VERIFIED) prior to approval. Rejection remains available.
                </p>
              )}
            </>
          )}
        </div>

        {/* 6. Lifecycle State Machine Timeline */}
        <div className="card">
          <h2 className="card-title">6. State Machine Audit Trail</h2>
          <div className="timeline">
            {(currentProposal.stateHistory || []).map((step, idx) => (
              <div key={idx} className="timeline-entry">
                <div className="timeline-marker" />
                <div className="timeline-content">
                  <div className="timeline-header">
                    <strong>{step.fromState} &rarr; {step.toState}</strong>{" "}
                    <span className="muted">by {step.actor} at {new Date(step.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {step.notes && <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.84rem" }}>{step.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <div className="page">
      {/* Mode B / Pipeline Code Explanatory Banner */}
      <div style={{ background: "#f8fafc", padding: "0.8rem 1rem", borderRadius: "6px", border: "1px solid var(--line)", marginBottom: "1.2rem", fontSize: "0.9rem" }}>
        <strong>ℹ️ Role Separation Note:</strong> Telemetry observations flagged as anomalies are healed automatically in the <Link to="/quarantine" style={{ color: "var(--accent)", fontWeight: "600" }}>Quarantine Zone</Link>. This Repair Center is dedicated to <strong>Pipeline-Code Repairs (Mode B)</strong> for actual software bugs in ETL transformation or calibration files requiring isolated sandbox patches.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem", flexWrap: "wrap", gap: "0.8rem" }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Pipeline-Code Repair Center</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Isolated sandbox verification and Git PR workflows for software fixes to ETL pipeline code.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="input"
            style={{ width: "auto" }}
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
          >
            <option value="">All States ({repairs.length})</option>
            <option value="PROPOSED">PROPOSED</option>
            <option value="VERIFIED">VERIFIED (Sandbox Passed)</option>
            <option value="PR_CREATED">PR_CREATED</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <button className="btn btn-neutral" onClick={loadRepairs}>Refresh</button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading repair proposals...</p>}

      {!loading && repairs.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
          <p className="muted" style={{ fontSize: "1rem" }}>No repair proposals currently registered.</p>
          <p className="muted">
            Go to the <Link to="/quarantine">Quarantine Queue</Link>, select any flagged record, and click <strong>"Diagnose & Propose Repair"</strong> to start an automated workflow.
          </p>
        </div>
      )}

      {!loading && repairs.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Mode</th>
                <th>Failure Category</th>
                <th>Strategy / Patch</th>
                <th>Lifecycle State</th>
                <th>Sandbox Result</th>
                <th>GitHub PR</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {repairs.map((r) => (
                <tr key={r._id}>
                  <td><strong>{r.entityId}</strong></td>
                  <td>
                    <span className={`badge ${r.repairMode === "DATA_REPAIR" ? "badge-info" : "badge-neutral"}`}>
                      {r.repairMode === "DATA_REPAIR" ? "Mode A: Data" : "Mode B: Code"}
                    </span>
                  </td>
                  <td><code>{r.failureCategory}</code></td>
                  <td>{r.repairMode === "DATA_REPAIR" ? (r.dataRepair?.repairStrategy || "composite") : (r.proposedPatch?.patchType || "code_fix")}</td>
                  <td>
                    <span className={`badge ${getBadgeClass(r.lifecycleState)}`}>
                      {r.lifecycleState}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${r.sandboxResult?.status === "PASS" ? "badge-success" : r.sandboxResult?.status === "FAIL" ? "badge-danger" : "badge-neutral"}`}>
                      {r.sandboxResult?.status || "NOT_RUN"}
                    </span>
                  </td>
                  <td>
                    {r.githubIntegration?.prUrl ? (
                      <a href={r.githubIntegration.prUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                        #{r.githubIntegration.prNumber}
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{r.createdAt ? new Date(r.createdAt).toLocaleTimeString() : "—"}</td>
                  <td>
                    <Link to={`/repairs/${r._id}`} className="btn btn-neutral" style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", textDecoration: "none" }}>
                      Inspect &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
