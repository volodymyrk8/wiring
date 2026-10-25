import { tr } from "@/lib/i18n";
import { render } from "preact";
import { useRef, useState } from "preact/hooks";
import { Button, Textarea } from "@/components/ui";
import styles from "./ReplyComposer.module.css";

function ReplyComposer({ node }: { node: HTMLElement }) {
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const sending = useRef(false);
  const retry = node.dataset.retry === "true";
  return <form class={styles.form} method="post" action={node.dataset.action} onSubmit={(event) => {
    if (sending.current) { event.preventDefault(); return; }
    sending.current = true;
    setBusy(true);
  }}>
    <input type="hidden" name="csrf" value={node.dataset.csrf} />
    <input type="hidden" name="request_id" value={node.dataset.requestId} />
    {retry ? <input type="hidden" name="body" value={node.dataset.body} /> : <>
      <p class={styles.recipient}>{node.dataset.recipient}</p>
      <Textarea id={`reply-${node.dataset.kind}-${node.dataset.source}`} name="body" label={tr("Ответ заявителю")} value={body} onInput={(event) => setBody(event.currentTarget.value)} maxLength={2000} required rows={3} />
    </>}
    <Button type="submit" slim disabled={busy} loading={busy}>{retry ? tr("Повторить письмо") : tr("Отправить ответ")}</Button>
  </form>;
}

export function mountAdminReplies() {
  document.querySelectorAll<HTMLElement>("[data-admin-reply]").forEach((node) => render(<ReplyComposer node={node} />, node));
}
