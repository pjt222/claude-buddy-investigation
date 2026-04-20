import type { SessionInfo } from "../../shared/protocol";

interface SessionControlsProps {
  session: SessionInfo | null;
  presets: string[];
  onSwitch: (name: string) => void;
  onTest?: () => void;
}

export function SessionControls({ session, presets, onSwitch, onTest }: SessionControlsProps) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-dim)",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        Session
      </div>
      <select
        value={session?.name || ""}
        onChange={(e) => onSwitch(e.target.value)}
        style={{
          width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "4px 6px",
          color: "var(--text-bright)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
        }}
      >
        <option value="" disabled>
          Select preset...
        </option>
        {presets.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {session && (
        <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
          {session.description}
        </div>
      )}
      {session && onTest && (
        <button
          onClick={onTest}
          title="Send test prompt to PTY Claude"
          style={{
            marginTop: 6,
            width: "100%",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-dim)",
            fontSize: 10,
            padding: "4px 8px",
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            fontFamily: "var(--font-mono)",
          }}
        >
          Run Test Prompt
        </button>
      )}
    </div>
  );
}
