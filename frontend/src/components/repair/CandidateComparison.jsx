import { Check } from "lucide-react";

export default function CandidateComparison({ dataRepair }) {
  if (!dataRepair) {
    return <div className="text-muted" style={{ fontSize: "12px" }}>No data repair strategies proposed.</div>;
  }

  const {
    originalValue,
    proposedValue,
    confidenceScore = 0.95,
    repairStrategy = "composite_optimal",
    alternativeCandidates = [],
  } = dataRepair;

  const STRATEGY_LABELS = {
    composite_optimal: "Composite Optimal Selection",
    historical_interpolation: "Historical Linear Interpolation",
    rolling_statistical_estimation: "Rolling Diurnal Median",
    peer_consensus_estimation: "Spatial Peer Consensus",
    physical_boundary_clamp: "Physical Domain Boundary Clamp",
  };

  return (
    <div>
      {/* Before vs After Callout Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        <div style={{ padding: "10px", backgroundColor: "var(--accent-error-bg)", border: "1px solid var(--accent-error)", borderRadius: "var(--radius-sm)" }}>
          <div style={{ fontSize: "11px", color: "var(--accent-error)", textTransform: "uppercase" }}>Corrupted Original</div>
          <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-error)", marginTop: "2px" }}>
            {originalValue !== undefined ? originalValue : "-"}
          </div>
        </div>

        <div style={{ padding: "10px", backgroundColor: "var(--accent-verified-bg)", border: "1px solid var(--accent-verified)", borderRadius: "var(--radius-sm)" }}>
          <div style={{ fontSize: "11px", color: "var(--accent-verified)", textTransform: "uppercase" }}>Healed Replacement</div>
          <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-verified)", marginTop: "2px" }}>
            {proposedValue !== undefined ? proposedValue : "-"}
          </div>
        </div>

        <div style={{ padding: "10px", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Candidate Confidence</div>
          <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "2px" }}>
            {(confidenceScore * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Selected Strategy Banner */}
      <div style={{ padding: "8px 12px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: "12px", fontSize: "12px" }}>
        Selected Strategy: <strong>{STRATEGY_LABELS[repairStrategy] || repairStrategy}</strong>
      </div>

      {/* Candidate Alternatives Table */}
      {alternativeCandidates && alternativeCandidates.length > 0 && (
        <div className="table-container">
          <table className="table" aria-label="Alternative repair candidate strategies">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Candidate Value</th>
                <th>Confidence Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {alternativeCandidates.map((c, idx) => {
                const isSelected = c.strategy === repairStrategy || idx === 0;
                return (
                  <tr key={idx} style={{ backgroundColor: isSelected ? "var(--bg-secondary)" : "transparent" }}>
                    <td>
                      <span style={{ fontWeight: isSelected ? 600 : 400 }}>
                        {STRATEGY_LABELS[c.strategy] || c.strategy}
                      </span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      {typeof c.value === "number" ? c.value.toFixed(2) : String(c.value)}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {c.confidence ? `${(c.confidence * 100).toFixed(1)}%` : "-"}
                    </td>
                    <td>
                      {isSelected ? (
                        <span style={{ fontSize: "11px", color: "var(--accent-verified)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                          <Check size={12} />
                          <span>OPTIMAL</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Candidate</span>
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
  );
}
