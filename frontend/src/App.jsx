import { Routes, Route, Navigate, Link } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import LandingPage from "./pages/LandingPage";
import OverviewPage from "./pages/OverviewPage";
import LiveMonitoringPage from "./pages/LiveMonitoringPage";
import AnomalyExplorerPage from "./pages/AnomalyExplorerPage";
import RepairOperationsPage from "./pages/RepairOperationsPage";
import PipelineMapPage from "./pages/PipelineMapPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import SettingsPage from "./pages/SettingsPage";
import { AlertTriangle, ArrowLeft } from "lucide-react";

function NotFoundPage() {
  return (
    <div className="page flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="card max-w-md p-8 border border-border">
        <div className="flex justify-center mb-4 text-warning">
          <AlertTriangle size={36} />
        </div>
        <h1 className="text-lg font-bold font-mono uppercase mb-2">404: Route Not Found</h1>
        <p className="text-xs text-secondary mb-6 leading-relaxed">
          The requested route does not correspond to an active module in the REFORGE validation pipeline.
        </p>
        <Link to="/dashboard" className="btn btn-primary inline-flex items-center gap-2">
          <ArrowLeft size={14} />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* ── Public Landing Page (no AppShell) ─────────────────────── */}
      <Route path="/" element={<LandingPage />} />

      {/* ── Authenticated Application Shell ───────────────────────── */}
      <Route
        path="/dashboard"
        element={<AppShell><OverviewPage /></AppShell>}
      />
      <Route
        path="/live"
        element={<AppShell><LiveMonitoringPage /></AppShell>}
      />
      <Route
        path="/anomalies"
        element={<AppShell><AnomalyExplorerPage /></AppShell>}
      />
      <Route
        path="/repairs"
        element={<AppShell><RepairOperationsPage /></AppShell>}
      />
      <Route
        path="/repairs/:id"
        element={<AppShell><RepairOperationsPage /></AppShell>}
      />
      <Route
        path="/pipeline"
        element={<AppShell><PipelineMapPage /></AppShell>}
      />
      <Route
        path="/analytics"
        element={<AppShell><AnalyticsPage /></AppShell>}
      />
      <Route
        path="/audit"
        element={<AppShell><AuditLogsPage /></AppShell>}
      />
      <Route
        path="/audit/:rawObservationId"
        element={<AppShell><AuditLogsPage /></AppShell>}
      />
      <Route
        path="/settings"
        element={<AppShell><SettingsPage /></AppShell>}
      />

      {/* ── Legacy & Alias Redirects ───────────────────────────────── */}
      <Route path="/overview" element={<Navigate to="/dashboard" replace />} />
      <Route path="/quarantine" element={<Navigate to="/anomalies" replace />} />
      <Route path="/quarantine/:id" element={<AppShell><AnomalyExplorerPage /></AppShell>} />
      <Route path="/comparison" element={<Navigate to="/analytics" replace />} />
      <Route path="/evaluation" element={<Navigate to="/analytics" replace />} />
      <Route path="/models" element={<Navigate to="/audit" replace />} />

      {/* ── 404 Fallback ──────────────────────────────────────────── */}
      <Route path="*" element={<AppShell><NotFoundPage /></AppShell>} />
    </Routes>
  );
}
