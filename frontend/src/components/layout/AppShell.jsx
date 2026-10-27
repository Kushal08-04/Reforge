import { useSelector, useDispatch } from "react-redux";
import Sidebar from "./Sidebar";
import AppHeader from "./AppHeader";
import GuidedTourModal from "../walkthrough/GuidedTourModal";
import { switchDataMode } from "../../features/ui/uiSlice";
import { AlertTriangle, Database } from "lucide-react";

export default function AppShell({ children }) {
  const dispatch = useDispatch();
  const { dataMode } = useSelector((s) => s.ui);

  return (
    <div className="app-container">
      {/* Collapsible Sidebar */}
      <Sidebar />

      {/* Main Execution Area */}
      <div className="main-wrapper">
        {/* Prominent High-Contrast Demo Banner (Only visible in explicit Demo Mode) */}
        {dataMode === "demo" && (
          <div className="demo-banner" role="alert">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertTriangle size={14} />
              <span>
                <strong>DEMO DATA MODE ACTIVE</strong> - Production backend calls are paused. Displaying deterministic benchmark scenarios.
              </span>
            </div>
            <button
              onClick={() => dispatch(switchDataMode("live"))}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "11px", padding: "2px 8px" }}
            >
              Switch to Live Backend
            </button>
          </div>
        )}

        {/* Global Application Header */}
        <AppHeader />

        {/* Primary Content Scroll Area */}
        <main className="content-scrollable">
          {children}
        </main>
      </div>

      {/* Guided Walkthrough Tour Modal */}
      <GuidedTourModal />
    </div>
  );
}
