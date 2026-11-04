import { useEffect, useRef, useState } from "preact/hooks";
import { tr } from "@/lib/i18n";
import type { ChatHostBridge, ChatMessage } from "./types";
import styles from "./ChatScreen.module.css";

const emojis = ["❤️", "👍", "😂", "😮", "😢", "🎉"];

export function Reactions({ message, host, refresh, disabled }: {
  message: ChatMessage; host: ChatHostBridge; refresh: () => Promise<void>; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const choose = async (emoji: string) => {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    try {
      await host.api(`/api/messages/${message.id}/reaction`, {
        method: "PUT", body: JSON.stringify({ emoji: message.reactions?.some((r) => r.emoji === emoji && r.mine) ? null : emoji }),
      });
      if (!alive.current) return;
      setOpen(false);
      await refresh();
    } catch (error) {
      if (alive.current) host.toast(error instanceof Error ? error.message : tr("Не удалось сохранить реакцию"));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return <div class={styles.reactions}>
    {message.reactions?.map((reaction) => <button key={reaction.emoji} type="button"
      class={styles.reaction} aria-pressed={reaction.mine} disabled={disabled || busy}
      aria-label={tr("Реакция {0}", reaction.emoji)}
      onClick={() => void choose(reaction.emoji)}>{reaction.emoji}</button>)}
    <button type="button" class={styles.reaction} aria-label={tr("Добавить реакцию")} title={tr("Добавить реакцию")}
      aria-expanded={open} disabled={disabled || busy} onClick={() => setOpen(!open)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
        <path d="M8 14a5 5 0 0 0 8 0" />
      </svg>
    </button>
    {open && <div class={styles.reactionPicker} role="group" aria-label={tr("Реакции")}>
      {emojis.map((emoji) => <button key={emoji} type="button" class={styles.reaction}
        aria-label={tr("Реакция {0}", emoji)} aria-pressed={!!message.reactions?.some((r) => r.emoji === emoji && r.mine)}
        disabled={disabled || busy} onClick={() => void choose(emoji)}>{emoji}</button>)}
    </div>}
  </div>;
}
