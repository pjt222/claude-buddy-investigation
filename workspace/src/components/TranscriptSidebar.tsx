import { useEffect, useRef, useState } from "react";
import type { TranscriptEntry } from "../../shared/protocol";

const SOURCE_COLORS: Record<string, string> = {
  user: "var(--v9)",
  claude: "var(--v7)",
  bubble: "var(--v6)",
  bootstrapped: "var(--v4)",
};

function sourceColor(entry: TranscriptEntry): string {
  if (entry.source === "buddy") {
    return SOURCE_COLORS[entry.buddyTier || "bubble"] || "var(--v6)";
  }
  return SOURCE_COLORS[entry.source] || "var(--text-dim)";
}

function sourceLabel(entry: TranscriptEntry): string {
  if (entry.source === "buddy" && entry.buddyName) {
    const suffix = entry.channel === "native" ? " \u{1f4ac}" : "";
    return entry.buddyName + suffix;
  }
  return entry.source;
}

function TranscriptEntryRow({ entry }: { entry: TranscriptEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.content.length > 120;

  return (
    <div
      onClick={isLong ? () => setExpanded(!expanded) : undefined}
      style={{
        padding: "3px 0",
        fontSize: 11,
        lineHeight: 1.4,
        borderBottom: "1px solid rgba(26, 27, 46, 0.5)",
        cursor: isLong ? "pointer" : "default",
      }}
      title={isLong && !expanded ? entry.content : undefined}
    >
      <span
        style={{
          color: sourceColor(entry),
          fontWeight: 600,
          marginRight: 6,
        }}
      >
        [{sourceLabel(entry)}]
      </span>
      <span style={{ color: "var(--text)" }}>
        {expanded ? entry.content : entry.content.slice(0, 120)}
        {!expanded && isLong ? "..." : ""}
      </span>
    </div>
  );
}

interface TranscriptSidebarProps {
  entries: TranscriptEntry[];
  onRotate?: () => void;
}

export function TranscriptSidebar({ entries, onRotate }: TranscriptSidebarProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          textTransform: "uppercase",
          letterSpacing: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Transcript
        {onRotate && (
          <button
            onClick={onRotate}
            title="Start fresh transcript"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-dim)",
              fontSize: 10,
              padding: "2px 8px",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            New
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "4px 8px",
        }}
      >
        {entries.map((entry) => (
          <TranscriptEntryRow key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
