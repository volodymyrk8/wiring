import { useEffect, useRef, useState } from "preact/hooks";
import { Button } from "@/components/ui";
import type { SupportHostBridge } from "./types";
import styles from "./SupportScreen.module.css";
type Reply = { id: number; source_kind: "report" | "ticket"; body: string; created_at: number };

export function ReplyHistory({ host }: { host: SupportHostBridge }) {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [error, setError] = useState("");
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (!host.user?.id) return;
    let alive = true;
    let controller: AbortController | undefined;
    const load = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void host.api("/api/support/replies", { signal: request.signal }).then((response: { replies: Reply[] }) => {
        if (alive && !request.signal.aborted) { setReplies(response.replies); setError(""); }
      }).catch(() => {
        if (alive && !request.signal.aborted) setError("Не удалось загрузить ответы поддержки");
      });
    };
    refresh.current = load;
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { alive = false; controller?.abort(); window.clearInterval(timer); refresh.current = () => {}; };
  }, [host.user?.id, host.api]);
  if (!host.user?.id) return null;
  return <section class={styles.replyHistory} aria-label="Ответы поддержки" aria-live="polite">
    {replies.length ? <h2>Ответы поддержки</h2> : null}
    {replies.map((reply) => <article key={reply.id} class={styles.reply}>
      <strong>{reply.source_kind === "report" ? "Ответ на жалобу" : "Ответ на обращение"}</strong>
      <time dateTime={new Date(reply.created_at * 1000).toISOString()}>{new Date(reply.created_at * 1000).toLocaleString("ru")}</time>
      <p>{reply.body}</p>
    </article>)}
    {error ? <div role="alert"><p>{error}</p><Button variant="ghost" slim onClick={() => refresh.current()}>Повторить загрузку ответов</Button></div> : null}
  </section>;
}
