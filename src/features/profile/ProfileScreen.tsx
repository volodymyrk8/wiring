import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import {
  AppHeader,
  Button,
  Input,
  LegalFooter,
  ProfileMenu,
  Select,
  Switch,
  TagPicker,
  Textarea,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
import type { CatalogItem, ProfileHostBridge, ProfilePhoto, ProfileUser } from "./types";
import styles from "./ProfileScreen.module.css";

type Prompt = { id: string; answer: string };
type Draft = {
  name: string;
  age: string;
  country: string;
  city: string;
  gender: string;
  lookingFor: string;
  height: string;
  job: string;
  bio: string;
  communication: string;
  neuro: string[];
  vibe: string[];
  intents: string[];
  seekMinAge: string;
  seekMaxAge: string;
  seekPlace: string;
  hideNeuro: string[];
  hideVibe: string[];
  prompts: Prompt[];
  photoConsent: boolean;
};

type Props = { host: ProfileHostBridge };

const draftStorageKey = (userId: number) => `wiring-profile-draft-${userId}`;

const valueOf = (value: unknown, fallback = "") => (value === null || value === undefined ? fallback : String(value));
const idsOf = (value: unknown, fallback: string[] = []) => (Array.isArray(value) ? value.map(String) : fallback);

const allPhotos = (user: ProfileUser): ProfilePhoto[] => {
  if (Array.isArray(user.photos) && user.photos.length) return user.photos;
  return (user.albums || []).flatMap((album) => album.photos || []);
};

function makeDraft(user: ProfileUser, catalog: ProfileHostBridge["catalog"]): Draft {
  const city = valueOf(user.city);
  const places = catalog.places || [];
  const country = places.find((place) => place.cities.includes(city))?.country || places[0]?.country || "";
  const hidden = idsOf(user.hide_tags);
  const intents = idsOf(user.intents, user.intent ? [user.intent] : ["dating"]);
  return {
    name: valueOf(user.name),
    age: valueOf(user.age),
    country,
    city,
    gender: valueOf(user.gender),
    lookingFor: valueOf(user.looking_for),
    height: valueOf(user.height),
    job: valueOf(user.job),
    bio: valueOf(user.bio),
    communication: valueOf(user.communication),
    neuro: idsOf(user.neuro),
    vibe: idsOf(user.vibe),
    intents,
    seekMinAge: valueOf(user.seek_min_age, "18"),
    seekMaxAge: valueOf(user.seek_max_age, "99"),
    seekPlace: valueOf(user.seek_place),
    hideNeuro: hidden.filter((id) => (catalog.neuro || []).some((item) => item.id === id)),
    hideVibe: hidden.filter((id) => (catalog.vibe || []).some((item) => item.id === id)),
    prompts: (Array.isArray(user.prompts) ? user.prompts : []).map((prompt) => ({ id: String(prompt.id), answer: String(prompt.answer || "") })),
    photoConsent: !user.needs_photo_consent,
  };
}

const photoSrc = (basePath: string, photo: unknown, name: string) => {
  if (typeof photo === "object" && photo) photo = (photo as { url?: string }).url;
  if (typeof photo === "string" && photo) {
    if (photo.startsWith("data:") || photo.startsWith("blob:") || photo.startsWith("http")) return photo;
    if (photo.startsWith("/")) return `${basePath}${photo}`;
    return `${basePath}/public/${photo}`;
  }
  const hue = [...(name || "?")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const initial = [...String(name || "?").trim()][0]?.toUpperCase() || "?";
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 32% 28%)"/><text x="32" y="32" dominant-baseline="central" text-anchor="middle" fill="#d8ff3c" font-size="26" font-family="Georgia">${initial}</text></svg>`)}`;
};

function PhotoManager({ host, user, consent, onChange }: { host: ProfileHostBridge; user: ProfileUser; consent: boolean; onChange: (user: ProfileUser) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photos = allPhotos(user);
  const name = valueOf(user.name, "Профиль");

  const refresh = async () => onChange(await host.refreshUser());
  const upload = async (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of files) await host.uploadPhoto(file, consent);
      await refresh();
      host.toast(files.length > 1 ? "фото добавлены" : "фото добавлено");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const makePrimary = async (id: number) => {
    setBusy(true);
    try {
      await host.setPrimaryPhoto(id);
      await refresh();
      host.toast("это теперь аватар");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Убрать это фото?")) return;
    setBusy(true);
    try {
      await host.deletePhoto(id);
      await refresh();
      host.toast("фото удалено");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class={styles.photosBlock}>
      <div class={styles.photoGrid}>
        {photos.map((photo) => (
          <div key={photo.id} class={`${styles.photoCell}${photo.is_primary ? ` ${styles.primary}` : ""}`}>
            <button type="button" class={styles.photoPick} disabled={busy} onClick={() => makePrimary(photo.id)} aria-label={photo.is_primary ? "Это аватар" : "Сделать аватаром"}>
              <img src={photoSrc(host.basePath, photo.url, name)} alt="" />
            </button>
            {photo.is_primary && <span class={styles.avatarBadge}>аватар</span>}
            <button type="button" class={styles.photoDelete} disabled={busy} onClick={() => remove(photo.id)} aria-label="Удалить фото">×</button>
          </div>
        ))}
        <label class={`${styles.photoAdd}${busy ? ` ${styles.disabled}` : ""}`}>
          <span aria-hidden="true">+</span>
          <input type="file" accept="image/*" multiple disabled={busy} onChange={upload} />
        </label>
      </div>
      {error && <p class={styles.error} role="alert">{error}</p>}
    </div>
  );
}

function optionList(items: CatalogItem[] | undefined) {
  return (items || []).map((item) => ({ value: item.id, label: item.label }));
}

export function ProfileScreen({ host }: Props) {
  const [user, setUser] = useState(host.user);
  const [draft, setDraft] = useState(() => makeDraft(host.user, host.catalog));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyState, setNotifyState] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  });
  const draftTimerRef = useRef<number | null>(null);
  const draftSyncRef = useRef(false);

  const signed = !user.guest;
  const profilePayload = () => ({
    name: draft.name.trim(),
    age: Number(draft.age) || undefined,
    city: draft.city.trim(),
    gender: draft.gender,
    looking_for: draft.lookingFor,
    height: draft.height ? Number(draft.height) : null,
    job: draft.job.trim(),
    bio: draft.bio,
    communication: draft.communication,
    neuro: draft.neuro,
    vibe: draft.vibe,
    intents: draft.intents,
    seek_min_age: Number(draft.seekMinAge || 18),
    seek_max_age: Number(draft.seekMaxAge || 99),
    seek_place: draft.seekPlace,
    hide_tags: [...draft.hideNeuro, ...draft.hideVibe],
    prompts: draft.prompts.filter((prompt) => prompt.answer.trim().length >= 4),
    special_data_consent: draft.neuro.length ? true : undefined,
    photo_rights_consent: draft.photoConsent ? true : undefined,
  });

  const userId = Number(user.id || 0);

  useEffect(() => {
    if (!signed || !userId) return;
    try {
      const raw = localStorage.getItem(draftStorageKey(userId));
      if (!raw) return;
      const stored = JSON.parse(raw) as Draft;
      setDraft((current) => ({ ...current, ...stored }));
    } catch {
      /* ignore corrupt draft */
    }
  }, [signed, userId]);

  useEffect(() => {
    if (!signed || !userId || draftSyncRef.current) return;
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(draftStorageKey(userId), JSON.stringify(draft));
      } catch {
        /* ignore quota */
      }
      void (async () => {
        try {
          await host.api("/api/me", {
            method: "PATCH",
            body: JSON.stringify({ ...profilePayload(), draft: true }),
          });
        } catch {
          /* offline or validation — local copy still kept */
        }
      })();
    }, 1400);
    return () => {
      if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    };
  }, [draft, signed, userId]);
  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setServerError("");
  };
  const inputValue = (key: keyof Draft) => String(draft[key]);
  const places = host.catalog.places || [];
  const cities = places.find((place) => place.country === draft.country)?.cities || [];
  const primaryPhoto = allPhotos(user).find((photo) => photo.is_primary) || allPhotos(user)[0];

  const validate = () => {
    const next: Record<string, string> = {};
    if (draft.name.trim().length < 2 || draft.name.trim().length > 32) next.name = "Имя: 2–32 символа";
    if (!draft.age || Number(draft.age) < 18 || Number(draft.age) > 99) next.age = "Возраст: 18–99";
    if (!draft.city.trim()) next.city = "Выбери город";
    if (!draft.neuro.length) next.neuro = "Отметь хотя бы одну особенность";
    if (!primaryPhoto && !user.photo) next.photos = "Нужно хотя бы одно фото";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveDraftNow = async () => {
    setServerError("");
    setBusy(true);
    try {
      const response = await host.api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ ...profilePayload(), draft: true }),
      });
      const nextUser = response.user as ProfileUser;
      setUser(nextUser);
      host.onUserUpdated(nextUser);
      try {
        localStorage.setItem(draftStorageKey(userId), JSON.stringify(draft));
      } catch {
        /* ignore */
      }
      host.toast(user.needs_profile ? "черновик сохранён · анкета ещё не в ленте" : "черновик сохранён");
    } catch (caught) {
      setServerError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    setServerError("");
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true);
    try {
      const response = await host.api("/api/me", {
        method: "PATCH",
        body: JSON.stringify(profilePayload()),
      });
      const nextUser = response.user as ProfileUser;
      draftSyncRef.current = true;
      setUser(nextUser);
      setDraft(makeDraft(nextUser, host.catalog));
      try {
        localStorage.removeItem(draftStorageKey(userId));
      } catch {
        /* ignore */
      }
      host.onUserUpdated(nextUser);
      host.toast("сохранено");
      draftSyncRef.current = false;
    } catch (caught) {
      setServerError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const notifyEnabled = user.notify_enabled !== false;
  const notifyPush = notifyEnabled && user.notify_push !== false;

  const patchNotifications = async (patch: { enabled?: boolean; push?: boolean }) => {
    if (notifyBusy) return;
    setNotifyBusy(true);
    setServerError("");
    try {
      let push = patch.push;
      if (push && typeof Notification !== "undefined") {
        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          setNotifyState(permission);
          if (permission !== "granted") push = false;
        } else if (Notification.permission === "denied") {
          push = false;
          host.toast("разреши уведомления в настройках браузера");
        }
      }
      const body: { enabled?: boolean; push?: boolean } = {};
      if (patch.enabled !== undefined) body.enabled = patch.enabled;
      if (push !== undefined) body.push = push;
      else if (patch.push !== undefined) body.push = patch.push;
      const response = await host.api("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const nextUser = response.user as ProfileUser;
      setUser(nextUser);
      host.onUserUpdated(nextUser);
    } catch (caught) {
      setServerError(getErrorMessage(caught));
    } finally {
      setNotifyBusy(false);
    }
  };

  const addPrompt = (event: JSX.TargetedEvent<HTMLSelectElement, Event>) => {
    const id = event.currentTarget.value;
    if (!id || draft.prompts.some((prompt) => prompt.id === id)) return;
    setDraft((current) => ({ ...current, prompts: [...current.prompts, { id, answer: "" }] }));
    event.currentTarget.value = "";
  };

  const handleNav = (view: string) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view);
  };

  return (
    <div class={styles.root}>
      <AppHeader
        homeHref={host.hrefFor("home")}
        onHomeClick={handleNav("home")}
        sectionTitle="Профиль"
        showThemeSwatches
        onThemeSelect={host.onThemeSelect}
        rightSlot={signed ? (
          <ProfileMenu
            avatarUrl={profileMenuAvatarUrl(host.basePath, primaryPhoto?.url || user.photo)}
            userName={valueOf(user.name)}
            isPlus={Boolean(user.plus)}
            profileHref={host.hrefFor("profile")}
            consentsHref={host.hrefFor("consents")}
            plusHref={host.hrefFor("plus")}
            onProfileClick={handleNav("profile")}
            onConsentsClick={handleNav("consents")}
            onPlusClick={handleNav("plus")}
            onLogout={host.onLogout}
          />
        ) : null}
      />

      {!signed ? (
        <main class={styles.guestCard}>
          <h1>Собери свой профиль</h1>
          <div class={styles.actions}>
            <Button fullWidth href={host.hrefFor("register")} nav="register" onClick={handleNav("register")}>Создать профиль</Button>
            <Button variant="ghost" fullWidth href={host.hrefFor("home")} nav="home" onClick={handleNav("home")}>На главную</Button>
          </div>
        </main>
      ) : (
        <main class={styles.content}>
          <div class={styles.heading}>
            <div>
              <h1>{user.plus ? <>{valueOf(user.name)} <span class={styles.plusBadge}>WIRING+</span></> : valueOf(user.name, "Профиль")}</h1>
            </div>
          </div>

          {user.needs_profile ? (
            <p class={styles.draftHint} role="status">
              Анкета пока не в ленте — можно сохранить черновик и вернуться позже. Для публикации нужны фото, город и хотя бы одна особенность.
            </p>
          ) : null}

          <form class={styles.form} onSubmit={save} noValidate>
            <section class={styles.section}>
              <div class={styles.sectionTitle}><h2>Фото</h2></div>
              <PhotoManager host={host} user={user} consent={draft.photoConsent} onChange={setUser} />
              {errors.photos && <p class={styles.error}>{errors.photos}</p>}
            </section>

            <section class={styles.section}>
              <div class={styles.sectionTitle}><h2>Основное</h2></div>
              <div class={styles.gridTwo}>
                <Input label="Имя" name="name" required maxLength={32} value={draft.name} error={errors.name} onInput={(event) => setField("name", event.currentTarget.value)} />
                <Input label="Возраст" name="age" type="number" required value={draft.age} error={errors.age} onInput={(event) => setField("age", event.currentTarget.value)} />
              </div>
              <div class={styles.gridTwo}>
                <Select className={styles.selectControl} label="Кто ты" id="profile-gender" options={optionList(host.catalog.genders)} value={draft.gender} onChange={(value) => setField("gender", value)} ariaLabel="Кто ты" />
                <Select className={styles.selectControl} label="Кого ищешь" id="profile-looking-for" options={optionList(host.catalog.looking_for)} value={draft.lookingFor} onChange={(value) => setField("lookingFor", value)} ariaLabel="Кого ищешь" />
              </div>
              <div class={styles.fieldGroup}>
                <Select className={styles.selectControl} label="Страна" id="profile-country" options={places.map((place) => ({ value: place.country, label: place.country }))} value={draft.country} onChange={(value) => setField("country", value)} ariaLabel="Страна" />
                <Input label="Город" name="city" id="profile-city" list="profile-city-list" required value={draft.city} error={errors.city} onInput={(event) => setField("city", event.currentTarget.value)} />
                <datalist id="profile-city-list">{cities.map((city) => <option key={city} value={city} />)}</datalist>
              </div>
              <div class={styles.fieldGroup}>
                <Input label="Рост, см" name="height" type="number" value={draft.height} hint="необязательно" onInput={(event) => setField("height", event.currentTarget.value)} />
                <Input label="Занятость" name="job" maxLength={60} value={draft.job} hint="необязательно" onInput={(event) => setField("job", event.currentTarget.value)} />
              </div>
            </section>

            <section class={styles.section}>
              <div class={styles.sectionTitle}><h2>Твоя схема</h2></div>
              <TagPicker options={host.catalog.neuro || []} selected={draft.neuro} onChange={(value) => { setField("neuro", value); setErrors((current) => ({ ...current, neuro: "" })); }} label="Диагнозы и особенности" />
              {errors.neuro && <p class={styles.error}>{errors.neuro}</p>}
              <TagPicker options={host.catalog.vibe || []} selected={draft.vibe} onChange={(value) => setField("vibe", value)} label="Вайб анкеты — как с тобой лучше быть" tone="vibe" />
              <TagPicker options={host.catalog.intents || []} selected={draft.intents} onChange={(value) => setField("intents", value)} label="Зачем ты здесь — можно несколько" />
            </section>

            <section class={styles.section}>
              <div class={styles.sectionTitle}><h2>Текст</h2></div>
              <Textarea label="О себе" name="bio" maxLength={1200} value={draft.bio} hint="специальный интерес, сенсорные лимиты, чего лучше не делать" onInput={(event) => setField("bio", event.currentTarget.value)} />
              <Textarea label="Как тебе писать" name="communication" maxLength={280} value={draft.communication} hint="голосовые ок / нет, small talk — сразу в блок" onInput={(event) => setField("communication", event.currentTarget.value)} />
              <div class={styles.promptList}>
                <div class={styles.subheading}><h3>Промпты</h3><span>до трёх</span></div>
                {draft.prompts.map((prompt, index) => {
                  const title = host.catalog.prompts?.find((item) => item.id === prompt.id)?.label || prompt.id;
                  return <div class={styles.prompt} key={`${prompt.id}-${index}`}><div class={styles.promptHead}><strong>{title}</strong><button type="button" onClick={() => setField("prompts", draft.prompts.filter((_, itemIndex) => itemIndex !== index))}>убрать</button></div><textarea value={prompt.answer} maxLength={280} placeholder="твой ответ" onInput={(event) => { const next = draft.prompts.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.currentTarget.value } : item); setField("prompts", next); }} /></div>;
                })}
                {draft.prompts.length < 3 && <select class={styles.addPrompt} defaultValue="" onChange={addPrompt}><option value="">Добавить вопрос…</option>{(host.catalog.prompts || []).filter((item) => !draft.prompts.some((prompt) => prompt.id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
              </div>
            </section>

            <section class={`${styles.section} ${styles.plusSection}`}>
              <div class={styles.sectionTitle}><h2>Кто может тебя находить</h2></div>
              <div class={styles.gridTwo}><Input label="От" name="seek_min_age" type="number" value={draft.seekMinAge} onInput={(event) => setField("seekMinAge", event.currentTarget.value)} /><Input label="До" name="seek_max_age" type="number" value={draft.seekMaxAge} onInput={(event) => setField("seekMaxAge", event.currentTarget.value)} /></div>
              <Select className={styles.selectControl} label="Место" id="profile-seek-place" options={[{ value: "", label: "Везде" }, ...(draft.city ? [{ value: draft.city, label: `Только ${draft.city}` }] : []), ...places.map((place) => ({ value: place.country, label: place.country }))]} value={draft.seekPlace} onChange={(value) => setField("seekPlace", value)} ariaLabel="Место" />
              <TagPicker options={host.catalog.neuro || []} selected={draft.hideNeuro} onChange={(value) => setField("hideNeuro", value)} label="Не показывать, если у человека есть:" />
              <TagPicker options={host.catalog.vibe || []} selected={draft.hideVibe} onChange={(value) => setField("hideVibe", value)} label="Не показывать, если у человека такой вайб:" tone="vibe" />
            </section>

            <section class={styles.section}>
              <div class={styles.sectionTitle}><h2>Уведомления и WIRING+</h2></div>
              <div class={styles.notifyList}>
                <Switch
                  name="notify-enabled"
                  checked={notifyEnabled}
                  disabled={notifyBusy}
                  loading={notifyBusy}
                  onChange={(checked) => void patchNotifications({ enabled: checked })}
                >
                  уведомления о лайках и сообщениях — всплывающие подсказки на сайте
                </Switch>
                <Switch
                  name="notify-push"
                  checked={notifyPush && notifyState === "granted"}
                  disabled={notifyBusy || !notifyEnabled || notifyState === "unsupported"}
                  loading={notifyBusy}
                  onChange={(checked) => void patchNotifications({ push: checked })}
                >
                  системные уведомления — когда вкладка в фоне (Android, iOS, компьютер)
                </Switch>
              </div>
              {notifyEnabled && notifyState === "denied" ? (
                <p class={styles.notifyHint}>Браузер запретил системные уведомления. Их можно включить в настройках сайта в Safari или Chrome.</p>
              ) : null}
              {notifyEnabled && notifyState === "unsupported" ? (
                <p class={styles.notifyHint}>Этот браузер не показывает системные уведомления — останутся подсказки на сайте и счётчики в меню.</p>
              ) : null}
              <a class={styles.plusLink} href={host.hrefFor("plus")} data-nav="plus" onClick={handleNav("plus")}><span><strong>WIRING+</strong><small>{user.plus ? "активен" : "спокойный режим, инкогнито, пауза"}</small></span><span>настроить ↗</span></a>
              {user.ref_url && <div class={styles.infoCard}><div><strong>Пригласи своих</strong><p>WIRING+ на {user.ref_days || 30} дней вам обоим.</p></div><Button variant="ghost" slim onClick={() => { void navigator.clipboard?.writeText(String(user.ref_url)); host.toast("ссылка скопирована"); }}>Копировать</Button></div>}
            </section>

            {(serverError || errors.photos) && <div class={styles.serverError} role="alert">{serverError || errors.photos}</div>}
            <div class={styles.submitRow}>
              <Button type="submit" fullWidth disabled={busy} loading={busy}>{busy ? "Сохраняем…" : "Опубликовать в ленте"}</Button>
              <Button variant="ghost" type="button" fullWidth disabled={busy} onClick={() => void saveDraftNow()}>Сохранить черновик</Button>
              <Button variant="ghost" type="button" onClick={host.onLogout}>Выйти</Button>
              <Button variant="ghost" type="button" onClick={() => host.navigate("delete-account")}>Удалить аккаунт</Button>
            </div>
          </form>
        </main>
      )}
      <LegalFooter />
    </div>
  );
}
