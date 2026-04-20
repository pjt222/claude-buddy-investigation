import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface TerminalPaneHandle {
  write: (data: string) => void;
}

const XTERM_THEME = {
  background: "#08080f",
  foreground: "#c8c8d8",
  cursor: "#35b779",
  cursorAccent: "#08080f",
  selectionBackground: "rgba(53, 183, 121, 0.3)",
  black: "#08080f",
  red: "#ff4466",
  green: "#35b779",
  yellow: "#fde725",
  blue: "#31688e",
  magenta: "#440154",
  cyan: "#26828e",
  white: "#c8c8d8",
  brightBlack: "#6a6a88",
  brightRed: "#ff4466",
  brightGreen: "#6ece58",
  brightYellow: "#b5de2b",
  brightBlue: "#3e4989",
  brightMagenta: "#482878",
  brightCyan: "#1f9e89",
  brightWhite: "#eeeef8",
};

interface TerminalPaneProps {
  snapshot: string;
  connected?: boolean;
  ptyExited?: boolean;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export const TerminalPane = forwardRef<TerminalPaneHandle, TerminalPaneProps>(
  function TerminalPane({ snapshot, connected = true, ptyExited = false, onInput, onResize }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const snapshotLoaded = useRef(false);
    const [focused, setFocused] = useState(false);
    const hasOutput = useRef(false);

    // Keep latest callbacks in refs so the xterm listeners never go stale
    const onInputRef = useRef(onInput);
    const onResizeRef = useRef(onResize);
    onInputRef.current = onInput;
    onResizeRef.current = onResize;

    // Expose imperative write() so the socket can push data without React state
    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        hasOutput.current = true;
        termRef.current?.write(data);
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const term = new Terminal({
        theme: XTERM_THEME,
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        lineHeight: 1.3,
        cursorBlink: true,
        disableStdin: false,
        scrollback: 5000,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();

      termRef.current = term;
      fitRef.current = fit;

      // Forward keystrokes to PTY — read from ref to avoid stale closure
      term.onData((data) => onInputRef.current?.(data));

      // Report resize to PTY — read from ref to avoid stale closure
      term.onResize(({ cols, rows }) => onResizeRef.current?.(cols, rows));

      // Track focus for visual indicator
      term.textarea?.addEventListener("focus", () => setFocused(true));
      term.textarea?.addEventListener("blur", () => setFocused(false));

      // Ctrl+=/- font size control
      term.attachCustomKeyEventHandler((e) => {
        if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
          e.preventDefault();
          term.options.fontSize = Math.min((term.options.fontSize ?? 13) + 1, 24);
          fit.fit();
          return false;
        }
        if (e.ctrlKey && e.key === "-") {
          e.preventDefault();
          term.options.fontSize = Math.max((term.options.fontSize ?? 13) - 1, 9);
          fit.fit();
          return false;
        }
        return true;
      });

      // Show connecting message until first real output arrives
      term.write("\x1b[2m Connecting to Claude Code...\x1b[0m");

      // Throttled fit on container resize — at most once per 100ms
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      let lastFitTime = 0;
      const THROTTLE_MS = 100;

      const throttledFit = () => {
        const now = Date.now();
        const elapsed = now - lastFitTime;

        if (elapsed >= THROTTLE_MS) {
          lastFitTime = now;
          try { fit.fit(); } catch { /* terminal may be disposed */ }
        } else if (!resizeTimer) {
          resizeTimer = setTimeout(() => {
            resizeTimer = null;
            lastFitTime = Date.now();
            try { fit.fit(); } catch { /* terminal may be disposed */ }
          }, THROTTLE_MS - elapsed);
        }
      };

      const resizeObserver = new ResizeObserver(throttledFit);
      resizeObserver.observe(containerRef.current);

      // Also listen for window resize (grid layout changes don't always trigger ResizeObserver)
      window.addEventListener("resize", throttledFit);

      return () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeObserver.disconnect();
        window.removeEventListener("resize", throttledFit);
        term.dispose();
      };
    }, []);

    // Load initial snapshot — clear connecting message first
    useEffect(() => {
      if (snapshot && termRef.current && !snapshotLoaded.current) {
        termRef.current.clear();
        termRef.current.write(snapshot);
        snapshotLoaded.current = true;
        hasOutput.current = true;
      }
    }, [snapshot]);

    return (
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            background: "#08080f",
            borderRadius: 4,
            overflow: "hidden",
            outline: focused ? "1px solid var(--v5)" : "1px solid transparent",
            transition: "outline-color 0.15s",
          }}
        />
        {ptyExited && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(8, 8, 15, 0.85)",
              borderRadius: 4,
              color: "var(--critical)",
              fontSize: 13,
            }}
          >
            Claude process exited
          </div>
        )}
      </div>
    );
  }
);
