import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, GuestFlowSteps, ProfileMenu, TagPicker } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import type { ProfileUser } from "@/features/profile/types";
import type { LikeCard, LikesFilters, LikesHostBridge } from "./types";
import styles from "./LikesScreen.module.css";

const avatarUrl = (basePath: string, photo: unknown, name = "?") => {
  let value = photo;
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object") value = (value as { url?: string }).url;
  if (typeof value === "string" && value) {
    if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http")) return value;
    return value.startsWith("/") ? `${basePath}${value}` : `${basePath}/public/${value}`;
  }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520"><rect width="400" height="520" fill="#303448"/><text x="200" y="280" text-anchor="middle" fill="#d8ff3c" font-size="84" font-family="Georgia">${String(name || "?").slice(0, 1)}</text></svg>`)}`;
};

const iconFilter = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
const iconLike = "♡";

const activeFilters = (filters: LikesFilters) => Boolean(
  filters.neuro.length || filters.vibe.length || filters.intents.length || filters.city || filters.min_age !== 18 || filters.max_age !== 99,
);

const photoFor = (host: LikesHostBridge, item: LikeCard) => avatarUrl(host.basePath, item.photo, item.name);

function FilterPanel({ host, filters, onApply, onClear }: { host: LikesHostBridge; filters: LikesFilters; onApply: (filters: LikesFilters) => void; onClear: () => void }) {
  const [draft, setDraft] = useState(filters);
  const places = host.catalog.places || [];
  const cities = places.flatMap((place) => place.cities).filter((city, index, list) => list.indexOf(city) === index);
  const update = <K extends keyof LikesFilters>(key: K, value: LikesFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div class={styles.filters}>
      <div class={styles.filterGroup}>
        <p class={styles.filterLabel}>диагнозы в лайках</p>
        <TagPicker options={host.catalog.neuro || []} selected={draft.neuro} onChange={(value) => update("neuro", value)} />
      </div>
      <div class={styles.filterGroup}>
        <p class={styles.filterLabel}>вайб</p>
        <TagPicker options={host.catalog.vibe || []} selected={draft.vibe} onChange={(value) => update("vibe", value)} tone="vibe" />
      </div>
      <div class={styles.filterGroup}>
        <p class={styles.filterLabel}>формат</p>
        <TagPicker options={host.catalog.intents || []} selected={draft.intents} onChange={(value) => update("intents", value)} />
      </div>
      <div class={styles.range}>
        <label>от<input type="number" min="18" max="99" value={draft.min_age} onInput={(event) => update("min_age", Number(event.currentTarget.value) || 18)} /></label>
        <label>до<input type="number" min="18" max="99" value={draft.max_age} onInput={(event) => update("max_age", Number(event.currentTarget.value) || 99)} /></label>
      </div>
      <label class={styles.filterGroup}>
        <span class={styles.filterLabel}>город</span>
        <select class={styles.citySelect} value={draft.city} onChange={(event) => update("city", event.currentTarget.value)}>
          <option value="">неважно</option>
          {cities.map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
      </label>
      <div class={styles.filterFooter}>
        <Button variant="ghost" slim onClick={onClear}>сбросить</Button>
        <Button variant="solid" slim onClick={() => onApply(draft)}>применить</Button>
      </div>
    </div>
  );
}

function LikeCardView({ host, item, onOpen }: { host: LikesHostBridge; item: LikeCard; onOpen: () => void }) {
  if (item.hidden || !item.id) {
    return (
      <button type="button" class={styles.locked} onClick={() => host.navigate("plus")} aria-label="Скрытая симпатия. Узнать о WIRING+">
        <span class={`${styles.media} ${styles.lockedMedia}`} aria-hidden="true"><span class={styles.silhouette}>🔒</span></span>
        <span class={styles.body}>
          <span class={styles.head}><strong>Новая симпатия</strong><span class={styles.lockPill}>скрыто</span></span>
          <span class={styles.meta}>Этот человек лайкнул твою анкету</span>
          <span class={styles.lockedHint}>Фото и анкета доступны с подпиской WIRING+</span>
          <span class={styles.cta}>Открыть с WIRING+ →</span>
        </span>
      </button>
    );
  }
  const labels = (ids: string[] | undefined, kind: "neuro" | "vibe") => (ids || []).slice(0, 2).map((id) => {
    const item = host.catalog[kind]?.find((option) => option.id === id);
    return item ? <span class={`${styles.likeTag}${kind === "vibe" ? ` ${styles.likeTagVibe}` : ""}`} key={`${kind}-${id}`}>{item.label}</span> : null;
  });
  const bio = String(item.bio || item.communication || "").trim();
  const intentIds = item.intents?.length ? item.intents : item.intent ? [item.intent] : [];
  const intent = intentIds.map((id) => host.catalog.intents?.find((option) => option.id === id)?.label || id).join(", ");
  return (
    <a class={styles.card} href={host.hrefFor("person", { id: item.id })} onClick={(event) => { event.preventDefault(); onOpen(); }}>
      <span class={styles.media}><img src={photoFor(host, item)} alt={String(item.name || "")} loading="lazy" /></span>
      <span class={styles.body}>
        <span class={styles.head}><strong>{item.name}, {item.age}</strong>{item.city ? <span class={styles.city}>{item.city}</span> : null}</span>
        <span class={styles.meta}>{[item.city, intent].filter(Boolean).join(" · ")}</span>
        {(item.neuro?.length || item.vibe?.length) ? <span class={styles.tags}>{labels(item.neuro, "neuro")}{labels(item.vibe, "vibe")}</span> : null}
        {bio ? <span class={styles.bio}>{bio}</span> : null}
        <span class={styles.cta}>Смотреть анкету →</span>
      </span>
    </a>
  );
}

export function LikesScreen({ host }: { host: LikesHostBridge }) {
  const [likes, setLikes] = useState(host.likes);
  const [filters, setFilters] = useState(host.filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasFilters = activeFilters(filters);

  const navigate = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view, params);
  };

  const apply = async (next: LikesFilters) => {
    setBusy(true);
    setError("");
    try {
      const response = await host.loadLikes(next);
      setFilters(next);
      setLikes(response.likes || []);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => void apply({ neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "" });

  const redeem = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await host.api("/api/premium/redeem", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      host.onUserUpdated(response.user as ProfileUser);
      setCode("");
      setPromoOpen(false);
      host.toast("WIRING+ включён");
      await apply(filters);
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusy(false);
    }
  };

  const signedOut = !host.user;
  const isGuest = Boolean(host.user?.guest);
  const emptyText = host.matchesCount ? "Новых лайков нет — взаимные уже в чатах." : "Когда кто-то лайкнет тебя первым, анкета появится здесь.";
  const emptyFiltered = !likes.length && hasFilters;

  return (
    <div class={styles.root}>
      <AppHeader
        homeHref={host.hrefFor("home")}
        onHomeClick={navigate("home")}
        sectionTitle="лайки"
        showThemeSwatches
        onThemeSelect={host.onThemeSelect}
        rightSlot={host.user && !isGuest ? (
          <ProfileMenu
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
          />
        ) : <a class="icon-btn profile-slot" href={host.hrefFor("login")} onClick={navigate("login")} aria-label="войти">♡</a>}
      />
      <main class={`${styles.content}${signedOut ? ` ${styles.contentCentered}` : ""}`}>
        {host.user?.needs_profile && !host.user.guest ? <aside class={styles.nudge}><div><strong>Анкета ещё пустая</strong><p>Добавь фото, город и особенности, чтобы тебя находили.</p></div><Button slim href={host.hrefFor("profile")} nav="profile" onClick={navigate("profile")}>дозаполнить</Button></aside> : null}
        {!signedOut && (likes.length || hasFilters || filtersOpen) ? <div class={styles.toolbar}><Button variant="ghost" slim className={`${styles.filterButton}${hasFilters ? ` ${styles.filterButtonActive}` : ""}`} onClick={() => setFiltersOpen((open) => !open)}>{iconFilter}<span>{filtersOpen ? "скрыть фильтры" : "фильтры"}</span>{hasFilters ? <span class={styles.filterDot} /> : null}</Button></div> : null}
        {host.user && !host.user.plus && likes.length ? (
          <section class={styles.gate}>
            <div class={styles.gateTop}><span class={styles.gateBadge}>{isGuest ? "гость" : "WIRING+"}</span><div class={styles.gateInfo}><strong>{isGuest ? "Создай свой профиль" : "Узнай, кто тебя лайкнул"}</strong><p>{isGuest ? "Чтобы видеть, кто проявил интерес, и начинать диалоги." : "С WIRING+ входящие симпатии открыты сразу."}</p></div></div>
            <div class={styles.gateActions}>{isGuest ? <Button slim href={host.hrefFor("register")} nav="register" onClick={navigate("register")}>Создать анкету</Button> : <><Button slim href={host.hrefFor("plus")} nav="plus" onClick={navigate("plus")}>Узнать о WIRING+</Button><Button variant="ghost" slim onClick={() => setPromoOpen((open) => !open)}>{promoOpen ? "Скрыть промокод" : "Ввести промокод"}</Button></>}</div>
            {promoOpen ? <div class={styles.promo}><input value={code} maxlength={24} placeholder="Промокод WIRING+" onInput={(event) => setCode(event.currentTarget.value)} /><Button slim disabled={busy} loading={busy} onClick={() => void redeem()}>Активировать</Button></div> : null}
          </section>
        ) : null}
        {filtersOpen ? <FilterPanel host={host} filters={filters} onApply={(next) => void apply(next)} onClear={clear} /> : null}
        {likes.length ? <div class={styles.cards}>{likes.map((item, index) => <LikeCardView key={`${item.id || "hidden"}-${index}`} host={host} item={item} onOpen={() => item.id && host.navigate("person", { id: item.id })} />)}</div> : (
          <section class={styles.empty}>
            <span class={styles.emptyIcon}>{emptyFiltered ? iconFilter : iconLike}</span>
            <h2>
              {emptyFiltered ? "Ничего не найдено" : signedOut ? "Кто тебя лайкнул" : isGuest ? "Создай свой профиль" : "Пока нет новых лайков"}
            </h2>
            {!signedOut ? (
              <p>
                {emptyFiltered
                  ? "По выбранным фильтрам пока нет анкет. Попробуй изменить параметры поиска."
                  : isGuest
                    ? "Чтобы видеть людей, которым ты нравишься, и начинать диалоги."
                    : emptyText}
              </p>
            ) : null}
            {emptyFiltered ? (
              <Button variant="ghost" slim onClick={clear}>Сбросить фильтры</Button>
            ) : signedOut ? (
              <>
                <GuestFlowSteps variant="likes" />
                <div class={styles.guestCta}>
                <Button variant="solid" fullWidth href={host.hrefFor("register")} nav="register" onClick={navigate("register")}>Создать профиль</Button>
                <div class={styles.switchRow}>
                  <span class={styles.switchPrompt}>Уже есть профиль?</span>
                  <a class={styles.switchLink} href={host.hrefFor("login")} data-nav="login" onClick={navigate("login")}>Войти</a>
                </div>
              </div>
              </>
            ) : (
              <Button variant="solid" slim onClick={navigate(isGuest ? "register" : "deck")}>{isGuest ? "Создать анкету" : "Смотреть ленту"}</Button>
            )}
          </section>
        )}
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
      </main>
    </div>
  );
}
