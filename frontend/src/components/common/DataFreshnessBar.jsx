import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RefreshCw, Play, Pause } from "lucide-react";
import { setPollingInterval } from "../../features/ui/uiSlice";

export default function DataFreshnessBar({ onRefresh, lastFetchedAt, loading }) {
  const dispatch = useDispatch();
  const { pollingInterval, dataMode } = useSelector((s) => s.ui);
  const [secondsRemaining, setSecondsRemaining] = useState(pollingInterval / 1000);

  useEffect(() => {
    if (pollingInterval <= 0) return;
    setSecondsRemaining(pollingInterval / 1000);

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (onRefresh) onRefresh({ silent: true });
          return pollingInterval / 1000;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pollingInterval, onRefresh]);

  function handleRateChange(e) {
    const val = parseInt(e.target.value, 10);
    dispatch(setPollingInterval(val));
    setSecondsRemaining(val > 0 ? val / 1000 : 0);
  }

  function handleTogglePause() {
    if (pollingInterval > 0) {
      dispatch(setPollingInterval(0));
    } else {
      dispatch(setPollingInterval(10000));
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "var(--text-muted)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: dataMode === "demo" ? "var(--accent-anomaly)" : "var(--accent-verified)",
            display: "inline-block",
          }}
        />
        <span>{dataMode === "demo" ? "Demo" : "Live"}</span>
      </div>

      <span>•</span>

      {pollingInterval > 0 ? (
        <span>Next refresh in <strong>{secondsRemaining}s</strong></span>
      ) : (
        <span>Polling paused</span>
      )}

      <button
        onClick={handleTogglePause}
        className="btn btn-secondary btn-sm"
        title={pollingInterval > 0 ? "Pause auto-refresh" : "Resume 10s auto-refresh"}
        style={{ padding: "2px 6px" }}
      >
        {pollingInterval > 0 ? <Pause size={12} /> : <Play size={12} />}
      </button>

      <select
        className="select"
        value={pollingInterval}
        onChange={handleRateChange}
        style={{ padding: "2px 6px", fontSize: "11px", height: "24px" }}
      >
        <option value={5000}>5s poll</option>
        <option value={10000}>10s poll</option>
        <option value={30000}>30s poll</option>
        <option value={0}>Manual only</option>
      </select>

      <button
        onClick={() => onRefresh && onRefresh({ silent: false })}
        disabled={loading}
        className="btn btn-secondary btn-sm"
        title="Immediate refresh"
        style={{ padding: "2px 8px", height: "24px" }}
      >
        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        <span>Refresh</span>
      </button>
    </div>
  );
}
