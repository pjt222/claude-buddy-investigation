interface StatusBarProps {
  connected: boolean;
  claudePaneId: number | null;
  sessionName?: string;
  buddyCount?: number;
}

export function StatusBar({ connected, claudePaneId, sessionName, buddyCount }: StatusBarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "4px 12px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg)",
        fontSize: 11,
        color: "var(--text-dim)",
      }}
    >
      <span style={{ color: connected ? "var(--positive)" : "var(--critical)" }}>
        {connected ? "\u25CF" : "\u25CB"} {connected ? "connected" : "disconnected"}
      </span>
      {claudePaneId !== null && claudePaneId > 0 && (
        <span>pane:{claudePaneId}</span>
      )}
      {claudePaneId !== null && claudePaneId <= 0 && (
        <span>embedded</span>
      )}
      {sessionName && (
        <span style={{ color: "var(--v5)" }}>{sessionName}</span>
      )}
      {buddyCount !== undefined && buddyCount > 0 && (
        <span>{buddyCount} {buddyCount === 1 ? "buddy" : "buddies"}</span>
      )}
      <span style={{ marginLeft: "auto" }}>Buddy Workspace v0.1</span>
    </div>
  );
}
