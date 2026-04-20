import { useEffect, useRef, useState, type RefObject } from "react";
import { io, Socket } from "socket.io-client";
import { Events } from "../../shared/protocol";
import type {
  TerminalOutputPayload,
  TranscriptEntry,
  BuddyReactionPayload,
  StatusPayload,
} from "../../shared/protocol";
import type { TerminalPaneHandle } from "../components/TerminalPane";

const SOCKET_URL = import.meta.env.VITE_BUDDY_PORT
  ? `http://localhost:${import.meta.env.VITE_BUDDY_PORT}`
  : "http://localhost:3777";

export interface UseSocketReturn {
  connected: boolean;
  terminalSnapshot: string;
  ptyExited: boolean;
  transcriptEntries: TranscriptEntry[];
  buddyReactions: BuddyReactionPayload[];
  status: StatusPayload | null;
  availablePresets: string[];
  sendInput: (text: string) => void;
  sendTerminalInput: (data: string) => void;
  sendTerminalResize: (cols: number, rows: number) => void;
  switchSession: (name: string) => void;
  rotateTranscript: () => void;
  sendTestPrompt: () => void;
}

export function useSocket(terminalRef?: RefObject<TerminalPaneHandle | null>): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [terminalSnapshot, setTerminalSnapshot] = useState("");
  const [ptyExited, setPtyExited] = useState(false);
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [buddyReactions, setBuddyReactions] = useState<BuddyReactionPayload[]>([]);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [availablePresets, setAvailablePresets] = useState<string[]>([]);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Request available presets on connect
      socket.emit(Events.LIST_PRESETS);
    });
    socket.on("disconnect", () => setConnected(false));

    // Write terminal output directly to xterm — no React state cycle
    socket.on(Events.TERMINAL_OUTPUT, (payload: TerminalOutputPayload) => {
      terminalRef?.current?.write(payload.delta);
    });

    socket.on(Events.TERMINAL_EXITED, () => {
      setPtyExited(true);
    });

    socket.on(Events.TRANSCRIPT_ENTRY, (entry: TranscriptEntry) => {
      setTranscriptEntries((prev) => [...prev.slice(-499), entry]);
    });

    socket.on(Events.TRANSCRIPT_HISTORY, (history: TranscriptEntry[]) => {
      setTranscriptEntries(history);
    });

    socket.on(Events.BUDDY_REACTION, (reaction: BuddyReactionPayload) => {
      setBuddyReactions((prev) => [...prev.slice(-49), reaction]);
    });

    socket.on(Events.STATUS_UPDATE, (payload: StatusPayload) => {
      setStatus(payload);
    });

    socket.on(Events.SESSION_CHANGED, () => {
      // Session changed — clear stale reactions from the previous session
      setBuddyReactions([]);
    });

    socket.on(Events.PRESETS_LIST, (presets: string[]) => {
      setAvailablePresets(presets);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const sendInput = (text: string) => {
    socketRef.current?.emit(Events.USER_INPUT, { text });
  };

  const sendTerminalInput = (data: string) => {
    socketRef.current?.emit(Events.TERMINAL_INPUT, data);
  };

  const sendTerminalResize = (cols: number, rows: number) => {
    socketRef.current?.emit(Events.TERMINAL_RESIZE, { cols, rows });
  };

  const switchSession = (name: string) => {
    socketRef.current?.emit(Events.SESSION_SWITCH, { name });
  };

  const rotateTranscript = () => {
    socketRef.current?.emit(Events.TRANSCRIPT_ROTATE);
  };

  const sendTestPrompt = () => {
    socketRef.current?.emit(Events.TEST_PROMPT);
  };

  return {
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
  };
}
