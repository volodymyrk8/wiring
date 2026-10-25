import { tr } from "@/lib/i18n";
import { useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, Checkbox, LegalFooter, PhotoCropper, ProfileMenu } from "@/components/ui";
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
      archiveHref={host.hrefFor("archive")}
      onProfileClick={navigate("profile")}
      onConsentsClick={navigate("consents")}
      onPlusClick={navigate("plus")}
      onNotificationsClick={navigate("notifications")}
      onArchiveClick={navigate("archive")}
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
      host.toast(tr("ссылка скопирована"));
    } catch { host.toast(tr("не удалось скопировать")); }
  };
  const continueToDeck = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await host.continueAfterInvite(); } catch (caught) { setError(getErrorMessage(caught)); setBusy(false); }
  };
  const days = host.user.ref_days || 30;
  return <div class={styles.root}>
    <AccountHeader host={host} title={tr("приглашение")} />
    <main class={styles.content}><section class={styles.panel}>
      <h1>{tr("Анкета готова")}</h1>
      <p class={styles.lede}>{tr("Пригласи друга по ссылке — ещё ")}{days} {tr(" дней WIRING+ будет и у тебя, и у него. Подарок за регистрацию, не за лайк.")}</p>
      {host.user.ref_url ? <div class={styles.refBox}><p class={styles.refLabel}>{tr("твоя ссылка")}</p><div class={styles.refRow}><input id="invite-ref" readonly value={host.user.ref_url} /><Button variant="ghost" slim onClick={() => void copy()}>{tr("копировать")}</Button></div><p class={styles.hint}>{tr("ссылка всегда есть в профиле")}</p></div> : <p class={styles.hint}>{tr("ссылка для приглашений появится в профиле")}</p>}
      {error ? <p class={styles.error} role="alert">{error}</p> : null}
      <div class={styles.actions}><Button variant="solid" slim disabled={busy} loading={busy} onClick={() => void continueToDeck()}>{tr("в ленту")}</Button></div>
    </section><LegalFooter /></main>
  </div>;
}

