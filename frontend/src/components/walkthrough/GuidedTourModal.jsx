import { useSelector, useDispatch } from "react-redux";
import Modal from "../common/Modal";
import { closeTour, setTourStep } from "../../features/ui/uiSlice";
import {
  Activity,
  AlertTriangle,
  Wrench,
  GitFork,
  FileText,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
} from "lucide-react";

const TOUR_STEPS = [
  {
    title: "1. System Overview & Health",
    icon: Activity,
    content:
      "REFORGE continually validates IoT telemetry against physical and statistical baselines. The Overview provides high-level throughput, agreement rates between deterministic rules and ML models, and recent incident logs.",
  },
  {
    title: "2. Live Telemetry Monitoring",
    icon: Activity,
    content:
      "Inspect individual sensor streams across zones. The charts plot observed values alongside expected physical bounds (PHYSICAL_SENSOR_BOUNDS) and cross-sensor spatial peers, highlighting anomalies with clear markers.",
  },
  {
    title: "3. Explainable Anomaly Investigation",
    icon: AlertTriangle,
    content:
      "Unlike black-box models, REFORGE generates human-readable evidence cards: Rate-of-Change, Historical Z-Score, Cross-Sensor Disagreement, and Implausible Jump. Inspect full feature snapshots before taking remediation actions.",
  },
  {
    title: "4. Sandbox-Isolated Self-Healing",
    icon: Wrench,
    content:
      "Quarantined records can be healed automatically in isolated sandboxes. Mode A evaluates 5 mathematical repair strategies (historical interpolation, rolling median, peer consensus, domain clamping, composite optimal). Patches are strictly verified before human approval.",
  },
  {
    title: "5. Audit Lineage & Model Registry",
    icon: FileText,
    content:
      "Every pipeline decision, review action, and patch execution writes an immutable, append-only audit trail. Export cleaned datasets as CSV, XLSX, or pure-JS generated binary PDF 1.4 reports, or push verified changes directly to GitHub.",
  },
];

export default function GuidedTourModal() {
  const dispatch = useDispatch();
  const { tourOpen, currentTourStep } = useSelector((s) => s.ui);

  if (!tourOpen) return null;

  const current = TOUR_STEPS[currentTourStep];
  const Icon = current.icon;
  const isLast = currentTourStep === TOUR_STEPS.length - 1;

  return (
    <Modal isOpen={tourOpen} onClose={() => dispatch(closeTour())} title="REFORGE Guided Walkthrough">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Step Indicator */}
        <div style={{ display: "flex", gap: "6px" }}>
          {TOUR_STEPS.map((_, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                height: "3px",
                borderRadius: "2px",
                backgroundColor: idx <= currentTourStep ? "var(--text-primary)" : "var(--border-color)",
                transition: "var(--transition)",
              }}
            />
          ))}
        </div>

        {/* Step Content */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 0" }}>
          <div
            style={{
              padding: "10px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
            }}
          >
            <Icon size={22} />
          </div>
          <div>
            <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
              {current.title}
            </h4>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {current.content}
            </p>
          </div>
        </div>

        {/* Navigation Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: "14px" }}>
          <button
            onClick={() => dispatch(closeTour())}
            className="btn btn-secondary btn-sm"
          >
            Dismiss
          </button>

          <div style={{ display: "flex", gap: "8px" }}>
            {currentTourStep > 0 && (
              <button
                onClick={() => dispatch(setTourStep(currentTourStep - 1))}
                className="btn btn-secondary btn-sm"
              >
                <ChevronLeft size={14} />
                <span>Previous</span>
              </button>
            )}

            {!isLast ? (
              <button
                onClick={() => dispatch(setTourStep(currentTourStep + 1))}
                className="btn btn-primary btn-sm"
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => dispatch(closeTour())}
                className="btn btn-primary btn-sm"
              >
                <CheckCircle size={14} />
                <span>Finish Tour</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
