import { CheckCircle, AlertCircle, Clock, Check } from "lucide-react";

const LIFECYCLE_STEPS = [
  { key: "DETECTED", label: "Anomaly Detected" },
  { key: "PROPOSED", label: "Candidate Proposed" },
  { key: "SANDBOX_RUNNING", label: "Sandbox Running" },
  { key: "VERIFIED", label: "Sandbox Verified" },
  { key: "PR_CREATED", label: "PR Exported" },
  { key: "APPROVED", label: "Human Approved" },
];

export default function LifecycleStepper({ currentState = "DETECTED" }) {
  const isFailed = currentState === "SANDBOX_FAILED" || currentState === "REJECTED";

  function getStepStatus(stepKey) {
    if (currentState === stepKey) return isFailed ? "failed" : "active";
    const order = ["DETECTED", "DIAGNOSING", "PROPOSED", "SANDBOX_RUNNING", "VERIFIED", "NEEDS_REVIEW", "PR_CREATED", "APPROVED"];
    const currentIndex = order.indexOf(currentState);
    const stepIndex = order.indexOf(stepKey);
    if (currentIndex >= stepIndex) return "completed";
    return "pending";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "16px 0", flexWrap: "wrap" }}>
      {LIFECYCLE_STEPS.map((step, idx) => {
        const status = getStepStatus(step.key);
        let color = "var(--text-muted)";
        let bg = "var(--bg-secondary)";
        let border = "var(--border-color)";

        if (status === "completed") {
          color = "var(--accent-verified)";
          bg = "var(--accent-verified-bg)";
          border = "var(--accent-verified)";
        } else if (status === "active") {
          color = "var(--text-primary)";
          bg = "var(--bg-panel)";
          border = "var(--accent-telemetry)";
        } else if (status === "failed") {
          color = "var(--accent-error)";
          bg = "var(--accent-error-bg)";
          border = "var(--accent-error)";
        }

        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: bg,
                border: `1px solid ${border}`,
                fontSize: "12px",
                fontWeight: status === "active" ? 600 : 500,
                color,
              }}
            >
              {status === "completed" ? (
                <Check size={12} />
              ) : status === "failed" ? (
                <AlertCircle size={12} />
              ) : status === "active" ? (
                <Clock size={12} />
              ) : (
                <span style={{ width: "12px", height: "12px", display: "inline-block", borderRadius: "50%", border: "1px solid var(--border-color)", textAlign: "center", fontSize: "9px", lineHeight: "10px" }}>{idx + 1}</span>
              )}
              <span>{step.label}</span>
            </div>

            {idx < LIFECYCLE_STEPS.length - 1 && (
              <span style={{ color: "var(--border-color)", fontSize: "12px" }}>&rarr;</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
