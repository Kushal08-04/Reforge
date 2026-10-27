/**
 * AnimatedPipeline.jsx
 * Animated SVG pipeline visualization for the landing page hero.
 * Uses CSS animations - no JS dependency for the core animation loop.
 * All data is illustrative and explicitly labelled as DEMO.
 */

import { useState, useEffect } from "react";

const STAGES = [
  { id: "ingest", label: "Telemetry", sub: "Ingestion", x: 60, color: "#438DFF" },
  { id: "validate", label: "Rule", sub: "Validation", x: 200, color: "#A78BFA" },
  { id: "ml", label: "ML Anomaly", sub: "Detection", x: 340, color: "#FF9F43" },
  { id: "decision", label: "Decision", sub: "Engine", x: 480, color: "#438DFF" },
  { id: "sandbox", label: "Sandboxed", sub: "Repair", x: 620, color: "#36C878" },
  { id: "verify", label: "Post-Repair", sub: "Verification", x: 760, color: "#36C878" },
];

// Data packet colors by classification state
const PACKET_STYLES = {
  valid: { fill: "#36C878", shadow: "rgba(54,200,120,0.5)" },
  anomaly: { fill: "#FF9F43", shadow: "rgba(255,159,67,0.5)" },
  repairing: { fill: "#438DFF", shadow: "rgba(67,141,255,0.5)" },
  verified: { fill: "#36C878", shadow: "rgba(54,200,120,0.8)" },
};

export default function AnimatedPipeline() {
  const [tick, setTick] = useState(0);
  const [packets, setPackets] = useState([
    { id: 1, progress: 0.0, type: "valid", speed: 0.003 },
    { id: 2, progress: 0.25, type: "anomaly", speed: 0.0025 },
    { id: 3, progress: 0.55, type: "repairing", speed: 0.0028 },
    { id: 4, progress: 0.78, type: "verified", speed: 0.003 },
  ]);

  useEffect(() => {
    let raf;
    let last = performance.now();
    let pkts = [...packets];
    let nextId = 10;

    function loop(now) {
      const dt = Math.min(now - last, 32);
      last = now;

      pkts = pkts.map(p => {
        const np = p.progress + p.speed * dt;
        if (np >= 1) {
          // Recycle with random type
          const types = ["valid", "valid", "anomaly", "repairing", "verified"];
          return {
            id: nextId++,
            progress: 0,
            type: types[Math.floor(Math.random() * types.length)],
            speed: 0.0022 + Math.random() * 0.0012,
          };
        }
        return { ...p, progress: np };
      });

      setPackets([...pkts]);
      setTick(t => t + 1);
      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const W = 860;
  const H = 320;
  const NODE_R = 30;
  const PATH_Y = H / 2;
  const NODE_Y = PATH_Y;

  // Map progress [0,1] to x coordinate along the pipeline
  const progressToX = (p) => {
    const startX = STAGES[0].x;
    const endX = STAGES[STAGES.length - 1].x;
    return startX + p * (endX - startX);
  };

  // Determine which stage a packet is approaching
  const packetStage = (progress) => {
    const idx = Math.min(
      STAGES.length - 1,
      Math.floor(progress * STAGES.length)
    );
    return STAGES[idx];
  };

  return (
    <div style={{ position: "relative", width: "100%", height: H + "px", userSelect: "none" }}>
      {/* Demo label */}
      <div style={{
        position: "absolute",
        top: 8,
        right: 10,
        fontSize: "10px",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        letterSpacing: "0.1em",
        color: "var(--text-muted)",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-full)",
        padding: "2px 10px",
        textTransform: "uppercase",
        zIndex: 10,
      }}>
        Illustrative Animation
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        style={{ overflow: "visible" }}
        aria-label="Animated pipeline diagram showing data flowing through REFORGE stages"
        role="img"
      >
        <defs>
          {STAGES.map(s => (
            <radialGradient key={s.id} id={`glow-${s.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </radialGradient>
          ))}
          <filter id="blur-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background grid lines */}
        {[80, 140, 200, 260].map(y => (
          <line key={y} x1={STAGES[0].x} y1={y} x2={STAGES[STAGES.length - 1].x} y2={y}
            stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="3 8" />
        ))}

        {/* Main pipeline path */}
        <line
          x1={STAGES[0].x} y1={PATH_Y}
          x2={STAGES[STAGES.length - 1].x} y2={PATH_Y}
          stroke="var(--border-color)"
          strokeWidth="2"
        />

        {/* Animated glow on pipeline */}
        <line
          x1={STAGES[0].x} y1={PATH_Y}
          x2={STAGES[STAGES.length - 1].x} y2={PATH_Y}
          stroke="var(--accent-telemetry)"
          strokeWidth="1.5"
          strokeOpacity="0.25"
        />

        {/* Node glow halos */}
        {STAGES.map(s => (
          <circle key={`halo-${s.id}`}
            cx={s.x} cy={NODE_Y} r={NODE_R + 18}
            fill={`url(#glow-${s.id})`}
            opacity="0.6"
          />
        ))}

        {/* Stage nodes */}
        {STAGES.map((s, i) => (
          <g key={s.id}>
            {/* Connector line to next */}
            {i < STAGES.length - 1 && (
              <line
                x1={s.x + NODE_R} y1={NODE_Y}
                x2={STAGES[i + 1].x - NODE_R} y2={NODE_Y}
                stroke="var(--border-color)"
                strokeWidth="1.5"
              />
            )}

            {/* Node circle */}
            <circle cx={s.x} cy={NODE_Y} r={NODE_R}
              fill="var(--bg-panel)"
              stroke={s.color}
              strokeWidth="2"
            />

            {/* Inner accent */}
            <circle cx={s.x} cy={NODE_Y} r={NODE_R - 8}
              fill={s.color}
              fillOpacity="0.12"
            />

            {/* Stage number */}
            <text x={s.x} y={NODE_Y + 5}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fontFamily="var(--font-mono)"
              fill={s.color}
            >
              {i + 1}
            </text>

            {/* Label above */}
            <text x={s.x} y={NODE_Y - NODE_R - 18}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fontFamily="var(--font-sans)"
              fill="var(--text-primary)"
            >
              {s.label}
            </text>

            {/* Sub label */}
            <text x={s.x} y={NODE_Y - NODE_R - 5}
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-mono)"
              fill="var(--text-muted)"
            >
              {s.sub}
            </text>
          </g>
        ))}

        {/* Animated packets */}
        {packets.map(p => {
          const x = progressToX(p.progress);
          const style = PACKET_STYLES[p.type] || PACKET_STYLES.valid;
          const stage = packetStage(p.progress);

          return (
            <g key={p.id}>
              {/* Shadow / glow */}
              <circle cx={x} cy={PATH_Y} r={12}
                fill={style.shadow}
                opacity="0.3"
                filter="url(#blur-glow)"
              />
              {/* Packet */}
              <circle cx={x} cy={PATH_Y} r={6}
                fill={style.fill}
                opacity="0.92"
              />
            </g>
          );
        })}
      </svg>

      {/* Stage labels at bottom */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "space-between",
        padding: "0 20px",
      }}>
        {STAGES.map(s => (
          <div key={s.id} style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.color, display: "inline-block" }} />
            <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
