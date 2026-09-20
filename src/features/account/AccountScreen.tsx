import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, LegalFooter, ProfileMenu } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
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
      avatarUrl={profileMenuAvatarUrl(host.basePath, host.user.photo)}
      userName={String(host.user.name || "")}
      isPlus={Boolean(host.user.plus)}
      profileHref={host.hrefFor("profile")}
      consentsHref={host.hrefFor("consents")}
      plusHref={host.hrefFor("plus")}
      notificationsHref={host.hrefFor("notifications")}
      onProfileClick={navigate("profile")}
      onConsentsClick={navigate("consents")}
      onPlusClick={navigate("plus")}
      onNotificationsClick={navigate("notifications")}
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

export function CityGateScreen({ host }: { host: AccountHostBridge }) {
  const initialCity = String(host.user.city || "");
  const initialCountry = (host.catalog.places || []).find((place) => place.cities.includes(initialCity))?.country || host.catalog.places?.[0]?.country || "";
  const [country, setCountry] = useState(initialCountry);
  const [city, setCity] = useState(initialCity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cities = host.catalog.places?.find((place) => place.country === country)?.cities || [];
  const submit = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    if (!city || busy) return;
    setBusy(true); setError("");
    try {
      const response = await host.api("/api/me/city", { method: "POST", body: JSON.stringify({ city }) });
      host.onUserUpdated(response.user);
      host.toast("город сохранён");
      host.navigate("deck");
    } catch (caught) { setError(getErrorMessage(caught)); setBusy(false); }
  };
  return <div class={styles.root}>
    <AccountHeader host={host} title="город" back={false} />
    <main class={styles.content}><section class={styles.panel}>
      <h1>Уточни город</h1>
      <p class={styles.lede}>Сначала страна, потом город из списка.</p>
      <form class={styles.onboard} onSubmit={submit}>
        <label>страна<select value={country} onChange={(event) => { setCountry(event.currentTarget.value); setCity(""); }} required>{(host.catalog.places || []).map((place) => <option key={place.country} value={place.country}>{place.country}</option>)}</select></label>
        <label>город<select value={city} onChange={(event) => setCity(event.currentTarget.value)} required><option value="">выбери город</option>{cities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
        <div class={styles.actions}><Button variant="solid" type="submit" disabled={busy} loading={busy}>сохранить и продолжить</Button></div>
      </form>
    </section><LegalFooter /></main>
  </div>;
}

const photosOf = (user: AccountHostBridge["user"]) => Array.isArray(user.photos) ? user.photos : (user.albums || []).flatMap((album) => album.photos || []);
const photoSrc = (host: AccountHostBridge, photo: unknown, name: string) => {
  const value = photo && typeof photo === "object" ? (photo as { url?: string }).url : photo;
  if (typeof value === "string" && value) return value.startsWith("/") ? `${host.basePath}${value}` : value.startsWith("http") || value.startsWith("data:") ? value : `${host.basePath}/public/${value}`;
  return avatarUrl(host.basePath, value, name);
};

export function OnboardScreen({ host }: { host: AccountHostBridge }) {
  const [user, setUser] = useState(host.user);
  const [city, setCity] = useState(String(host.user.city || ""));
  const [communication, setCommunication] = useState(String(host.user.communication || ""));
  const initialPrompt = host.user.prompts?.[0] || { id: host.catalog.prompts?.[0]?.id || "special", answer: "" };
  const [promptId] = useState(initialPrompt.id);
  const [promptAnswer, setPromptAnswer] = useState(String(initialPrompt.answer || ""));
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cities = (host.catalog.places || []).flatMap((place) => place.cities).filter((value, index, list) => list.indexOf(value) === index);
  const existingPhotos = photosOf(user);
  const addFiles = (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const next = Array.from(event.currentTarget.files || []);
    if (!next.length) return;
    setFiles((current) => [...current, ...next]);
    setPreviews((current) => [...current, ...next.map((file) => URL.createObjectURL(file))]);
    event.currentTarget.value = "";
  };
  const skip = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await host.api("/api/onboard/skip", { method: "POST" }); const next = await host.refreshUser(); setUser(next); host.onUserUpdated(next); host.navigate("deck"); } catch (caught) { setError(getErrorMessage(caught)); setBusy(false); }
  };
  const submit = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    if (!city) { setError("выбери город"); return; }
    if (busy) return;
    setBusy(true); setError("");
    try {
      for (const file of files) await host.uploadPhoto(file);
      const response = await host.api("/api/me", { method: "PATCH", body: JSON.stringify({
        name: user.name,
        age: user.age,
        city,
        gender: user.gender,
        looking_for: user.looking_for,
        bio: user.bio,
        job: user.job || "",
        intent: user.intent || "dating",
        height: user.height || "",
        communication,
        neuro: user.neuro || [],
        vibe: user.vibe || [],
        prompts: promptAnswer.trim().length >= 4 ? [{ id: promptId, answer: promptAnswer }] : [],
      }) });
      let next = response.user;
      if (next.needs_onboard) { await host.api("/api/onboard/skip", { method: "POST" }); next = await host.refreshUser(); }
      setUser(next); host.onUserUpdated(next); host.navigate("deck");
    } catch (caught) { setError(getErrorMessage(caught)); setBusy(false); }
  };
  return <div class={styles.root}>
    <AccountHeader host={host} title="настройка" back={false} />
    <main class={styles.content}><section class={styles.panel}>
      <h1>Ещё чуть-чуть</h1>
      <p class={styles.lede}>Два фото и один промпт сильно лучше пустой анкеты. Можно пропустить, но тогда тебя труднее узнать.</p>
      <form class={styles.onboard} onSubmit={submit}>
        <div><p class={styles.subtle}>фото — хотя бы ещё одно</p><div class={styles.photoGrid}>{existingPhotos.map((photo) => <div class={styles.photoCell} key={photo.id}><img src={photoSrc(host, photo.url, String(user.name || "Профиль"))} alt="" /></div>)}{previews.map((src, index) => <div class={styles.photoCell} key={`${src}-${index}`}><img src={src} alt="новое фото" /></div>)}<label class={styles.fileAdd}><span aria-hidden="true">+</span><input type="file" accept="image/*" multiple disabled={busy} onChange={addFiles} /></label></div></div>
        <label>город<select value={city} required onChange={(event) => setCity(event.currentTarget.value)}><option value="">выбери город</option>{cities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>как тебе писать<textarea maxlength={280} placeholder="сразу по делу, голосовые ок / нет" value={communication} onInput={(event) => setCommunication(event.currentTarget.value)} /></label>
        <label>{host.catalog.prompts?.find((item) => item.id === promptId)?.label || "один промпт"}<textarea maxlength={280} placeholder="расскажи что-то важное о себе" value={promptAnswer} onInput={(event) => setPromptAnswer(event.currentTarget.value)} /></label>
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
        <div class={styles.actions}><Button variant="solid" slim type="submit" disabled={busy} loading={busy}>дальше в ленту</Button><Button variant="ghost" slim type="button" disabled={busy} onClick={() => void skip()}>пропустить</Button></div>
      </form>
    </section><LegalFooter /></main>
  </div>;
}
