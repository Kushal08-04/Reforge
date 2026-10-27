import { AlertTriangle, CheckCircle } from "lucide-react";

export default function EvidenceCard({ source, triggered, severity = 0, message, details = {} }) {
  const RULE_LABELS = {
    rateOfChangeRule: "Rate-of-Change Detection",
    historicalZScoreRule: "Historical Z-Score Outlier",
    crossSensorRule: "Cross-Sensor Spatial Disagreement",
    implausibleJumpRule: "Implausible Value Jump",
  };

  const title = RULE_LABELS[source] || source;

  return (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderLeft: triggered ? "3px solid var(--accent-error)" : "3px solid var(--accent-verified)",
        backgroundColor: "var(--bg-secondary)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
        marginBottom: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
          {triggered ? (
            <AlertTriangle size={14} style={{ color: "var(--accent-error)" }} />
          ) : (
            <CheckCircle size={14} style={{ color: "var(--accent-verified)" }} />
          )}
          <span>{title}</span>
        </div>
        <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          Severity: <strong style={{ color: triggered ? "var(--accent-error)" : "inherit" }}>{severity.toFixed(2)}</strong>
        </div>
      </div>

      <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
        {message || (triggered ? "Rule constraint violated." : "Observation satisfies normal bounds.")}
      </p>

      {details && Object.keys(details).length > 0 && (
        <div style={{ marginTop: "6px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {Object.entries(details).map(([k, v]) => (
            <span key={k} style={{ marginRight: "10px" }}>
              {k}: <strong>{typeof v === "number" ? v.toFixed(2) : String(v)}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
