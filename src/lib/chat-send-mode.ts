export type ChatSendMode = "enter" | "ctrl-enter";

const STORAGE_KEY = "wiring-chat-send-mode";

export function readChatSendMode(): ChatSendMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "ctrl-enter" ? "ctrl-enter" : "enter";
  } catch {
    return "enter";
  }
}

export function writeChatSendMode(mode: ChatSendMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private mode */
  }
}

export function toggleChatSendMode(mode: ChatSendMode): ChatSendMode {
  const next: ChatSendMode = mode === "enter" ? "ctrl-enter" : "enter";
  writeChatSendMode(next);
  return next;
}

export function chatSendModeHint(mode: ChatSendMode): string {
  if (mode === "enter") return "Enter — отправить, Shift+Enter — новая строка";
  return "Ctrl+Enter — отправить, Enter — новая строка. На Mac — ⌘+Enter";
}

export function shouldSendOnComposerKey(
  mode: ChatSendMode,
  event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
): boolean {
  if (event.key !== "Enter") return false;
  const mod = event.ctrlKey || event.metaKey;
  if (mode === "enter") return !event.shiftKey && !mod;
  return mod;
}
