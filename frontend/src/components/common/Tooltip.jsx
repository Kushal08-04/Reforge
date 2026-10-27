import { useState } from "react";
import { HelpCircle } from "lucide-react";

export default function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      tabIndex={0}
      role="tooltip"
      aria-label={text}
    >
      {children || <HelpCircle size={12} style={{ color: "var(--text-muted)", cursor: "help", marginLeft: "4px" }} />}
      {visible && (
        <span
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "6px",
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-sm)",
            padding: "5px 9px",
            fontSize: "11px",
            lineHeight: "1.4",
            whiteSpace: "normal",
            width: "220px",
            textAlign: "left",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
