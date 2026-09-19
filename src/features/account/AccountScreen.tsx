import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, LegalFooter, ProfileMenu } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import type { AccountHostBridge } from "./types";
import styles from "./AccountScreen.module.css";

const avatarUrl = (basePath: string, photo: unknown, name = "?") => {
  let value = photo;
  if (value && typeof value === "object") value = (value as { url?: string }).url;
  if (typeof value === "string" && value) {
    if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http")) return value;
    if (value.startsWith(basePath)) return value;
    return value.startsWith("/") ? `${basePath}${value}` : `${basePath}/public/${value}`;
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#303448"/><text x="60" y="70" text-anchor="middle" fill="#d8ff3c" font-size="40" font-family="Georgia">${String(name || "?").slice(0, 1)}</text></svg>`)}`;
};

function AccountHeader({ host, title, back = true }: { host: AccountHostBridge; title: string; back?: boolean }) {
  const navigate = (view: string) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view);
  };
  return <AppHeader
    homeHref={host.hrefFor("home")}
    onHomeClick={navigate("home")}
    sectionTitle={title}
    showBack={back}
    backHref={host.hrefFor("profile")}
    backNav="profile"
    onBackClick={navigate("profile")}
    showThemeSwatches
    onThemeSelect={host.onThemeSelect}
    rightSlot={!host.user.guest ? <ProfileMenu
      avatarUrl={avatarUrl(host.basePath, host.user.photo, String(host.user.name || "Профиль"))}
      userName={String(host.user.name || "")}
      isPlus={Boolean(host.user.plus)}
      profileHref={host.hrefFor("profile")}
      consentsHref={host.hrefFor("consents")}
      plusHref={host.hrefFor("plus")}
      onProfileClick={navigate("profile")}
      onConsentsClick={navigate("consents")}
      onPlusClick={navigate("plus")}
      onLogout={host.onLogout}
    /> : null}
  />;
}

export function InviteScreen({ host }: { host: AccountHostBridge }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = async () => {
    const value = host.user.ref_url || "";
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else { const input = document.getElementById("invite-ref") as HTMLInputElement | null; input?.select(); document.execCommand("copy"); }
      host.toast("ссылка скопирована");
    } catch { host.toast("не удалось скопировать"); }
  };
  const continueToDeck = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await host.continueAfterInvite(); } catch (caught) { setError(getErrorMessage(caught)); setBusy(false); }
  };
  const days = host.user.ref_days || 30;
  return <div class={styles.root}>
    <AccountHeader host={host} title="приглашение" />
    <main class={styles.content}><section class={styles.panel}>
      <h1>Анкета готова</h1>
      <p class={styles.lede}>Пригласи друга по ссылке — WIRING+ на {days} дней будет и у тебя, и у него. Подарок за регистрацию, не за лайк.</p>
      {host.user.ref_url ? <div class={styles.refBox}><p class={styles.refLabel}>твоя ссылка</p><div class={styles.refRow}><input id="invite-ref" readonly value={host.user.ref_url} /><Button variant="ghost" slim onClick={() => void copy()}>копировать</Button></div><p class={styles.hint}>ссылка всегда есть в профиле</p></div> : <p class={styles.hint}>ссылка для приглашений появится в профиле</p>}
      {error ? <p class={styles.error} role="alert">{error}</p> : null}
      <div class={styles.actions}><Button variant="solid" slim disabled={busy} loading={busy} onClick={() => void continueToDeck()}>в ленту</Button></div>
    </section><LegalFooter /></main>
  </div>;
}

export function DeleteAccountScreen({ host }: { host: AccountHostBridge }) {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    if (!password) { setError("введи пароль для подтверждения"); return; }
    if (!confirmed) { setError("подтверди удаление профиля"); return; }
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await host.api("/api/me/delete", { method: "POST", body: JSON.stringify({ password }) });
      if (!response?.ok) throw new Error(response?.error || "ошибка при удалении");
      host.toast("Аккаунт удалён. Восстановить профиль можно в течение 7 суток.");
      await host.onDeleted();
    } catch (caught) { setError(getErrorMessage(caught)); setBusy(false); }
  };
  return <div class={styles.root}>
    <AccountHeader host={host} title="удаление" />
    <main class={styles.content}><section class={styles.panel}>
      <h1>Удаление аккаунта</h1>
      <div class={styles.warning}><strong>Профиль сразу пропадёт из публичного доступа</strong><span>В момент удаления ты исчезнешь из ленты, поиска и чатов.</span><span><b>Восстановление:</b> профиль можно восстановить в течение 7 суток. После этого данные удалятся полностью.</span></div>
      <form onSubmit={submit}>
        <div class={styles.panel} style={{ padding: 0, border: 0, background: "transparent" }}>
          <label>текущий пароль<input type="password" value={password} autocomplete="current-password" required onInput={(event) => setPassword(event.currentTarget.value)} /></label>
          <label class={styles.confirm}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} /> <span>Подтверждаю удаление своего профиля</span></label>
          {error ? <p class={styles.error} role="alert">{error}</p> : null}
          <div class={styles.actions}><Button variant="solid" slim type="submit" disabled={busy} loading={busy} className={styles.danger}>Удалить аккаунт навсегда</Button><Button variant="ghost" slim href={host.hrefFor("profile")} nav="profile">отмена</Button></div>
        </div>
      </form>
    </section><LegalFooter /></main>
  </div>;
}
