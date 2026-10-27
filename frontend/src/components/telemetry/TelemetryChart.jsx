import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { useSelector } from "react-redux";

export default function TelemetryChart({
  data = [],
  metricKey = "value",
  minBound = null,
  maxBound = null,
  unit = "°C",
  height = 280,
}) {
  const { theme } = useSelector((s) => s.ui);
  const isDark = theme === "dark";

  const gridColor = isDark ? "#262626" : "#EAEAEA";
  const textColor = isDark ? "#A3A3A3" : "#666666";
  const lineColor = isDark ? "#438DFF" : "#1A68D6";
  const tooltipBg = isDark ? "#171717" : "#FFFFFF";
  const tooltipBorder = isDark ? "#333333" : "#DEDEDE";

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: `${height}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "13px",
          border: "1px dashed var(--border-color)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        No telemetry observations available for the selected sensor window.
      </div>
    );
  }

  // Format data with human timestamps
  const formatted = data.map((d) => ({
    ...d,
    timeLabel: d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : "-",
    plotValue: typeof d[metricKey] === "number" ? d[metricKey] : d.values?.value ?? 0,
    isAnomaly: d.classification === "suspicious" || d.classification === "invalid" || d.isAnomaly,
    classification: d.classification || "valid",
  }));

  // Custom Dot renderer highlighting anomalies
  const renderCustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (payload.classification === "invalid") {
      return (
        <circle
          key={`dot-${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={5}
          fill="var(--accent-error)"
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />
      );
    }
    if (payload.classification === "suspicious") {
      return (
        <circle
          key={`dot-${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={4.5}
          fill="var(--accent-anomaly)"
          stroke="#FFFFFF"
          strokeWidth={1.5}
        />
      );
    }
    return null; // Don't clutter normal points with large dots
  };

  return (
    <div style={{ width: "100%", height: `${height}px` }}>
      <ResponsiveContainer>
        <LineChart data={formatted} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="timeLabel"
            stroke={textColor}
            tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickLine={false}
          />
          <YAxis
            stroke={textColor}
            tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
              borderRadius: "4px",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              color: isDark ? "#F5F5F5" : "#171717",
            }}
            formatter={(val, name, item) => [
              `${val} ${unit} (${item.payload.classification.toUpperCase()})`,
              "Reading",
            ]}
          />

          {/* Reference thresholds */}
          {minBound !== null && (
            <ReferenceLine
              y={minBound}
              stroke="var(--accent-error)"
              strokeDasharray="4 4"
              label={{ value: `Min (${minBound}${unit})`, fill: "var(--text-muted)", fontSize: 10, position: "insideBottomLeft" }}
            />
          )}
          {maxBound !== null && (
            <ReferenceLine
              y={maxBound}
              stroke="var(--accent-error)"
              strokeDasharray="4 4"
              label={{ value: `Max (${maxBound}${unit})`, fill: "var(--text-muted)", fontSize: 10, position: "insideTopLeft" }}
            />
          )}

          <Line
            type="monotone"
            dataKey="plotValue"
            stroke={lineColor}
            strokeWidth={1.8}
            dot={renderCustomDot}
            activeDot={{ r: 6, fill: lineColor, stroke: "#FFFFFF", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
