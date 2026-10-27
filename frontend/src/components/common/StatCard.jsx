import Tooltip from "./Tooltip";

export default function StatCard({ label, value, sub, tone = "neutral", infoText }) {
  const toneClass = `stat-${tone}`;

  return (
    <div className={`stat-card ${toneClass}`}>
      <div className="stat-card-label">
        <span>{label}</span>
        {infoText && <Tooltip text={infoText} />}
      </div>
      <div className="stat-card-value">
        {value !== undefined && value !== null ? value : "-"}
      </div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}
