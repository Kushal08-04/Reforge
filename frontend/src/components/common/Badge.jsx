export default function Badge({ tone = "neutral", children, icon: Icon, className = "" }) {
  const toneClass = `badge-${tone}`;
  return (
    <span className={`badge ${toneClass} ${className}`}>
      {Icon && <Icon size={12} className="inline-block" />}
      {children}
    </span>
  );
}
