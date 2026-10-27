import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  Settings,
  Shield,
  Sliders,
  Sun,
  Moon,
  RefreshCw,
  Server,
  Database,
  Cpu,
  Terminal,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Lock,
  Info,
  Clock,
  Layers,
  Trash2,
} from "lucide-react";
import Badge from "../components/common/Badge";
import Tooltip from "../components/common/Tooltip";
import {
  setTheme,
  switchDataMode,
  setPollingInterval,
} from "../features/ui/uiSlice";
import { fetchHealth, isDemoMode } from "../api/endpoints";

export default function SettingsPage() {
  const dispatch = useDispatch();
  const { theme, dataMode, pollingInterval } = useSelector((state) => state.ui);

  const [healthStatus, setHealthStatus] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState(null);
  const [lastPingTime, setLastPingTime] = useState(null);
  const [resetFeedback, setResetFeedback] = useState(false);

  async function checkMicroservices() {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const data = await fetchHealth();
      setHealthStatus(data);
      setLastPingTime(new Date().toLocaleTimeString());
    } catch (err) {
      setHealthError(err.message || "Failed to connect to backend server");
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    checkMicroservices();
  }, [dataMode]);

  function handleResetPreferences() {
    localStorage.removeItem("reforge_theme");
    localStorage.removeItem("reforge_sidebar_collapsed");
    localStorage.removeItem("reforge_data_mode");
    dispatch(setTheme("dark"));
    dispatch(switchDataMode("live"));
    dispatch(setPollingInterval(10000));
    setResetFeedback(true);
    setTimeout(() => setResetFeedback(false), 2500);
  }

  const pollingOptions = [
    { label: "5s (Aggressive)", value: 5000 },
    { label: "10s (Standard)", value: 10000 },
    { label: "30s (Relaxed)", value: 30000 },
    { label: "60s (Slow)", value: 60000 },
    { label: "Paused", value: 0 },
  ];

  return (
    <div className="page settings-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Settings size={22} /> System Configuration & Diagnostics
          </h1>
          <p className="page-description">
            Interface preferences, operational parameters, and real-time backend microservice status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={dataMode === "live" ? "success" : "warning"}
            size="md"
            icon={dataMode === "live" ? CheckCircle : AlertTriangle}
          >
            {dataMode === "live" ? "Live Mode Active" : "Demo Mode Active"}
          </Badge>
          <button
            className="btn btn-secondary btn-sm flex items-center gap-1"
            onClick={checkMicroservices}
            disabled={healthLoading}
          >
            <RefreshCw size={13} className={healthLoading ? "animate-spin" : ""} />
            Ping Services
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* SECTION 1: UI PREFERENCES */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="card-title flex items-center gap-2">
              <Sliders size={16} /> User Interface Preferences
            </h2>
            <Badge variant="outline" size="sm">Local Browser Storage</Badge>
          </div>
          <div className="card-body flex flex-col gap-5">
            {/* Theme Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Color Theme
                </label>
                <span className="text-xs text-muted font-mono capitalize">
                  Current: {theme}
                </span>
              </div>
              <p className="text-xs text-secondary mb-3">
                Select visual appearance. REFORGE adheres to high-contrast monochrome design guidelines in both palettes.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`btn flex items-center justify-center gap-2 ${
                    theme === "dark" ? "btn-primary" : "btn-secondary"
                  }`}
                  onClick={() => dispatch(setTheme("dark"))}
                >
                  <Moon size={15} /> Dark Observatory
                </button>
                <button
                  type="button"
                  className={`btn flex items-center justify-center gap-2 ${
                    theme === "light" ? "btn-primary" : "btn-secondary"
                  }`}
                  onClick={() => dispatch(setTheme("light"))}
                >
                  <Sun size={15} /> Clean Light
                </button>
              </div>
            </div>

            <hr className="border-border my-1" />

            {/* Polling Interval */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                  <Clock size={13} /> Background Polling Frequency
                </label>
                <span className="text-xs font-mono text-muted">
                  {pollingInterval === 0 ? "Paused" : `${pollingInterval / 1000}s`}
                </span>
              </div>
              <p className="text-xs text-secondary mb-3">
                Controls automatic data freshness synchronization across Overview and Live Telemetry pages.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {pollingOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`btn btn-xs ${
                      pollingInterval === opt.value ? "btn-primary" : "btn-secondary"
                    }`}
                    onClick={() => dispatch(setPollingInterval(opt.value))}
                  >
                    {opt.value === 0 ? "Pause" : `${opt.value / 1000}s`}
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-border my-1" />

            {/* Data Source Isolation Toggle */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                  <Layers size={13} /> Data Source Mode
                </label>
                <Badge variant={dataMode === "live" ? "success" : "warning"} size="sm">
                  {dataMode.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-secondary mb-3">
                Live Mode communicates with the backend API at <code className="font-mono text-xs">http://localhost:5000/api</code>.
                Demo Mode provides deterministic synthetic telemetry for offline inspection.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`btn text-xs ${dataMode === "live" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => dispatch(switchDataMode("live"))}
                >
                  Live Backend Mode
                </button>
                <button
                  type="button"
                  className={`btn text-xs ${dataMode === "demo" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => dispatch(switchDataMode("demo"))}
                >
                  Offline Demo Mode
                </button>
              </div>
            </div>

            <hr className="border-border my-1" />

            {/* Clear UI Preferences */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="text-xs font-medium text-primary">Reset Preferences</div>
                <div className="text-xs text-muted">Restore default dark theme, 10s polling, and live mode</div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-xs flex items-center gap-1 text-danger"
                onClick={handleResetPreferences}
              >
                <Trash2 size={12} /> Clear Cache
              </button>
            </div>
            {resetFeedback && (
              <p className="text-xs text-success font-mono">
                Preferences reset to factory defaults.
              </p>
            )}
          </div>
        </div>

        {/* SECTION 2: OPERATIONAL BACKEND PARAMETERS (READ-ONLY) */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="card-title flex items-center gap-2">
              <Shield size={16} /> Operational Governance & Constraints
            </h2>
            <Badge variant="outline" size="sm" icon={Lock}>
              Server Configured (Read-Only)
            </Badge>
          </div>
          <div className="card-body flex flex-col gap-4">
            <div className="p-3 bg-card-secondary border border-border rounded text-xs text-secondary leading-relaxed flex items-start gap-2">
              <Lock size={15} className="text-muted shrink-0 mt-0.5" />
              <div>
                Operational safety parameters and decision thresholds are enforced on the backend via environment variables (e.g. <code className="font-mono text-xs">DECISION_MODE</code>, <code className="font-mono text-xs">RISK_THRESHOLDS</code>). They cannot be modified from the client to prevent circumvention of data integrity guarantees.
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 bg-card border border-border rounded">
                <div>
                  <div className="text-xs font-semibold text-primary">Active Decision Engine</div>
                  <div className="text-xs text-muted">Validation framework orchestration mode</div>
                </div>
                <div className="text-right">
                  <Badge variant="primary" size="sm">HYBRID MODE</Badge>
                  <div className="text-[10px] text-muted font-mono mt-0.5">Rules + ML Arbitration</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-card border border-border rounded">
                <div>
                  <div className="text-xs font-semibold text-primary">Suspicious Risk Threshold</div>
                  <div className="text-xs text-muted">Triggers telemetry quarantine for review</div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-warning">0.30</span>
                  <div className="text-[10px] text-muted font-mono mt-0.5">Score &gt; 0.30</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-card border border-border rounded">
                <div>
                  <div className="text-xs font-semibold text-primary">Critical / Invalid Threshold</div>
                  <div className="text-xs text-muted">Triggers hard isolation &amp; auto-repair proposal</div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-danger">0.60</span>
                  <div className="text-[10px] text-muted font-mono mt-0.5">Score &gt; 0.60</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-card border border-border rounded">
                <div>
                  <div className="text-xs font-semibold text-primary">Primary ML Algorithm</div>
                  <div className="text-xs text-muted">Unsupervised spatial-temporal anomaly detector</div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs text-primary">Isolation Forest + DBSCAN</span>
                  <div className="text-[10px] text-muted font-mono mt-0.5">Contamination: 0.05</div>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-card border border-border rounded">
                <div>
                  <div className="text-xs font-semibold text-primary">Docker Sandbox Constraints</div>
                  <div className="text-xs text-muted">Execution limits for Mode B code patches</div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs text-secondary">30s cap / 256MB RAM</span>
                  <div className="text-[10px] text-muted font-mono mt-0.5">Zero Network Egress</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: SYSTEM MICROSERVICES & HEALTH */}
        <div className="card md:col-span-2">
          <div className="card-header flex items-center justify-between">
            <h2 className="card-title flex items-center gap-2">
              <Server size={16} /> Microservices &amp; Infrastructure Health
            </h2>
            <div className="flex items-center gap-2">
              {lastPingTime && (
                <span className="text-xs text-muted font-mono">
                  Last checked: {lastPingTime}
                </span>
              )}
              <Badge
                variant={healthStatus?.status === "ok" ? "success" : healthError ? "danger" : "outline"}
                size="sm"
              >
                {healthStatus?.status === "ok" ? "All Systems Operational" : healthError ? "Connectivity Issue" : "Checking..."}
              </Badge>
            </div>
          </div>
          <div className="card-body">
            {healthError && (
              <div className="p-3 mb-4 bg-danger/10 border border-danger/30 rounded text-xs text-danger flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle size={15} />
                  <span><strong>Connection Error:</strong> {healthError}</span>
                </div>
                <span className="text-muted font-mono">Ensure Express is running on :5000</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Service 1: Express Server */}
              <div className="p-3 bg-card border border-border rounded flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-primary" />
                    <span className="text-xs font-semibold text-primary">Core API</span>
                  </div>
                  <Badge
                    variant={healthStatus?.status === "ok" ? "success" : healthError ? "danger" : "outline"}
                    size="xs"
                  >
                    {healthStatus?.status === "ok" ? "ONLINE" : healthError ? "OFFLINE" : "PENDING"}
                  </Badge>
                </div>
                <div className="text-xs text-muted font-mono mb-1">Express.js (:5000)</div>
                <div className="text-[11px] text-secondary">
                  Ingestion, Validation, Decision Engine &amp; REST routing
                </div>
              </div>

              {/* Service 2: Database */}
              <div className="p-3 bg-card border border-border rounded flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-primary" />
                    <span className="text-xs font-semibold text-primary">Persistence</span>
                  </div>
                  <Badge
                    variant={healthStatus?.database?.state === "connected" ? "success" : "outline"}
                    size="xs"
                  >
                    {healthStatus?.database?.state === "connected" ? "CONNECTED" : "IN-MEMORY/READY"}
                  </Badge>
                </div>
                <div className="text-xs text-muted font-mono mb-1">MongoDB / Store</div>
                <div className="text-[11px] text-secondary">
                  Telemetry logs, quarantine records, repair proposals
                </div>
              </div>

              {/* Service 3: ML Microservice */}
              <div className="p-3 bg-card border border-border rounded flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu size={16} className="text-primary" />
                    <span className="text-xs font-semibold text-primary">ML Service</span>
                  </div>
                  <Badge variant="outline" size="xs">
                    {dataMode === "demo" ? "DEMO STUB" : "HEALTHY"}
                  </Badge>
                </div>
                <div className="text-xs text-muted font-mono mb-1">FastAPI Python (:8000)</div>
                <div className="text-[11px] text-secondary">
                  Unsupervised scoring, model retraining, calibration
                </div>
              </div>

              {/* Service 4: Docker Sandbox */}
              <div className="p-3 bg-card border border-border rounded flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Terminal size={16} className="text-primary" />
                    <span className="text-xs font-semibold text-primary">Sandbox Runner</span>
                  </div>
                  <Badge variant="outline" size="xs">
                    ISOLATED
                  </Badge>
                </div>
                <div className="text-xs text-muted font-mono mb-1">sandbox/runner.js</div>
                <div className="text-[11px] text-secondary">
                  Deterministic container execution of Mode B patches
                </div>
              </div>
            </div>

            {/* Health Payload Details */}
            {healthStatus && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-xs font-semibold text-secondary mb-2 flex items-center justify-between">
                  <span>Diagnostic Health Response:</span>
                  <span className="font-mono text-[10px] text-muted">
                    Response format: application/json
                  </span>
                </div>
                <pre className="p-3 bg-card-secondary border border-border rounded text-[11px] font-mono text-muted overflow-x-auto">
                  {JSON.stringify(healthStatus, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
