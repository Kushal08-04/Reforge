/**
 * AppHeader.jsx - Upgraded application header with better typography,
 * cleaner data-mode switcher, improved breadcrumb, and refined controls.
 */

import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";
import {
  Sun, Moon, HelpCircle, Upload, Database, Radio,
  ChevronRight,
} from "lucide-react";
import { toggleTheme, switchDataMode, openTour } from "../../features/ui/uiSlice";
import IngestModal from "../modals/IngestModal";
import Badge from "../common/Badge";

const ROUTE_META = {
  "/dashboard": { title: "Overview", parent: "Operations" },
  "/live": { title: "Live Telemetry", parent: "Operations" },
  "/anomalies": { title: "Anomaly Explorer", parent: "Operations" },
  "/repairs": { title: "Repair Center", parent: "Operations" },
  "/pipeline": { title: "Pipeline Map", parent: "Insights" },
  "/analytics": { title: "Analytics & ML", parent: "Insights" },
  "/audit": { title: "Audit & Registry", parent: "Insights" },
  "/settings": { title: "Settings", parent: "System" },
};

export default function AppHeader() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { theme, dataMode } = useSelector((s) => s.ui);
  const dashboardData = useSelector((s) => s.dashboard.data);
  const [ingestModalOpen, setIngestModalOpen] = useState(false);

  const meta = ROUTE_META[location.pathname] || { title: "REFORGE", parent: "Platform" };
  const validationMode = dashboardData?.systemStatus?.validationMode || "shadow";

  return (
    <>
      <header className="app-header">
        {/* ── Left: Breadcrumb & Mode Badge ─────────────────────────── */}
        <div className="header-left" style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 500, flexShrink: 0 }}>
            {meta.parent}
          </span>
          <ChevronRight size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <span style={{
            fontSize: "var(--text-sm)",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {meta.title}
          </span>
          <Badge
            tone={validationMode === "hybrid" ? "telemetry" : "neutral"}
            style={{ flexShrink: 0 }}
          >
            {validationMode.toUpperCase()}
          </Badge>
        </div>

        {/* ── Right: Controls ────────────────────────────────────────── */}
        <div className="header-right">
          {/* Inject Dataset */}
          <button
            onClick={() => setIngestModalOpen(true)}
            className="btn btn-secondary btn-sm"
            title="Inject test observation or batch dataset"
          >
            <Upload size={13} strokeWidth={2} />
            <span>Inject</span>
          </button>

          {/* Data Mode Switcher */}
          <div style={{
            display: "flex",
            alignItems: "center",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
          }} role="group" aria-label="Data mode">
            <button
              onClick={() => dispatch(switchDataMode("live"))}
              title="Connect to actual local/remote backend"
              aria-pressed={dataMode === "live"}
              style={{
                padding: "4px 10px",
                fontSize: "var(--text-xs)",
                fontWeight: dataMode === "live" ? 700 : 500,
                border: "none",
                cursor: "pointer",
                background: dataMode === "live" ? "var(--bg-panel)" : "transparent",
                color: dataMode === "live" ? "var(--accent-verified)" : "var(--text-muted)",
                display: "flex", alignItems: "center", gap: "5px",
                transition: "all var(--duration-base) var(--ease-out)",
                borderRight: "1px solid var(--border-color)",
              }}
            >
              <Radio size={11} />
              <span>Live</span>
            </button>
            <button
              onClick={() => dispatch(switchDataMode("demo"))}
              title="Run with deterministic offline test scenarios"
              aria-pressed={dataMode === "demo"}
              style={{
                padding: "4px 10px",
                fontSize: "var(--text-xs)",
                fontWeight: dataMode === "demo" ? 700 : 500,
                border: "none",
                cursor: "pointer",
                background: dataMode === "demo" ? "var(--accent-anomaly-dim)" : "transparent",
                color: dataMode === "demo" ? "var(--accent-anomaly)" : "var(--text-muted)",
                display: "flex", alignItems: "center", gap: "5px",
                transition: "all var(--duration-base) var(--ease-out)",
              }}
            >
              <Database size={11} />
              <span>Demo</span>
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => dispatch(toggleTheme())}
            className="btn btn-secondary btn-sm"
            style={{ padding: "5px 9px" }}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            aria-label="Toggle color theme"
          >
            {theme === "dark" ? <Sun size={14} strokeWidth={1.75} /> : <Moon size={14} strokeWidth={1.75} />}
          </button>

          {/* Tour */}
          <button
            onClick={() => dispatch(openTour())}
            className="btn btn-secondary btn-sm"
            style={{ padding: "5px 9px" }}
            title="Start guided platform tour"
            aria-label="Start guided tour"
          >
            <HelpCircle size={14} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <IngestModal isOpen={ingestModalOpen} onClose={() => setIngestModalOpen(false)} />
    </>
  );
}
