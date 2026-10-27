/**
 * Sidebar.jsx - Premium redesigned navigation with section groups,
 * active state accents, hover micro-animations, and collapsible support.
 */

import { NavLink, Link } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import {
  LayoutDashboard,
  Activity,
  AlertTriangle,
  Wrench,
  GitFork,
  BarChart2,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Home,
  Layers,
} from "lucide-react";
import { toggleSidebar } from "../../features/ui/uiSlice";

const NAV_GROUPS = [
  {
    label: "Operations",
    items: [
      { path: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
      { path: "/live", label: "Live Telemetry", icon: Activity },
      { path: "/anomalies", label: "Anomaly Explorer", icon: AlertTriangle },
      { path: "/repairs", label: "Repair Center", icon: Wrench },
    ],
  },
  {
    label: "Insights",
    items: [
      { path: "/pipeline", label: "Pipeline Map", icon: GitFork },
      { path: "/analytics", label: "Analytics & ML", icon: BarChart2 },
      { path: "/audit", label: "Audit & Registry", icon: BookOpen },
    ],
  },
  {
    label: "System",
    items: [
      { path: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const dispatch = useDispatch();
  const { sidebarCollapsed, dataMode } = useSelector((s) => s.ui);

  return (
    <aside
      className={`sidebar${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      aria-label="Application navigation"
    >
      {/* ── Brand ─────────────────────────────────────────────────────── */}
      <div className="sidebar-brand">
        <Link
          to="/"
          title="REFORGE Home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            textDecoration: "none",
            color: "inherit",
            minWidth: 0,
          }}
        >
          <span className="brand-badge" aria-hidden="true">R</span>
          {!sidebarCollapsed && <span>REFORGE</span>}
        </Link>
      </div>

      {/* ── Navigation Groups ─────────────────────────────────────────── */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_GROUPS.map(({ label, items }) => (
          <div key={label}>
            {!sidebarCollapsed && (
              <div className="nav-section-label">{label}</div>
            )}
            {items.map(({ path, label: itemLabel, icon: Icon, end }) => (
              <NavLink
                key={path}
                to={path}
                end={end}
                className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                title={sidebarCollapsed ? itemLabel : undefined}
              >
                <Icon size={16} strokeWidth={1.75} />
                {!sidebarCollapsed && <span>{itemLabel}</span>}
              </NavLink>
            ))}
          </div>
        ))}

        {/* Landing page shortcut */}
        {!sidebarCollapsed && (
          <div style={{ marginTop: "auto", paddingTop: "8px" }}>
            <Link
              to="/"
              className="nav-item"
              style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}
            >
              <Home size={14} strokeWidth={1.75} />
              <span>← Back to Product Page</span>
            </Link>
          </div>
        )}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="sidebar-footer">
        {/* Data mode indicator */}
        {!sidebarCollapsed && (
          <div className={`data-mode-indicator ${dataMode === "demo" ? "data-mode-demo" : "data-mode-live"}`}>
            <span className={`mode-dot ${dataMode === "demo" ? "mode-dot-demo" : "mode-dot-live"}`} />
            {dataMode === "demo" ? "DEMO MODE" : "LIVE BACKEND"}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="btn btn-ghost btn-sm"
          style={{
            width: "100%",
            justifyContent: sidebarCollapsed ? "center" : "space-between",
            color: "var(--text-muted)",
            gap: "8px",
          }}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
        >
          {!sidebarCollapsed && <span style={{ fontSize: "var(--text-xs)" }}>Collapse</span>}
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}
