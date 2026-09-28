export default function ClassificationBadge({ classification }) {
  const cls = classification || "pending";
  return <span className={`badge badge-${cls}`}>{cls}</span>;
}
