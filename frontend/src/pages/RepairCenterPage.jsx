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
    if (!currentProposal) return;
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
      setSuccessMsg(`Repair proposal marked as ${decision.toUpperCase()}.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Review action failed.");
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
    const canRunSandbox = ["PROPOSED", "SANDBOX_FAILED", "DETECTED"].includes(currentProposal.lifecycleState);
    const canCreatePR = currentProposal.lifecycleState === "VERIFIED" && !gh.prUrl;
    const canReview = ["VERIFIED", "PR_CREATED"].includes(currentProposal.lifecycleState);

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

        {error && <p className="error-text">{error}</p>}
        {successMsg && <p style={{ color: "var(--valid)", fontWeight: 500 }}>{successMsg}</p>}

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

        {/* 2. Candidate Code Patch */}
        <div className="card">
          <h2 className="card-title">2. Proposed Code Patch</h2>
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

        {/* 3. Sandbox Verification */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="card-title" style={{ margin: 0 }}>3. Isolated Docker Sandbox Verification</h2>
            <button
              className="btn btn-neutral"
              onClick={handleRunSandbox}
              disabled={actionLoading || !canRunSandbox}
            >
              {actionLoading ? "Executing Sandbox..." : "Run Sandbox Verification"}
            </button>
          </div>
          <p className="muted" style={{ margin: "0.4rem 0 0.8rem" }}>
            Executes candidate patch in a disposable container with isolated workdir, CPU/memory limits, and network disabled.
          </p>

          <div className="detail-grid">
            <div><span className="detail-label">Sandbox Status</span><div><span className={`badge ${sandbox.status === "PASS" ? "badge-success" : sandbox.status === "FAIL" ? "badge-danger" : "badge-neutral"}`}>{sandbox.status || "NOT_RUN"}</span></div></div>
            <div><span className="detail-label">Runtime Isolation</span><div><code>{sandbox.containerId || "none"}</code></div></div>
            <div><span className="detail-label">Unit Tests Passed</span><div><strong>{sandbox.testsPassed ?? 0} / {sandbox.testsTotal ?? 0}</strong></div></div>
            <div><span className="detail-label">Semantic Check</span><div>{sandbox.semanticChecksPassed ? <span className="badge badge-success">PASSED</span> : <span className="badge badge-neutral">PENDING</span>}</div></div>
            <div><span className="detail-label">Execution Time</span><div>{sandbox.executionTimeMs ? `${sandbox.executionTimeMs} ms` : "—"}</div></div>
          </div>
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
            <p className="muted">No Pull Request created yet. Click above once sandbox verification is complete.</p>
          )}
        </div>

        {/* 5. Human Approval & Review Gate */}
        <div className="card">
          <h2 className="card-title">5. Human Approval & Production Gate</h2>
          <p className="muted">
            Safety Guard: No automated repair can be merged or deployed without explicit human reviewer signoff.
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
                  disabled={actionLoading || !canReview}
                >
                  Approve Repair for Merge
                </button>
                <button
                  className="btn btn-reject"
                  onClick={() => handleHumanReview("rejected")}
                  disabled={actionLoading}
                >
                  Reject Proposal
                </button>
              </div>
              {!canReview && (
                <p className="muted" style={{ fontSize: "0.82rem", marginTop: "0.4rem" }}>
                  * Approval requires prior sandbox verification.
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>ETL Repair Center</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Automated failure diagnosis, isolated sandbox verification, and controlled GitHub PR integration.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
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
            Go to the <Link to="/quarantine">Quarantine Queue</Link>, select any flagged record, and click <strong>"Diagnose & Propose ETL Repair"</strong> to start an automated workflow.
          </p>
        </div>
      )}

      {!loading && repairs.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Failure Category</th>
                <th>Patch Type</th>
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
                  <td><code>{r.failureCategory}</code></td>
                  <td>{r.proposedPatch?.patchType}</td>
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
