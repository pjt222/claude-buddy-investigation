import { useRef, useState, useCallback, type KeyboardEvent } from "react";

interface InputBarProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && value.trim()) {
      e.preventDefault();
      onSend(value.trim());
      setValue("");
      // Reset height after send
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-grow up to 4 lines (~80px)
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 80) + "px";
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        padding: "8px 12px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        rows={1}
        aria-label="Send message to Claude"
        placeholder={disabled ? "Not connected..." : "Type a message... (Shift+Enter for newline)"}
        style={{
          flex: 1,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "6px 10px",
          color: "var(--text-bright)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          outline: focused ? "2px solid var(--v5)" : "none",
          outlineOffset: -1,
          resize: "none",
          lineHeight: 1.4,
          minHeight: 30,
          maxHeight: 80,
        }}
      />
      <button
        onClick={() => {
          if (value.trim()) {
            onSend(value.trim());
            setValue("");
            if (textareaRef.current) textareaRef.current.style.height = "auto";
          }
        }}
        disabled={disabled || !value.trim()}
        style={{
          padding: "6px 16px",
          background: "var(--v5)",
          border: "none",
          borderRadius: 4,
          color: "var(--bg)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled || !value.trim() ? 0.5 : 1,
        }}
      >
        Send
      </button>
    </div>
  );
}
