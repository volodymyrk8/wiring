import { tr, getLocale } from "@/lib/i18n";
import { useEffect, useRef, useState } from "preact/hooks";
import { Button, Input, Modal } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import type { ProfileUser } from "./types";
import styles from "./ProfileScreen.module.css";

export function NameEditor({ user, saveName, onChanged }: { user: ProfileUser; saveName: (name: string, signal: AbortSignal) => Promise<ProfileUser>; onChanged: (user: ProfileUser) => void }) {
  const [name, setName] = useState(String(user.name || ""));
  const [available, setAvailable] = useState(Number(user.name_change_available_at || 0));
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const locked = available * 1000 > now;
  useEffect(() => {
    if (!locked) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(2147483647, available * 1000 - Date.now() + 50));
    return () => window.clearTimeout(timer);
  }, [available, locked]);
  useEffect(() => () => request.current?.abort(), []);
  const save = async () => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError("");
    try {
      const next = await saveName(name.trim(), controller.signal);
      if (!controller.signal.aborted) { setOpen(false); onChanged(next); }
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(getErrorMessage(caught));
        const nextAvailable = Number((caught as { payload?: { name_change_available_at?: unknown } } | null)?.payload?.name_change_available_at || 0);
        if (nextAvailable > 0) {
          setAvailable(nextAvailable); setNow(Date.now()); setName(String(user.name || "")); setOpen(false);
        }
      }
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); }
    }
  };
  return <div class={styles.nameEditor}>
    <Input label={tr("Имя")} name="name" required maxLength={32} value={name} disabled={locked || busy}
      hint={locked ? tr("Сменить имя можно {0}.", new Date(available * 1000).toLocaleString(getLocale())) : tr("После смены следующее изменение будет доступно через 14 дней.")}
      onInput={(event) => { setName(event.currentTarget.value); setError(""); }} />
    {!locked && name.trim() !== String(user.name || "") ? <Button type="button" slim disabled={!name.trim() || busy} onClick={() => setOpen(true)}>{tr("Сменить имя")}</Button> : null}
    {error && !open ? <p role="alert">{error}</p> : null}
    <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title={tr("Сменить имя?")} footer={<>
      <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>{tr("Отмена")}</Button>
      <Button disabled={busy} loading={busy} onClick={() => void save()}>{tr("Подтвердить смену")}</Button>
    </>}><p>{tr("Имя изменится на «")}{name.trim()}{tr("». Следующая смена будет доступна через 14 дней.")}</p>{error ? <p role="alert">{error}</p> : null}</Modal>
  </div>;
}
