import { tr } from "@/lib/i18n";
import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import {
  AppHeader,
  Button,
  Input,
  PhotoCropper,
  LegalFooter,
  ProfileMenu,
  Select,
  TagPicker,
  Textarea,
  Checkbox,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import { isProfilePhotoFile, PROFILE_PHOTO_ACCEPT } from "@/lib/profile-photo-file";
import { applyNeuroToggle, catalogIdSet, splitCatalogTags } from "@/lib/catalog-tags";
import { catalogCities, citySelectOptions, countryForCity } from "@/lib/places";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
import type { CatalogItem, ProfileHostBridge, ProfilePhoto, ProfileUser } from "./types";
import styles from "./ProfileScreen.module.css";
import { NameEditor } from "./NameEditor";
import { createDraftAutosave, type SaveState } from "./draft-autosave";

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
  specialConsent: boolean;
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
  const country = countryForCity(city, places);
  const hidden = idsOf(user.hide_tags);
  const intents = idsOf(user.intents, user.intent ? [user.intent] : ["dating"]);
  const tags = splitCatalogTags(idsOf(user.neuro), idsOf(user.vibe), catalog);
  const vibeIds = catalogIdSet(catalog.vibe);
  const neuroIds = catalogIdSet(catalog.neuro);
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
    specialConsent: !user.needs_special_consent,
    neuro: tags.neuro,
    vibe: tags.vibe,
    intents,
    seekMinAge: valueOf(user.seek_min_age, "18"),
    seekMaxAge: valueOf(user.seek_max_age, "99"),
    seekPlace: valueOf(user.seek_place),
    hideNeuro: hidden.filter((id) => neuroIds.has(id)),
    hideVibe: hidden.filter((id) => vibeIds.has(id)),
    prompts: (Array.isArray(user.prompts) ? user.prompts : []).map((prompt) => ({ id: String(prompt.id), answer: String(prompt.answer || "") })),
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

function PhotoManager({
  host,
  user,
  onChange,
  compact = false,
}: {
  host: ProfileHostBridge;
  user: ProfileUser;
  onChange: (user: ProfileUser) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [cropError, setCropError] = useState("");
  const batchRef = useRef(1);
  const cropLock = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const makePrimaryAfterCrop = useRef(false);
  const photos = allPhotos(user);
  const name = valueOf(user.name, tr("Профиль"));

  const refresh = async () => onChange(await host.refreshUser());
  const armPicker = () => host.armFilePickerHistoryGuard?.();
  const disarmPicker = () => host.disarmFilePickerHistoryGuard?.();
  const queuePhotoFiles = (files: File[]) => {
    const images = files.filter(isProfilePhotoFile);
    const rejected = files.length - images.length;
    if (rejected) {
      setError(tr("Нужно фото (jpg, png, webp), не видео. Screen recording из «Фото» — это mp4, его сюда не загрузить."));
    }
    if (!images.length) return;
    setError("");
    setCropError("");
    batchRef.current = images.length;
    setCropQueue(images);
  };
  const upload = async (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    disarmPicker();
    if (!files.length) return;
    queuePhotoFiles(files);
  };

  const pickAvatar = () => {
    setError("");
    avatarInputRef.current?.click();
  };

  const uploadAvatar = (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    disarmPicker();
    if (!file) return;
    makePrimaryAfterCrop.current = true;
    queuePhotoFiles([file]);
  };

  const acceptCrop = async (file: File) => {
    if (cropLock.current) return;
    cropLock.current = true;
    setBusy(true);
    setCropError("");
    try {
      const replaceAvatar = makePrimaryAfterCrop.current;
      const uploaded = await host.uploadPhoto(file);
      if (replaceAvatar && uploaded.photo?.id) {
        await host.setPrimaryPhoto(uploaded.photo.id);
      }
      makePrimaryAfterCrop.current = false;
      await refresh();
      const rest = cropQueue.slice(1);
      setCropQueue(rest);
      if (!rest.length) {
        disarmPicker();
        host.toast(replaceAvatar ? tr("аватар обновлён") : batchRef.current > 1 ? tr("фото добавлены") : tr("фото добавлено"));
      }
    } catch (caught) {
      setCropError(getErrorMessage(caught));
    } finally {
      cropLock.current = false;
      setBusy(false);
    }
  };

  const movePhoto = async (index: number, delta: number) => {
    if (busy) return;
    const ids = photos.map((photo) => photo.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    setBusy(true);
    try {
      await host.api("/api/photos/order", { method: "PATCH", body: JSON.stringify({ ids }) });
      await refresh();
    } catch (caught) { setError(getErrorMessage(caught)); }
    finally { setBusy(false); }
  };

  const makePrimary = async (id: number) => {
    setBusy(true);
    try {
      await host.setPrimaryPhoto(id);
      await refresh();
      host.toast(tr("это теперь аватар"));
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(tr("Убрать это фото?"))) return;
    setBusy(true);
    try {
      await host.deletePhoto(id);
      await refresh();
      host.toast(tr("фото удалено"));
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class={styles.photosBlock}>
      <p class={styles.photoHint}>{tr("Можно загрузить фото, рисунок или мем. Показывать лицо не обязательно.")}</p>
      {!compact && <div class={styles.photoToolbar}>
        <Button type="button" variant="ghost" slim disabled={busy || cropQueue.length > 0} onClick={pickAvatar}>{tr("Изменить аватар")}</Button>
        <p class={styles.photoHint}>{tr("Меняй порядок стрелками под фото. Первое фото — аватар в ленте.")}</p>
      </div>}
      <input ref={avatarInputRef} class={styles.srOnly} type="file" accept={PROFILE_PHOTO_ACCEPT} disabled={busy || cropQueue.length > 0} onClick={armPicker} onCancel={disarmPicker} onChange={uploadAvatar} />
      <div class={styles.photoGrid}>
        {photos.map((photo, index) => (
          <div key={photo.id} class={`${styles.photoCell}${photo.is_primary ? ` ${styles.primary}` : ""}`}>
            <button type="button" class={styles.photoPick} disabled={busy} onClick={() => makePrimary(photo.id)} aria-label={photo.is_primary ? tr("Это аватар") : tr("Сделать аватаром")}>
              <img src={photoSrc(host.basePath, photo.url, name)} alt="" />
            </button>
            <div class={styles.photoOrder}>
              <button type="button" disabled={busy || index === 0} onClick={() => void movePhoto(index, -1)} aria-label={tr("Передвинуть фото {0} влево", index + 1)}>←</button>
              <span>{index + 1}</span>
              <button type="button" disabled={busy || index === photos.length - 1} onClick={() => void movePhoto(index, 1)} aria-label={tr("Передвинуть фото {0} вправо", index + 1)}>→</button>
            </div>
            {photo.is_primary && <span class={styles.avatarBadge}>{tr("аватар")}</span>}
            <button type="button" class={styles.photoDelete} disabled={busy} onClick={() => remove(photo.id)} aria-label={tr("Удалить фото")}>×</button>
          </div>
        ))}
        <label class={`${styles.photoAdd}${busy ? ` ${styles.disabled}` : ""}`}>
          <span aria-hidden="true">+</span>
          <input type="file" accept={PROFILE_PHOTO_ACCEPT} multiple disabled={busy || cropQueue.length > 0} onClick={armPicker} onCancel={disarmPicker} onChange={upload} />
        </label>
      </div>
      {error && <p class={styles.error} role="alert">{error}</p>}
      {cropQueue[0] ? (
        <PhotoCropper
          file={cropQueue[0]}
          title={batchRef.current > 1 ? tr("Кадр · {0} из {1}", batchRef.current - cropQueue.length + 1, batchRef.current) : tr("Кадр")}
          busy={busy}
          error={cropError}
          onCancel={() => { disarmPicker(); setCropQueue([]); setCropError(""); }}
          onConfirm={(file) => { void acceptCrop(file); }}
        />
      ) : null}
    </div>
  );
}

function optionList(items: CatalogItem[] | undefined) {
  return (items || []).map((item) => ({ value: item.id, label: item.label }));
}

const profilePayload = (draft: Draft) => ({
  name: draft.name.trim(),
  age: draft.age ? Number(draft.age) : null,
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
  prompts: draft.prompts,
  special_data_consent: draft.specialConsent ? true : undefined,
});

function restoreDraft(host: ProfileHostBridge): { value: Draft; restored: boolean } {
  const initial = makeDraft(host.user, host.catalog);
  if (!host.user.id || host.user.guest) return { value: initial, restored: false };
  try {
    const raw = localStorage.getItem(draftStorageKey(host.user.id));
    if (!raw) return { value: initial, restored: false };
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { value: initial, restored: false };
    const entries = Object.entries(initial).map(([key, fallback]) => {
      const candidate = stored[key];
      const valid = key === "prompts"
        ? Array.isArray(candidate) && candidate.every((item: unknown) => item && typeof item === "object" && "id" in item && typeof item.id === "string" && "answer" in item && typeof item.answer === "string")
        : Array.isArray(fallback)
          ? Array.isArray(candidate) && candidate.every((item: unknown) => typeof item === "string")
          : typeof candidate === typeof fallback;
      return [key, valid ? candidate : fallback];
    });
    const merged = Object.fromEntries(entries) as Draft;
    const tags = splitCatalogTags(merged.neuro, merged.vibe, host.catalog);
    const value = { ...merged, name: host.user.needs_profile_setup ? merged.name : initial.name, neuro: tags.neuro, vibe: tags.vibe };
    return { value, restored: JSON.stringify(value) !== JSON.stringify(initial) };
  } catch {
    return { value: initial, restored: false };
  }
}

export function ProfileScreen({ host }: Props) {
  const [user, setUser] = useState(host.user);
  const [initialDraft] = useState(() => restoreDraft(host));
  const [draft, setRenderedDraft] = useState(initialDraft.value);
  const [saveState, setSaveState] = useState<SaveState>({
    phase: initialDraft.restored ? "waiting" : "idle", local: initialDraft.restored, error: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [jevError, setJevError] = useState("");
  const [jevBusy, setJevBusy] = useState(false);
  const [recommendationsCode, setRecommendationsCode] = useState("");
  const [busy, setBusy] = useState(false);
  const signed = !user.guest;
  const [autosave] = useState(() => createDraftAutosave<Draft, { user: ProfileUser }>({
    key: draftStorageKey(Number(host.user.id || 0)),
    initial: initialDraft.value,
    restored: initialDraft.restored,
    storage: () => localStorage,
    save: (value, publish) => {
      // Only the explicit NameEditor may rename; stale drafts/devices must not.
      const { name, ...fields } = profilePayload(value);
      const payload = host.user.needs_profile_setup ? { ...fields, name } : fields;
      return host.api("/api/me", { method: "PATCH", body: JSON.stringify({ ...payload, draft: !publish }) });
    },
    onSaved: (response) => {
      setServerError("");
      setUser(response.user);
      host.onUserUpdated(response.user);
    },
    onState: setSaveState,
  }));
  const setDraft = (update: Draft | ((current: Draft) => Draft)) => {
    const next = typeof update === "function" ? update(autosave.value) : update;
    if (signed && host.user.id) autosave.update(next);
    setRenderedDraft(next);
  };
  useEffect(() => {
    if (!signed || !host.user.id) return;
    autosave.start();
    const retry = () => { void autosave.save().catch(() => {}); };
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("online", retry);
      autosave.dispose();
    };
  }, [autosave, signed]);
  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setServerError("");
  };
  const inputValue = (key: keyof Draft) => String(draft[key]);
  const places = host.catalog.places || [];
  const cityOptions = catalogCities(places, draft.country || undefined);
  const countryOptions = [{ value: "", label: tr("Не указана") }, ...places.map((place) => ({ value: place.country, label: tr(place.country) }))];
  const primaryPhoto = allPhotos(user).find((photo) => photo.is_primary) || allPhotos(user)[0];

  const setCity = (nextCity: string) => {
    const trimmed = nextCity.trim();
    if (!trimmed) {
      setDraft((current) => ({ ...current, city: "", country: "" }));
      setErrors((current) => ({ ...current, city: "" }));
      setServerError("");
      return;
    }
    const nextCountry = countryForCity(trimmed, places);
    setDraft((current) => ({
      ...current,
      city: trimmed,
      country: nextCountry || current.country,
    }));
    setErrors((current) => ({ ...current, city: "" }));
    setServerError("");
  };

  const setCountry = (nextCountry: string) => {
    setDraft((current) => {
      if (!nextCountry) {
        return { ...current, country: "", city: "" };
      }
      const citiesInCountry = places.find((place) => place.country === nextCountry)?.cities || [];
      const cityOk = !current.city || citiesInCountry.includes(current.city);
      return {
        ...current,
        country: nextCountry,
        city: cityOk ? current.city : "",
      };
    });
    setErrors((current) => ({ ...current, city: "" }));
    setServerError("");
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (draft.name.trim().length < 2 || draft.name.trim().length > 32) next.name = tr("Имя: 2–32 символа");
    if (!draft.age || !Number.isInteger(Number(draft.age)) || Number(draft.age) < 18 || Number(draft.age) > 99) next.age = tr("Возраст: 18–99");
    if (!primaryPhoto && !user.photo) next.photos = tr("Нужно хотя бы одно фото");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const redeemRecommendations = async () => {
    if (jevBusy || !recommendationsCode.trim()) return;
    setJevBusy(true); setJevError("");
    try {
      const response = await host.api("/api/premium/redeem", {
        method: "POST", body: JSON.stringify({ code: recommendationsCode.trim() }),
      });
      const nextUser = response.user as ProfileUser;
      setUser(nextUser); host.onUserUpdated(nextUser); setRecommendationsCode("");
      host.toast(nextUser.jev_feed_unlocked ? tr("Подбор открыт — включи вкладку «Для тебя»") : tr("Промокод активирован"));
    } catch (caught) {
      setJevError(getErrorMessage(caught));
    } finally { setJevBusy(false); }
  };

  const setJevFeedEnabled = async (enabled: boolean) => {
    setJevError("");
    setJevBusy(true);
    try {
      const response = await host.api("/api/me/jev-feed", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      const nextUser = response.user as ProfileUser;
      setUser(nextUser);
      host.onUserUpdated(nextUser);

      host.toast(enabled ? tr("вкладка «Для тебя» включена") : tr("вкладка «Для тебя» выключена"));
    } catch (caught) {
      setJevError(getErrorMessage(caught));
    } finally {
      setJevBusy(false);
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
      await autosave.save(true);
      host.toast(tr("сохранено"));
      if (host.user.needs_profile_setup) host.navigate("deck");
    } catch (caught) {
      setServerError(getErrorMessage(caught));
    } finally {
      setBusy(false);
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

  if (user.needs_profile_setup) return (
    <div class={styles.root}>
      <AppHeader homeHref={host.hrefFor("home")} sectionTitle={tr("Заверши анкету")} />
      <main class={`${styles.content} ${styles.setupContent}`}>
        <div class={styles.heading}><h1>{tr("Заверши анкету")}</h1></div>
        <p class={styles.disclaimer}>{tr("Укажи имя, возраст и добавь изображение. Остальное можно заполнить позже.")}</p>
        <p class={styles.disclaimer}>{tr("Анкета появится в ленте только после публикации.")}</p>
        <form class={styles.form} onSubmit={save} noValidate>
          <Input label={tr("Имя")} name="name" value={draft.name} error={errors.name} onInput={event => setField("name", event.currentTarget.value)} />
          <Input label={tr("Возраст")} name="age" type="number" min={18} max={99} value={draft.age} error={errors.age} onInput={event => setField("age", event.currentTarget.value)} />
          <PhotoManager compact host={host} user={user} onChange={next => { setUser(next); host.onUserUpdated(next); if (allPhotos(next).length || next.photo) setErrors(current => ({ ...current, photos: "" })); }} />
          {draft.neuro.length > 0 && <Checkbox name="special_data_consent" checked={draft.specialConsent} onChange={value => setField("specialConsent", value)}>{tr("Согласен(на) на обработку и показ выбранных особенностей")}</Checkbox>}
          {errors.photos && <p class={styles.error}>{errors.photos}</p>}
          {serverError && <p class={styles.error} role="alert">{serverError}</p>}
          {saveState.phase === "error" && <p class={styles.error}>{saveState.error}</p>}
          <Button type="submit" variant="solid" loading={busy} disabled={busy}>{tr("Опубликовать анкету")}</Button>
        </form>
      </main>
    </div>
  );

  return (
    <div class={styles.root}>
      <AppHeader
        homeHref={host.hrefFor("home")}
        onHomeClick={handleNav("home")}
        showBack
        backHref={host.hrefFor("deck")}
        backNav="deck"
        onBackClick={handleNav("deck")}
        sectionTitle={tr("Профиль")}
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
            notificationsHref={host.hrefFor("notifications")}
            archiveHref={host.hrefFor("archive")}
            onProfileClick={handleNav("profile")}
            onConsentsClick={handleNav("consents")}
            onPlusClick={handleNav("plus")}
            onNotificationsClick={handleNav("notifications")}
            onArchiveClick={handleNav("archive")}
            onLogout={host.onLogout}
          />
        ) : null}
      />

      {!signed ? (
        <main class={styles.guestCard}>
          <h1>{tr("Собери свой профиль")}</h1>
          <div class={styles.actions}>
            <Button fullWidth href={host.hrefFor("register")} nav="register" onClick={handleNav("register")}>{tr("Создать профиль")}</Button>
            <Button variant="ghost" fullWidth href={host.hrefFor("home")} nav="home" onClick={handleNav("home")}>{tr("На главную")}</Button>
          </div>
        </main>
      ) : (
        <main class={styles.content}>
          <div class={styles.heading}>
            <div>
              <h1>{user.plus ? <>{valueOf(user.name)} <span class={styles.plusBadge}>WIRING+</span></> : valueOf(user.name, tr("Профиль"))}</h1>
            </div>
          </div>

          <p class={styles.draftHint}>{tr("Чем больше заполнишь анкету, тем проще будет начать разговор.")}</p>

          {user.needs_profile ? (
            <p class={styles.draftHint} role="status">
              {tr("Анкета пока не в ленте. Для публикации нужны имя, возраст и изображение. Остальное — по желанию.")}</p>
          ) : null}

          <div class={styles.saveStatus}>
            <p role="status" aria-live="polite" aria-atomic="true">
              {saveState.phase === "idle" ? tr("Изменения сохраняются автоматически") :
                saveState.phase === "saved" ? tr("Все изменения сохранены") :
                saveState.phase === "saving" ? tr("Сохраняем…") :
                saveState.phase === "waiting" ? (saveState.local ? tr("Изменения на устройстве · ждём сохранения на сервере") : tr("Изменения ещё не сохранены")) :
                saveState.local ? tr("Черновик на этом устройстве · на сервере не сохранён") : tr("Изменения не сохранены — оставь страницу открытой")}
            </p>
            {saveState.phase === "error" ? <>
              <p class={styles.error}>{tr(saveState.error)}</p>
              <Button variant="ghost" slim type="button" disabled={busy} onClick={() => void autosave.save().catch(() => {})}>{tr("Повторить сохранение")}</Button>
            </> : null}
          </div>

          <form class={styles.form} onSubmit={save} noValidate>
            <section class={styles.section}>
              <div class={styles.sectionTitle}><h2>{tr("Фото")}</h2></div>
              <PhotoManager
                host={host}
                user={user}
                onChange={setUser}
              />
              {errors.photos && <p class={styles.error}>{errors.photos}</p>}
            </section>

            <section class={styles.section}>
              <div class={styles.sectionTitle}><h2>{tr("Основное")}</h2></div>
              <div class={styles.gridTwo}>
                <NameEditor key={String(user.name)} user={user} saveName={(name, signal) => autosave.runExclusive(async () => {
                  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
                  const response = await host.api("/api/me", { method: "PATCH", signal, body: JSON.stringify({ name, draft: true }) });
                  return response.user as ProfileUser;
                })} onChanged={(next) => { setUser(next); host.onUserUpdated(next); setRenderedDraft((current) => ({ ...current, name: String(next.name || "") })); }} />
                <Input label={tr("Возраст")} name="age" type="number" required value={draft.age} error={errors.age} onInput={(event) => setField("age", event.currentTarget.value)} />
              </div>
              <div class={styles.gridTwo}>
                <Select className={styles.selectControl} label={tr("Пол")} id="profile-gender" options={optionList(host.catalog.genders)} value={draft.gender} onChange={(value) => setField("gender", value)} ariaLabel={tr("Пол")} />
                <Select className={styles.selectControl} label={tr("Кого ищешь")} id="profile-looking-for" options={optionList(host.catalog.looking_for)} value={draft.lookingFor} onChange={(value) => setField("lookingFor", value)} ariaLabel={tr("Кого ищешь")} />
              </div>
              <div class={styles.fieldGroup}>
                <Select
                  className={styles.selectControl}
                  label={tr("Страна")}
                  id="profile-country"
                  searchable
                  searchPlaceholder={tr("Найти страну")}
                  placeholder={tr("Не указана")}
                  options={countryOptions}
                  value={draft.country}
                  onChange={setCountry}
                  ariaLabel={tr("Страна")}
                />
                <Select
                  className={styles.selectControl}
                  menuClassName={styles.citySelectMenu}
                  label={tr("Город")}
                  id="profile-city"
                  placeholder={tr("Не указан")}
                  searchable
                  searchPlaceholder={tr("Город")}
                  options={citySelectOptions(cityOptions, host.catalog.city_search, { value: "", label: tr("Не указан") })}
                  value={draft.city}
                  error={errors.city}
                  onChange={setCity}
                  ariaLabel={tr("Город")}
                />
              </div>
              <div class={styles.fieldGroup}>
                <Input label={tr("Рост, см")} name="height" type="number" value={draft.height} hint={tr("необязательно")} onInput={(event) => setField("height", event.currentTarget.value)} />
                <Input label={tr("Занятость")} name="job" maxLength={60} value={draft.job} hint={tr("необязательно")} onInput={(event) => setField("job", event.currentTarget.value)} />
              </div>
            </section>

            <section class={styles.section}>
              <div class={styles.sectionTitle}><h2>{tr("Мои особенности")}</h2><span>{tr("по желанию")}</span></div>
              <TagPicker options={host.catalog.neuro || []} selected={draft.neuro} onChange={(value) => { setField("neuro", applyNeuroToggle(draft.neuro, value)); setErrors((current) => ({ ...current, neuro: "" })); }} label={tr("Особенности — по желанию")} />
              {errors.neuro && <p class={styles.error}>{errors.neuro}</p>}
              {draft.neuro.length > 0 && <Checkbox name="special_data_consent" checked={draft.specialConsent} onChange={value => setField("specialConsent", value)}>{tr("Согласен(на) на обработку и показ выбранных особенностей")}</Checkbox>}
              <TagPicker options={host.catalog.vibe || []} selected={draft.vibe} onChange={(value) => setField("vibe", value)} label={tr("Как ты устроен(а) и как тебе комфортнее общаться")} tone="vibe" />
              <p class={styles.disclaimer}>{tr("Диагнозы не проверяем: люди указывают их сами. Если заметим ложь, аккаунт может быть забанен.")}</p>
              <TagPicker options={host.catalog.intents || []} selected={draft.intents} onChange={(value) => setField("intents", value)} label={tr("Зачем ты здесь — можно несколько сразу; формат общения решаете в переписке")} />
            </section>

            <section class={styles.section}>
              <Textarea label={tr("Био")} name="bio" maxLength={1200} value={draft.bio} hint={tr("специальный интерес, сенсорные лимиты, чего лучше не делать")} onInput={(event) => setField("bio", event.currentTarget.value)} />
              <Textarea label={tr("Как тебе писать")} name="communication" maxLength={500} value={draft.communication} hint={tr("голосовые ок / нет, small talk — сразу в блок")} onInput={(event) => setField("communication", event.currentTarget.value)} />
              <div class={styles.promptList}>
                <div class={styles.subheading}><h3>{tr("Промпты")}</h3><span>{tr("до трёх")}</span></div>
                {draft.prompts.map((prompt, index) => {
                  const title = host.catalog.prompts?.find((item) => item.id === prompt.id)?.label || prompt.id;
                  return <div class={styles.prompt} key={`${prompt.id}-${index}`}><div class={styles.promptHead}><strong>{title}</strong><button type="button" onClick={() => setField("prompts", draft.prompts.filter((_, itemIndex) => itemIndex !== index))}>{tr("убрать")}</button></div><textarea value={prompt.answer} maxLength={280} placeholder={tr("твой ответ")} onInput={(event) => { const next = draft.prompts.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.currentTarget.value } : item); setField("prompts", next); }} /></div>;
                })}
                {draft.prompts.length < 3 && <select class={styles.addPrompt} defaultValue="" onChange={addPrompt}><option value="">{tr("Добавить вопрос…")}</option>{(host.catalog.prompts || []).filter((item) => !draft.prompts.some((prompt) => prompt.id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
              </div>
            </section>

            <section class={styles.section}>
              <div class={styles.sectionTitle}><h2>WIRING+</h2></div>
              <a class={styles.plusLink} href={host.hrefFor("plus")} data-nav="plus" onClick={handleNav("plus")}><span><strong>WIRING+</strong><small>{user.plus ? tr("активен") : tr("спокойный режим, инкогнито, пауза")}</small></span><span>{tr("настроить ↗")}</span></a>
              {user.ref_url && <div class={styles.infoCard}><div><strong>{tr("Пригласи своих")}</strong><p>{tr("Ещё ")}{user.ref_days || 30} {tr(" дней WIRING+ вам обоим.")}</p></div><Button variant="ghost" slim onClick={() => { void navigator.clipboard?.writeText(String(user.ref_url)); host.toast(tr("ссылка скопирована")); }}>{tr("Копировать")}</Button></div>}
            </section>

            <section class={styles.section}>
                <div class={styles.sectionTitle}><h2>{tr("Для тебя")}</h2></div>
                {user.jev_feed_unlocked ? <Checkbox
                  name="jev_feed_enabled"
                  checked={Boolean(user.jev_feed_enabled)}
                  disabled={jevBusy || (!user.jev_feed_available && !user.jev_feed_enabled)}
                  onChange={(enabled) => void setJevFeedEnabled(enabled)}
                >
                  {tr("Включить вкладку «Для тебя»")}</Checkbox> : <div role="group" aria-label={tr("Активация рекомендаций")} onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); void redeemRecommendations(); }
                }}>
                  <p class={styles.recommendationsHint}>{tr("Доступ открывается по промокоду. После активации можно включить подбор.")}</p>
                  <Input name="recommendations_code" label={tr("Промокод для рекомендаций")} value={recommendationsCode} maxLength={24} autoComplete="off" onInput={(event) => setRecommendationsCode(event.currentTarget.value)} />
                  <Button type="button" disabled={jevBusy || !recommendationsCode.trim()} loading={jevBusy} onClick={() => void redeemRecommendations()}>{tr("Активировать")}</Button>
                </div>}
                <p class={styles.recommendationsHint}>
                  {tr("Показываем людей со всего WIRING. Если ты уже лайкаешь анкеты, подбор идёт по ним. Если лайков мало — по тому, что выбрано у тебя и зачем ты здесь. Человек не показывается, если такие люди тебе скрыты или он сам скрыл себя от людей с твоими особенностями. Под карточкой написано, что совпало. Чтобы расставить анкеты, мы отправляем только выбранные пункты, один ли город, близкий ли возраст и общую цель. Имя, фото, свои тексты и переписку не отправляем. Похожая анкета не значит, что человек тоже тебя выберет.")}</p>
                {user.jev_feed_unlocked && !user.jev_feed_available && !user.jev_feed_enabled ? <p class={styles.recommendationsHint}>{tr("Подбор пока недоступен. Попробуй позже.")}</p> : null}
                {jevError && <p class={styles.error} role="alert">{jevError}</p>}
              </section>

            {(serverError || errors.photos) && <div class={styles.serverError} role="alert">{serverError || errors.photos}</div>}
            <div class={styles.submitRow}>
              <Button type="submit" fullWidth disabled={busy} loading={busy}>{busy ? tr("Сохраняем…") : tr("Опубликовать в ленте")}</Button>
              <div class={styles.accountActions}>
                <Button variant="ghost" type="button" onClick={host.onLogout}>{tr("Выйти")}</Button>
                <Button variant="ghost" type="button" onClick={() => host.navigate("delete-account")}>{tr("Удалить аккаунт")}</Button>
              </div>
            </div>
          </form>
        </main>
      )}
      <LegalFooter />
    </div>
  );
}
