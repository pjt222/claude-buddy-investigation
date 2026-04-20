import "./theme/viridis.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "./hooks/useSocket";
import { TerminalPane, type TerminalPaneHandle } from "./components/TerminalPane";
import { InputBar } from "./components/InputBar";
import { BuddyRoster } from "./components/BuddyRoster";
import { SessionControls } from "./components/SessionControls";
import { TranscriptSidebar } from "./components/TranscriptSidebar";
import { StatusBar } from "./components/StatusBar";

function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const dx = ev.clientX - lastX.current;
        lastX.current = ev.clientX;
        onDrag(dx);
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onDrag]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); onDrag(-10); }
      if (e.key === "ArrowRight") { e.preventDefault(); onDrag(10); }
    },
    [onDrag]
  );

  return (
    <div
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      style={{
        width: 5,
        cursor: "col-resize",
        background: "var(--border)",
        flexShrink: 0,
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.background = "var(--v5)")}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.background = "var(--border)")}
      onFocus={(e) => ((e.target as HTMLElement).style.background = "var(--v5)")}
      onBlur={(e) => ((e.target as HTMLElement).style.background = "var(--border)")}
    />
  );
}

export default function App() {
  const terminalPaneRef = useRef<TerminalPaneHandle>(null);
  const {
    connected,
    terminalSnapshot,
    ptyExited,
    transcriptEntries,
    buddyReactions,
    status,
    availablePresets,
    sendInput,
    sendTerminalInput,
    sendTerminalResize,
    switchSession,
    rotateTranscript,
    sendTestPrompt,
  } = useSocket(terminalPaneRef);

  const [buddyWidth, setBuddyWidth] = useState(280);
  const [transcriptWidth, setTranscriptWidth] = useState(260);
  const [sidebarsCollapsed, setSidebarsCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 900
  );

  // Collapse sidebars on narrow viewports
  useEffect(() => {
    const handleViewportResize = () => setSidebarsCollapsed(window.innerWidth < 900);
    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, []);

  const handleBuddyResize = useCallback((dx: number) => {
    setBuddyWidth((w) => Math.max(200, Math.min(500, w + dx)));
  }, []);

  const handleTranscriptResize = useCallback((dx: number) => {
    setTranscriptWidth((w) => Math.max(160, Math.min(600, w - dx)));
  }, []);

  return (
    <>
      <div
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Left: Buddies */}
        {!sidebarsCollapsed && (
          <>
            <div
              role="complementary"
              aria-label="Buddy roster"
              style={{
                width: buddyWidth,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "auto",
                minHeight: 0,
              }}
            >
              <SessionControls
                session={status?.session ?? null}
                presets={availablePresets}
                onSwitch={switchSession}
                onTest={sendTestPrompt}
              />
              <BuddyRoster
                session={status?.session ?? null}
                reactions={buddyReactions}
              />
            </div>

            <ResizeHandle onDrag={handleBuddyResize} />
          </>
        )}

        {/* Center: Terminal + Input */}
        <div
          role="main"
          aria-label="Terminal"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 300,
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: 11,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: 1,
              background: "var(--bg-card)",
            }}
          >
            {sidebarsCollapsed && (
              <button
                onClick={() => setSidebarsCollapsed(false)}
                style={{
                  background: "none", border: "1px solid var(--border)", borderRadius: 3,
                  color: "var(--v5)", cursor: "pointer", padding: "1px 6px", marginRight: 8,
                  fontSize: 11, fontFamily: "var(--font-mono)",
                }}
                aria-label="Show sidebars"
              >
                panels
              </button>
            )}
            Claude Code
            {status?.claudePaneId != null && status.claudePaneId > 0 && (
              <span style={{ marginLeft: 8, color: "var(--v5)" }}>
                pane:{status.claudePaneId}
              </span>
            )}
          </div>
          <TerminalPane
            ref={terminalPaneRef}
            snapshot={terminalSnapshot}
            connected={connected}
            ptyExited={ptyExited}
            onInput={sendTerminalInput}
            onResize={sendTerminalResize}
          />
          <InputBar onSend={sendInput} disabled={!connected || ptyExited} />
        </div>

        {!sidebarsCollapsed && (
          <>
            <ResizeHandle onDrag={handleTranscriptResize} />

            {/* Right: Transcript */}
            <div
              role="complementary"
              aria-label="Transcript"
              style={{ width: transcriptWidth, flexShrink: 0, minHeight: 0 }}
            >
              <TranscriptSidebar entries={transcriptEntries} onRotate={rotateTranscript} />
            </div>
          </>
        )}
      </div>

      <StatusBar
        connected={connected}
        claudePaneId={status?.claudePaneId ?? null}
        sessionName={status?.session?.name}
        buddyCount={status?.session?.buddies.length}
      />
    </>
  );
}