export function DeleteAccountScreen({ host }: { host: AccountHostBridge }) {
  const [step, setStep] = useState<"intro" | "confirm">("intro");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    if (!confirmed) { setError(tr("отметь, что понимаешь последствия")); return; }
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await host.api("/api/me/delete", { method: "POST", body: JSON.stringify({}) });
      if (!response?.ok) throw new Error(response?.error || tr("ошибка при удалении"));
      host.toast(tr("Аккаунт удалён."));
      await host.onDeleted();
    } catch (caught) { setError(getErrorMessage(caught)); setBusy(false); }
  };
  if (step === "intro") {
    return <div class={styles.root}>
      <AccountHeader host={host} title={tr("удаление")} />
      <main class={styles.content}><section class={styles.panel}>
        <h1>{tr("Удаление аккаунта")}</h1>
        <div class={styles.warning} role="alert">
          <strong>{tr("ВНИМАНИЕ!")}</strong>
          <span>{tr("Вы уверены, что действительно хотите удалить аккаунт навсегда? Вы не сможете его восстановить.")}</span>
        </div>
        <p class={styles.lede}>{tr("Профиль сразу исчезнет из ленты, поиска и чатов. Если передумали — вернитесь в профиль. Дальше будет ещё один экран подтверждения.")}</p>
        <div class={styles.actions}>
          <Button variant="ghost" slim href={host.hrefFor("profile")} nav="profile">{tr("оставить аккаунт")}</Button>
          <Button variant="solid" slim className={styles.danger} onClick={() => { setError(""); setStep("confirm"); }}>{tr("продолжить")}</Button>
        </div>
      </section><LegalFooter /></main>
    </div>;
  }
  return <div class={styles.root}>
    <AccountHeader host={host} title={tr("удаление")} />
    <main class={styles.content}><section class={styles.panel}>
      <h1 class={styles.deleteSure}>{tr("Точно?")}</h1>
      <p class={styles.deleteSureSub}>{tr("Точно-точно?")}</p>
      <p class={styles.lede}>{tr("Это последний шаг. После удаления восстановить аккаунт будет нельзя.")}</p>
      <form onSubmit={submit}>
        <label class={styles.confirm}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} /> <span>{tr("Да, удалить аккаунт навсегда")}</span></label>
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
        <div class={styles.actions}>
          <Button variant="ghost" slim type="button" disabled={busy} onClick={() => { setError(""); setConfirmed(false); setStep("intro"); }}>{tr("назад")}</Button>
          <Button variant="solid" slim type="submit" disabled={busy || !confirmed} loading={busy} className={styles.danger}>{tr("Удалить навсегда")}</Button>
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
      host.toast(tr("город сохранён"));
      host.navigate("deck");
    } catch (caught) { setError(getErrorMessage(caught)); setBusy(false); }
  };
  return <div class={styles.root}>
    <AccountHeader host={host} title={tr("город")} back={false} />
    <main class={styles.content}><section class={styles.panel}>
      <h1>{tr("Уточни город")}</h1>
      <p class={styles.lede}>{tr("Сначала страна, потом город из списка.")}</p>
      <form class={styles.onboard} onSubmit={submit}>
        <label>{tr("страна")}<select value={country} onChange={(event) => { setCountry(event.currentTarget.value); setCity(""); }} required>{(host.catalog.places || []).map((place) => <option key={place.country} value={place.country}>{tr(place.country)}</option>)}</select></label>
        <label>{tr("город")}<select value={city} onChange={(event) => setCity(event.currentTarget.value)} required><option value="">{tr("выбери город")}</option>{cities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
        <div class={styles.actions}><Button variant="solid" type="submit" disabled={busy} loading={busy}>{tr("сохранить и продолжить")}</Button></div>
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
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const batchRef = useRef(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoConsent, setPhotoConsent] = useState(!host.user.needs_photo_consent);
  const needsPhotoConsent = Boolean(host.user.needs_photo_consent);
  const cities = (host.catalog.places || []).flatMap((place) => place.cities).filter((value, index, list) => list.indexOf(value) === index);
  const existingPhotos = photosOf(user);
  const addFiles = (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const next = Array.from(event.currentTarget.files || []);
    if (!next.length) return;
    if (needsPhotoConsent && !photoConsent) {
      setError(tr("Сначала отметь галочку про свои фото — ниже, над кнопкой «+»."));
      return;
    }
    event.currentTarget.value = "";
    batchRef.current = next.length;
    setCropQueue(next);
  };
  const acceptCrop = (file: File) => {
    setFiles((current) => [...current, file]);
    setPreviews((current) => [...current, URL.createObjectURL(file)]);
    setCropQueue((queue) => queue.slice(1));
  };
  const skip = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await host.api("/api/onboard/skip", { method: "POST" }); const next = await host.refreshUser(); setUser(next); host.onUserUpdated(next); host.navigate("deck"); } catch (caught) { setError(getErrorMessage(caught)); setBusy(false); }
  };
  const submit = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    if (!city) { setError(tr("выбери город")); return; }
    if (files.length && needsPhotoConsent && !photoConsent) {
      setError(tr("Сначала отметь галочку про свои фото."));
      return;
    }
    if (busy) return;
    setBusy(true); setError("");
    try {
      for (const file of files) await host.uploadPhoto(file, photoConsent);
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
    <AccountHeader host={host} title={tr("настройка")} back={false} />
    <main class={styles.content}><section class={styles.panel}>
      <h1>{tr("Ещё чуть-чуть")}</h1>
      <p class={styles.lede}>{tr("Два фото и один промпт сильно лучше пустой анкеты. Можно пропустить, но тогда тебя труднее узнать.")}</p>
      <form class={styles.onboard} onSubmit={submit}>
        <div>
          <p class={styles.subtle}>{tr("фото — хотя бы ещё одно")}</p>
          {needsPhotoConsent ? (
            <Checkbox name="photo_rights_consent" checked={photoConsent} onChange={setPhotoConsent}>
              {tr("Загружаю только свои фото и разрешаю показывать их участникам WIRING")}</Checkbox>
          ) : null}
          <div class={styles.photoGrid}>{existingPhotos.map((photo) => <div class={styles.photoCell} key={photo.id}><img src={photoSrc(host, photo.url, String(user.name || tr("Профиль")))} alt="" /></div>)}{previews.map((src, index) => <div class={styles.photoCell} key={`${src}-${index}`}><img src={src} alt={tr("новое фото")} /></div>)}<label class={styles.fileAdd}><span aria-hidden="true">+</span><input type="file" accept="image/*" multiple disabled={busy || cropQueue.length > 0} onChange={addFiles} /></label></div>
          {cropQueue[0] ? <PhotoCropper file={cropQueue[0]} title={batchRef.current > 1 ? tr("Кадр · {0} из {1}", batchRef.current - cropQueue.length + 1, batchRef.current) : tr("Кадр")} onCancel={() => setCropQueue([])} onConfirm={acceptCrop} /> : null}
        </div>
        <label>{tr("город ")}<span class={styles.subtle}>{tr("(необязательно)")}</span><select value={city} onChange={(event) => setCity(event.currentTarget.value)}><option value="">{tr("не указывать")}</option>{cities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>{tr("как тебе писать")}<textarea maxlength={500} placeholder={tr("сразу по делу, голосовые ок / нет")} value={communication} onInput={(event) => setCommunication(event.currentTarget.value)} /></label>
        <label>{host.catalog.prompts?.find((item) => item.id === promptId)?.label || tr("один промпт")}<textarea maxlength={280} placeholder={tr("расскажи что-то важное о себе")} value={promptAnswer} onInput={(event) => setPromptAnswer(event.currentTarget.value)} /></label>
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
        <div class={styles.actions}><Button variant="solid" slim type="submit" disabled={busy} loading={busy}>{tr("дальше в ленту")}</Button><Button variant="ghost" slim type="button" disabled={busy} onClick={() => void skip()}>{tr("пропустить")}</Button></div>
      </form>
    </section><LegalFooter /></main>
  </div>;
}
