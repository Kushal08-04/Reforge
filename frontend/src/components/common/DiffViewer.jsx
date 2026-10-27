export default function DiffViewer({ diff, targetFile }) {
  if (!diff) {
    return (
      <div className="diff-container text-muted">
        No code diff available for this proposal.
      </div>
    );
  }

  const lines = diff.split("\n");

  return (
    <div>
      {targetFile && (
        <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px", fontFamily: "var(--font-mono)" }}>
          Target: <strong>{targetFile}</strong>
        </div>
      )}
      <div className="diff-container">
        {lines.map((line, idx) => {
          let lineClass = "";
          if (line.startsWith("+") && !line.startsWith("+++")) {
            lineClass = "diff-add";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            lineClass = "diff-del";
          }
          return (
            <div key={idx} className={lineClass}>
              {line || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}
