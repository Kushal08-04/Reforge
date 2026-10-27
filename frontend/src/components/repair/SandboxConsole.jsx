import { Terminal, Shield, CheckCircle, XCircle } from "lucide-react";
import Badge from "../common/Badge";

export default function SandboxConsole({ sandboxResult }) {
  if (!sandboxResult || sandboxResult.status === "NOT_RUN") {
    return (
      <div style={{ padding: "20px", border: "1px dashed var(--border-color)", borderRadius: "var(--radius-sm)", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
        Sandbox verification has not been executed for this proposal yet.
      </div>
    );
  }

  const {
    status = "NOT_RUN",
    exitCode,
    executionTimeMs = 0,
    containerId,
    runtimeIsolation = "docker_container",
    stdout = "",
    stderr = "",
    testsPassed = 0,
    testsTotal = 0,
    semanticChecksPassed = false,
    failureReason,
  } = sandboxResult;

  const isPass = status === "PASS";

  return (
    <div>
      {/* Sandbox Isolation Header Strip */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
          <Shield size={14} style={{ color: "var(--accent-telemetry)" }} />
          <span>Isolation: <strong>{runtimeIsolation} (--network none, 256MB)</strong></span>
          {containerId && (
            <code style={{ fontSize: "11px", color: "var(--text-muted)" }}>ID: {containerId.slice(0, 12)}</code>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Badge tone={isPass ? "verified" : "invalid"}>
            {isPass ? "VERIFIED PASS" : status}
          </Badge>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Exit Code: {exitCode !== null ? exitCode : "-"} • {executionTimeMs}ms
          </span>
        </div>
      </div>

      {/* Semantic Check Callout */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
        <div style={{ flex: 1, padding: "8px 12px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
          {testsPassed === testsTotal && testsTotal > 0 ? (
            <CheckCircle size={14} style={{ color: "var(--accent-verified)" }} />
          ) : (
            <XCircle size={14} style={{ color: "var(--accent-error)" }} />
          )}
          <span>Unit & Property Tests: <strong>{testsPassed} / {testsTotal} Passed</strong></span>
        </div>

        <div style={{ flex: 1, padding: "8px 12px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
          {semanticChecksPassed ? (
            <CheckCircle size={14} style={{ color: "var(--accent-verified)" }} />
          ) : (
            <XCircle size={14} style={{ color: "var(--accent-error)" }} />
          )}
          <span>Post-Repair Risk Check: <strong>{semanticChecksPassed ? "PASSED (<0.30)" : "FAILED (>=0.30)"}</strong></span>
        </div>
      </div>

      {failureReason && (
        <div style={{ padding: "8px 12px", backgroundColor: "var(--accent-error-bg)", border: "1px solid var(--accent-error)", borderRadius: "var(--radius-sm)", color: "var(--accent-error)", fontSize: "12px", marginBottom: "12px" }}>
          <strong>Failure Reason:</strong> {failureReason}
        </div>
      )}

      {/* Raw Output Terminal */}
      <div className="diff-container" style={{ maxHeight: "200px" }}>
        <div style={{ color: "var(--text-muted)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Terminal size={12} />
          <span>Container stdout & verification assertions</span>
        </div>
        {stdout || stderr ? (
          <div>
            {stdout && <div style={{ color: "#E5E5E5" }}>{stdout}</div>}
            {stderr && <div style={{ color: "var(--accent-error)" }}>{stderr}</div>}
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)" }}>Execution finished with empty output stream.</div>
        )}
      </div>
    </div>
  );
}
