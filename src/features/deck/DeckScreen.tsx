import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, Checkbox, GuestFlowSteps, IconButton, Input, Modal, Select, TagPicker } from "@/components/ui";
import { applyNeuroToggle, labelForTag, splitCatalogTags } from "@/lib/catalog-tags";
import { openToIntentsLine } from "@/lib/open-to-intents";
import { sharedNeuroIdSet } from "@/lib/shared-vibes";
import { getErrorMessage } from "@/lib/get-error-message";
import { usePhotoSwipe } from "@/lib/usePhotoSwipe";
import type { DeckCard, DeckFilters, DeckHostBridge } from "./types";
import { feedSwipeTarget, lockFeedSwipeAxis, type FeedSwipe } from "./vertical-swipe";
import styles from "./DeckScreen.module.css";

const photoUrl = (basePath: string, photo: unknown, name = "?") => {
  let value = photo;
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object") value = (value as { url?: string }).url;
  if (typeof value === "string" && value) {
    if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http")) return value;
    if (value.startsWith(basePath)) return value;
    return value.startsWith("/") ? `${basePath}${value}` : `${basePath}/public/${value}`;
  }
  const hue = [...String(name || "?")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const initial = [...String(name || "?").trim()][0]?.toUpperCase() || "?";
  const svg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 38% 32%)"/><stop offset="1" stop-color="hsl(${(hue + 36) % 360} 42% 22%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="32" dominant-baseline="central" text-anchor="middle" fill="#d8ff3c" font-size="26" font-family="Georgia">${initial}</text></svg>`);
  return `data:image/svg+xml,${svg}`;
};

const photosFor = (card: DeckCard) => {
  const photos = (card.photos || []).map((photo) => {
    if (typeof photo === "string") return photo;
    if (photo && typeof photo === "object") return (photo as { url?: string }).url || "";
    return "";
  }).filter(Boolean);
  return photos.length ? photos : card.photo ? [card.photo] : [];
};

const iconFilter = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="11" cy="18" r="2" /></svg>;
const iconPass = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
const iconProfile = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.2 19c1.4-3.2 4-4.8 6.8-4.8s5.4 1.6 6.8 4.8" /></svg>;
const iconLike = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 10.1-8.8 10.1S3.2 14 3.2 8.8A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.6Z" /></svg>;

const reelScrollBehavior = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth");

function jumpReel(viewport: HTMLElement, top: number, lock: { pinning: boolean; token: number }, force = false) {
  if (!force && Math.abs(viewport.scrollTop - top) < 1) return;
  const token = ++lock.token;
  lock.pinning = true;
  const previousSnap = viewport.style.scrollSnapType;
  viewport.style.scrollSnapType = "none";
  viewport.scrollTop = top;
  requestAnimationFrame(() => {
    if (lock.token !== token) return;
    viewport.scrollTop = top;
    requestAnimationFrame(() => {
      if (lock.token !== token) return;
      viewport.scrollTop = top;
      viewport.style.scrollSnapType = previousSnap;
      lock.pinning = false;
    });
  });
}

function snapReelNearest(viewport: HTMLElement, smooth: boolean) {
  const height = viewport.clientHeight;
  if (!height) return;
  const target = Math.round(viewport.scrollTop / height) * height;
  if (Math.abs(viewport.scrollTop - target) < 3) return;
  viewport.scrollTo({ top: target, behavior: smooth ? reelScrollBehavior() : "instant" });
}

const labels = (catalog: DeckHostBridge["catalog"], kind: "genders" | "looking_for" | "intents", values: unknown) => {
  const ids = Array.isArray(values) ? values : values ? [values] : [];
  return ids.map((id) => catalog[kind]?.find((item) => item.id === id)?.label || String(id)).filter(Boolean);
};

function DeckHeader({ host, filtersOpen, filtered, onFilters }: { host: DeckHostBridge; filtersOpen: boolean; filtered: boolean; onFilters: () => void }) {
  const navigate = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view, params);
  };
  return <AppHeader
    homeHref={host.hrefFor("home")}
    onHomeClick={navigate("home")}
    className={styles.header}
    logoPosition="left"
    brandPosition="left"
    hideBrand
    themePosition="start"
    showBetaBadge={false}
    showThemeSwatches
    onThemeSelect={host.onThemeSelect}
    rightSlot={host.recommendations ? <span>Для тебя</span> : <IconButton onClick={onFilters} aria-label={filtered ? "Фильтры · применены" : "Фильтры"} aria-expanded={filtersOpen} aria-haspopup="dialog">{iconFilter}{filtered ? <i class={styles.filterDot} aria-hidden="true" /> : null}</IconButton>}
  />;
}

const defaultFilters = (): DeckFilters => ({ neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "", gender: "", real_only: false, hide_undiagnosed: true });

const recommendationCopy = (card: DeckCard, source: "api" | "local" | "taste" | undefined) => {
  const reasons = (card.recommendation_reasons || []).map((item) => String(item).trim()).filter(Boolean);
  const footnote = source === "taste"
    ? "Это похоже на анкеты, которые ты уже лайкнула, а не гарантия."
    : "Это совпадения в анкетах, а не гарантия совместимости.";
  return reasons.length ? `${reasons.join(". ")}. ${footnote}` : footnote;
};

type DiscoveryDraft = {
  seekMinAge: string;
  seekMaxAge: string;
  seekPlace: string;
  hideNeuro: string[];
  hideVibe: string[];
};

function discoveryFromUser(host: DeckHostBridge): DiscoveryDraft {
  const neuroIds = new Set((host.catalog.neuro || []).map((item) => item.id));
  const hidden = host.user?.hide_tags || [];
  return {
    seekMinAge: String(host.user?.seek_min_age || 18),
    seekMaxAge: String(host.user?.seek_max_age || 99),
    seekPlace: String(host.user?.seek_place || ""),
    hideNeuro: hidden.filter((id) => neuroIds.has(id)),
    hideVibe: hidden.filter((id) => !neuroIds.has(id)),
  };
}

function FilterPanel({ host, filters, applying, error, onApply, onClose }: { host: DeckHostBridge; filters: DeckFilters; applying: boolean; error: string; onApply: (filters: DeckFilters, discovery: DiscoveryDraft) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(filters);
  const [minAge, setMinAge] = useState(String(filters.min_age));
  const [maxAge, setMaxAge] = useState(String(filters.max_age));
  const [discovery, setDiscovery] = useState(() => discoveryFromUser(host));
  const places = host.catalog.places || [];
  const cities = [...new Set(places.flatMap((place) => place.cities))];
  const placeOptions = [
    { value: "", label: "Отовсюду" },
    ...places.map((place) => ({ value: place.country, label: place.country })),
    ...cities.map((city) => ({ value: city, label: city })),
  ];
  const update = <K extends keyof DeckFilters>(key: K, value: DeckFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const reset = () => {
    setDraft(defaultFilters());
    setMinAge("18");
    setMaxAge("99");
  };
  return <Modal isOpen onClose={onClose} title="Фильтры" responsiveSheet
    footer={<><Button variant="ghost" disabled={applying} onClick={reset}>Сбросить</Button><Button type="button" disabled={applying} loading={applying} onClick={() => { const form = document.getElementById("deck-filters"); if (form instanceof HTMLFormElement) form.requestSubmit(); }}>Применить</Button></>}>
    <form id="deck-filters" class={styles.filters} onSubmit={(event) => {
      event.preventDefault();
      if (!applying) onApply({ ...draft, min_age: Number(minAge), max_age: Number(maxAge) }, discovery);
    }}>
      <fieldset class={styles.filterFields} disabled={applying}>
        <h3 class={styles.filterSection}>Кого ищу я</h3>
        <p class={styles.filterIntro}>Кого показывать в твоей ленте.</p>
        <div class={styles.range}>
          <Input label="Возраст от" name="deck-min-age" type="number" inputMode="numeric" required min={18} max={Number(maxAge) || 99} value={minAge} onInput={(event) => setMinAge(event.currentTarget.value)} />
          <Input label="Возраст до" name="deck-max-age" type="number" inputMode="numeric" required min={Number(minAge) || 18} max={99} value={maxAge} onInput={(event) => setMaxAge(event.currentTarget.value)} />
        </div>
        <Select className={styles.citySelect} label="Пол" id="deck-gender" options={[{ value: "", label: "Любой" }, { value: "woman", label: "Женщины" }, { value: "man", label: "Мужчины" }]} value={draft.gender || ""} onChange={(value) => update("gender", value === "woman" || value === "man" ? value : "")} ariaLabel="Пол в ленте" />
        <Select className={styles.citySelect} label="Город" id="deck-city" placeholder="Любой" searchable searchPlaceholder="Город" options={[{ value: "", label: "Любой" }, ...cities.map((city) => ({ value: city, label: city }))]} value={draft.city} onChange={(value) => update("city", value)} ariaLabel="Город в ленте" />
        <TagPicker label="Цель поиска" options={host.catalog.intents || []} selected={draft.intents} onChange={(value) => update("intents", value)} />
        <TagPicker label="Диагнозы" options={host.catalog.neuro || []} selected={draft.neuro} onChange={(value) => update("neuro", applyNeuroToggle(draft.neuro, value))} />
        <Checkbox name="hide-undiagnosed" checked={draft.hide_undiagnosed !== false} onChange={(checked) => update("hide_undiagnosed", checked)}>Скрыть анкеты без диагноза</Checkbox>
        <TagPicker label="Вайб" options={host.catalog.vibe || []} selected={draft.vibe} onChange={(value) => update("vibe", value)} tone="vibe" />
        <h3 class={styles.filterSection}>Кто может искать меня</h3>
        <p class={styles.filterIntro}>Кому ты сам виден. Это не то, кого видишь ты.</p>
        <div class={styles.range}>
          <Input label="Возраст от" name="seek-min-age" type="number" inputMode="numeric" required min={18} max={Number(discovery.seekMaxAge) || 99} value={discovery.seekMinAge} onInput={(event) => setDiscovery((current) => ({ ...current, seekMinAge: event.currentTarget.value }))} />
          <Input label="Возраст до" name="seek-max-age" type="number" inputMode="numeric" required min={Number(discovery.seekMinAge) || 18} max={99} value={discovery.seekMaxAge} onInput={(event) => setDiscovery((current) => ({ ...current, seekMaxAge: event.currentTarget.value }))} />
        </div>
        <Select className={styles.citySelect} label="Откуда" id="deck-seek-place" searchable searchPlaceholder="Город или страна" options={placeOptions} value={discovery.seekPlace} onChange={(value) => setDiscovery((current) => ({ ...current, seekPlace: value }))} ariaLabel="Откуда могут искать" />
        <TagPicker label="Не показывать меня людям с этими особенностями" options={host.catalog.neuro || []} selected={discovery.hideNeuro} onChange={(value) => setDiscovery((current) => ({ ...current, hideNeuro: applyNeuroToggle(current.hideNeuro, value) }))} />
        <TagPicker label="Не показывать меня людям с таким вайбом" options={host.catalog.vibe || []} selected={discovery.hideVibe} onChange={(value) => setDiscovery((current) => ({ ...current, hideVibe: value }))} tone="vibe" />
      </fieldset>
      {error ? <p class={styles.error} role="alert">{error}</p> : null}
    </form>
  </Modal>;
}

function DeckCardView({ host, card, active, onVertical, heightLimit }: { host: DeckHostBridge; card: DeckCard; active: boolean; onVertical: (direction: number) => void; heightLimit: number }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoAspect, setPhotoAspect] = useState(3 / 4);
  const cardRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!active && cardRef.current?.contains(document.activeElement)) {
      cardRef.current.closest<HTMLElement>('[role="region"]')?.focus({ preventScroll: true });
    }
  }, [active]);
  useEffect(() => {
    if (active) setPhotoIndex(0);
  }, [active, card.id]);
  const photos = photosFor(card);
  const changePhoto = (direction: number) => setPhotoIndex((index) => (index + direction + Math.max(photos.length, 1)) % Math.max(photos.length, 1));
  const gesture = usePhotoSwipe(changePhoto, onVertical);
  const onCardClick = (event: JSX.TargetedMouseEvent<HTMLElement>) => {
    if (photos.length < 2) return;
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    const cardRect = event.currentTarget.getBoundingClientRect();
    const body = event.currentTarget.querySelector(`.${styles.body}`);
    if (body && event.clientY >= body.getBoundingClientRect().top) return;
    const choices = event.currentTarget.querySelector(`.${styles.photoChoices}`);
    if (choices && event.clientY <= choices.getBoundingClientRect().bottom) return;
    changePhoto(event.clientX < cardRect.left + cardRect.width * 0.4 ? -1 : 1);
  };
  const labelsIntent = labels(host.catalog, "intents", card.intents?.length ? card.intents : card.intent);
  const showGender = card.gender && card.gender !== "hidden" && card.gender !== "other" && card.gender !== "nb";
  const meta = [card.city, card.job, card.height ? `${card.height} см` : "", ...(showGender ? labels(host.catalog, "genders", card.gender) : [])].filter(Boolean).join(" · ");
  const intentLine = openToIntentsLine(card.gender, labelsIntent);
  const secondary = [...labels(host.catalog, "looking_for", card.looking_for).map((value) => `ищет ${value}`), intentLine].filter(Boolean).join(" · ");
  const jevReasons = (card.jev_match_reasons || []).slice(0, 2);
  const showJev = typeof card.jev_match_pct === "number";
  const split = splitCatalogTags(card.neuro, card.vibe, host.catalog);
  const sharedNeuro = sharedNeuroIdSet(host.user?.neuro, card.neuro, host.catalog);
  const previewTags = split.neuro.slice(0, 2).flatMap((id) => {
    const label = labelForTag("neuro", id, host.catalog);
    return label ? [{ id: `neuro-${id}`, label, shared: sharedNeuro.has(id) }] : [];
  });
  return <article ref={cardRef} {...gesture} class={`${styles.card}${host.recommendations ? ` ${styles.cardRecommendations}` : ""}${photos.length > 1 ? ` ${styles.cardMulti}` : ""}`} tabIndex={active && photos.length > 1 ? 0 : -1} onClick={onCardClick}
    onKeyDown={(event) => {
      if ((event.target as HTMLElement).closest("button, a, input")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); changePhoto(event.key === "ArrowRight" ? 1 : -1); }
    }} style={{ "--photo-aspect": photoAspect, "--card-height-limit": `${heightLimit}px` }} aria-label={`${card.name}, ${card.age}`}>
    <div class={styles.media}>
      <div class={styles.photoTrack} style={{ transform: `translateX(-${photoIndex * 100}%)` }}>
        {(photos.length ? photos : [card.photo]).map((photo, index) => <img key={index} class={styles.photo} src={photoUrl(host.basePath, photo, card.name)} alt="" draggable={false}
          onLoad={(event) => { const image = event.currentTarget; if (index === 0 && image.naturalHeight) setPhotoAspect(image.naturalWidth / image.naturalHeight); }} />)}
      </div>
    </div>
    {photos.length > 1 ? <span class={styles.srOnly} aria-live={active ? "polite" : "off"}>Фото {photoIndex + 1} из {photos.length}</span> : null}
    {photos.length > 1 ? <div class={styles.photoNav}>
      <button type="button" class={styles.photoNavBtn} aria-label="Предыдущее фото" onClick={() => changePhoto(-1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5" /></svg>
      </button>
      <button type="button" class={styles.photoNavBtn} aria-label="Следующее фото" onClick={() => changePhoto(1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5" /></svg>
      </button>
    </div> : null}
    {photos.length > 1 ? <div class={styles.photoChoices}>
      <div class={styles.photoSegments} aria-hidden="true">{photos.map((_, index) => (
        <span key={index} class={index < photoIndex ? styles.photoSegmentDone : index === photoIndex ? styles.photoSegmentActive : undefined} />
      ))}</div>
      <input class={styles.photoSelector} type="range" min={0} max={photos.length - 1} step={1} value={photoIndex} tabIndex={active ? 0 : -1}
        aria-label="Фотографии" aria-valuetext={`Фото ${photoIndex + 1} из ${photos.length}`} onInput={(event) => setPhotoIndex(Number(event.currentTarget.value))} />
    </div> : null}
    <div class={styles.body}>
      <div class={styles.head}><h2>{card.online ? <span class={styles.online} aria-label="в сети" /> : null}{card.name}, {card.age}</h2></div>
      {meta || secondary ? <p class={styles.meta}>{meta}{meta && secondary ? <br /> : null}{secondary}</p> : null}
      {showJev ? (
        <div class={styles.jevMatch} aria-label={`Оценка совместимости: ${card.jev_match_pct} процентов`}>
          <div class={styles.jevMatchHead}>
            <span class={styles.jevPct}>{card.jev_match_pct}%</span>
            <span class={styles.jevMatchLabel}>
              {card.jev_match_source === "api" ? "взаимный интерес · Jev" : "ориентир · WIRING"}
            </span>
          </div>
          {jevReasons.length ? (
            <ul class={styles.jevReasons}>
              {jevReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {card.bio ? <p class={`${styles.bio}${showJev ? ` ${styles.bioCompact}` : ""}`}>{card.bio}</p> : null}
      {previewTags.length ? (
        <div class={styles.tags}>
          {previewTags.map((tag) => (
            <span
              key={tag.id}
              class={`${styles.tag}${tag.shared ? ` ${styles.tagShared}` : ""}`}
            >
              {tag.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  </article>;
}

function DeckGuest({ host }: { host: DeckHostBridge }) {
  const navigate = (view: string) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view);
  };
  return <div class={styles.root}>
    <AppHeader
      homeHref={host.hrefFor("home")}
      onHomeClick={navigate("home")}
      sectionTitle="лента"
      showThemeSwatches
      onThemeSelect={host.onThemeSelect}
    />
    <main class={styles.guestGate}>
      <h2>Лента анкет</h2>
      <GuestFlowSteps variant="feed" />
      <div class={styles.guestCta}>
        <Button variant="solid" fullWidth href={host.hrefFor("register")} nav="register" onClick={navigate("register")}>Создать профиль</Button>
        <p class={styles.switchRow}>
          <span class={styles.switchPrompt}>Уже есть профиль?</span>
          <a class={styles.switchLink} href={host.hrefFor("login")} data-nav="login" onClick={navigate("login")}>Войти</a>
        </p>
      </div>
    </main>
  </div>;
}

function DeckFeed({ host }: { host: DeckHostBridge & { user: NonNullable<DeckHostBridge["user"]> } }) {
  const [source, setSource] = useState<"api" | "local" | "taste" | undefined>();
  const [cards, setCards] = useState(host.cards);
  const [index, setIndex] = useState(host.index);
  const [hasMore, setHasMore] = useState(host.hasMore);
  const [generation, setGeneration] = useState(host.generation);
  const [resetOpen, setResetOpen] = useState(false);
  const [filters, setFilters] = useState(host.filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [paused, setPaused] = useState(Boolean(host.user.paused));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [panelHold, setPanelHold] = useState(false);
  const [error, setError] = useState("");
  const [applyingFilters, setApplyingFilters] = useState(false);
  const [cardHeight, setCardHeight] = useState(640);
  const viewportRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const actionRef = useRef<AbortController | null>(null);
  const viewedRef = useRef(new Set<number>());
  const indexRef = useRef(index);
  indexRef.current = index;
  const dragRef = useRef<{ y: number } | null>(null);
  const touchRef = useRef<FeedSwipe | null>(null);
  const touchScrollRef = useRef<{ top: number; native: boolean } | null>(null);
  const touchFrameRef = useRef<number | null>(null);
  const panelDragRef = useRef<(FeedSwipe & { id: number; scroll: number; moved: boolean }) | null>(null);
  const panelMovedRef = useRef(false);
  const scrollTimerRef = useRef<number | null>(null);
  const snapTimerRef = useRef<number | null>(null);
  const reelLock = useRef({ pinning: false, token: 0 });
  const restoreRef = useRef(true);
  const snapBlockRef = useRef(false);
  snapBlockRef.current = dragging || panelHold || filtersOpen || excludeOpen || resetOpen;
  const current = cards[index];
  const filtered = Boolean(filters.neuro.length || filters.vibe.length || filters.intents.length || filters.city || filters.gender || filters.min_age !== 18 || filters.max_age !== 99 || filters.hide_undiagnosed === false);

  useEffect(() => {
    host.onFeedChange(cards, index, filters, hasMore, generation);
  }, [cards, index, filters, hasMore, generation]);

  useEffect(() => () => {
    requestRef.current?.abort();
    actionRef.current?.abort();
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    if (touchFrameRef.current !== null) cancelAnimationFrame(touchFrameRef.current);
  }, []);

  const scheduleReelSnap = () => {
    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => {
      snapTimerRef.current = null;
      const viewport = viewportRef.current;
      if (!viewport || reelLock.current.pinning || snapBlockRef.current) return;
      snapReelNearest(viewport, true);
    }, 90);
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onScrollEnd = () => {
      if (reelLock.current.pinning || snapBlockRef.current) return;
      snapReelNearest(viewport, true);
    };
    viewport.addEventListener("scrollend", onScrollEnd);
    return () => viewport.removeEventListener("scrollend", onScrollEnd);
  }, []);

  const settleScroll = () => {
    setScrolling(true);
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => { scrollTimerRef.current = null; setScrolling(false); }, 140);
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    restoreRef.current = true;
    indexRef.current = host.index;
    setIndex(host.index);
    let restoreObserver: ResizeObserver | null = null;
    const finishRestore = () => {
      restoreRef.current = false;
      restoreObserver?.disconnect();
      restoreObserver = null;
    };
    const restoreScroll = () => {
      const height = viewport.clientHeight;
      if (height < 1) return;
      jumpReel(viewport, indexRef.current * height, reelLock.current, true);
      requestAnimationFrame(() => requestAnimationFrame(finishRestore));
    };
    const align = () => {
      const height = viewport.clientHeight;
      setCardHeight(Math.max(120, height - (host.recommendations ? 20 : 128)));
      if (height < 1) return;
      const target = indexRef.current * height;
      if (restoreRef.current) restoreScroll();
      else if (Math.abs(viewport.scrollTop - target) > height * 0.45) {
        jumpReel(viewport, target, reelLock.current, true);
      } else if (Math.abs(viewport.scrollTop - target) > 2) {
        jumpReel(viewport, target, reelLock.current, false);
      }
    };
    align();
    restoreObserver = new ResizeObserver(() => {
      if (restoreRef.current) restoreScroll();
    });
    restoreObserver.observe(viewport);
    const observer = new ResizeObserver(align);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      restoreObserver?.disconnect();
      restoreRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || restoreRef.current) return;
    const height = viewport.clientHeight;
    if (height > 0) jumpReel(viewport, indexRef.current * height, reelLock.current, true);
  }, [cards.length, index]);

  useEffect(() => {
    if (host.recommendations || !current || viewedRef.current.has(current.id)) return;
    const controller = new AbortController();
    void host.api("/api/feed/view", { method: "POST", signal: controller.signal, body: JSON.stringify({ target_id: current.id }) })
      .then(() => { viewedRef.current.add(current.id); })
      .catch(() => { /* Delivery was already reserved; a failed acknowledgement cannot cause repeats. */ });
    return () => controller.abort();
  }, [current?.id]);

  const saveDiscovery = async (discovery: DiscoveryDraft) => {
    const response = await host.api("/api/me", {
      method: "PATCH",
      body: JSON.stringify({
        seek_min_age: Number(discovery.seekMinAge || 18),
        seek_max_age: Number(discovery.seekMaxAge || 99),
        seek_place: discovery.seekPlace,
        hide_tags: [...discovery.hideNeuro, ...discovery.hideVibe],
        draft: true,
      }),
    });
    if (response.user) host.onUserUpdated(response.user);
  };

  const applyFilters = async (nextFilters: DeckFilters, discovery: DiscoveryDraft) => {
    setError("");
    setApplyingFilters(true);
    try {
      await saveDiscovery(discovery);
      requestRef.current?.abort();
      requestRef.current = null;
      await loadPage(nextFilters, true);
      setFiltersOpen(false);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setApplyingFilters(false);
    }
  };

  const loadPage = async (nextFilters = filters, replace = false) => {
    if (requestRef.current || actionRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setError("");
    try {
      const response = await host.loadFeed(nextFilters, controller.signal, replace ? [] : cards.map((card) => card.id));
      if (controller.signal.aborted) return;
      setSource(response.recommendation_source);
      setHasMore(response.has_more);
      setGeneration(response.generation);
      setCards((previous) => replace || host.recommendations ? response.cards : [...previous, ...response.cards.filter((card) => !previous.some((old) => old.id === card.id))]);
      if (replace) {
        setFilters(nextFilters); setIndex(0); indexRef.current = 0; setFiltersOpen(false);
        if (viewportRef.current) jumpReel(viewportRef.current, 0, reelLock.current);
      }
    } catch (caught) {
      if (!controller.signal.aborted) setError(getErrorMessage(caught));
    } finally {
      if (!controller.signal.aborted) { requestRef.current = null; setLoading(false); }
    }
  };

  useEffect(() => {
    if (!filtersOpen && !excludeOpen && !resetOpen && !busy && !error && hasMore && index >= cards.length - 1) void loadPage();
  }, [index, cards.length, hasMore, filtersOpen, excludeOpen, resetOpen, busy, error]);

  const advance = (direction: number, fromIndex = indexRef.current) => {
    const viewport = viewportRef.current;
    if (!viewport || filtersOpen || excludeOpen || resetOpen) return;
    const last = cards.length; // Final slide can load new candidates or explain exhaustion.
    const next = Math.max(0, Math.min(last, fromIndex + direction));
    settleScroll();
    viewport.scrollTo({ top: next * viewport.clientHeight, behavior: reelScrollBehavior() });
  };

  const act = async (direction: "like" | "pass") => {
    if (!current || actionRef.current || requestRef.current) return;
    const controller = new AbortController();
    actionRef.current = controller;
    const targetId = current.id;
    setBusy(true); setError("");
    try {
      const response = await host.api("/api/swipe", { method: "POST", signal: controller.signal, body: JSON.stringify({ target_id: targetId, direction }) });
      if (controller.signal.aborted) return;
      host.onAction?.(targetId);
      const remaining = cards.filter((card) => card.id !== targetId);
      const nextIndex = Math.min(index, remaining.length);
      indexRef.current = nextIndex;
      setCards(remaining);
      setIndex(nextIndex);
      setExcludeOpen(false);
      host.onFeedChange(remaining, nextIndex, filters, hasMore, generation);
      if (response.matched && response.match) host.onMatch(response.match);
      else host.toast(direction === "like" ? "Лайк отправлен" : "Анкета больше не появится в ленте");
    } catch (caught) {
      if (!controller.signal.aborted) setError(getErrorMessage(caught));
    } finally {
      if (!controller.signal.aborted) { actionRef.current = null; setBusy(false); }
    }
  };

  const repeatFeed = async () => {
    if (!host.user.plus || actionRef.current || requestRef.current) return;
    const controller = new AbortController(); actionRef.current = controller;
    setBusy(true); setLoading(true); setError("");
    try {
      const reset = await host.resetFeed(generation, controller.signal);
      if (controller.signal.aborted) return;
      setGeneration(reset.generation); setCards([]); setIndex(0); indexRef.current = 0;
      viewedRef.current.clear(); setHasMore(true); setResetOpen(false);
      host.onFeedChange([], 0, filters, true, reset.generation);
      if (viewportRef.current) jumpReel(viewportRef.current, 0, reelLock.current);
      const response = await host.loadFeed(filters, controller.signal);
      if (controller.signal.aborted) return;
      indexRef.current = 0; setIndex(0);
      setCards(response.cards); setHasMore(response.has_more); setGeneration(response.generation);
    } catch (caught) {
      if (!controller.signal.aborted) setError(getErrorMessage(caught));
    } finally {
      if (!controller.signal.aborted) { actionRef.current = null; setBusy(false); setLoading(false); }
    }
  };

  const unpause = async () => {
    if (actionRef.current) return;
    const controller = new AbortController(); actionRef.current = controller; setBusy(true);
    try {
      const response = await host.api("/api/plus", { method: "PATCH", signal: controller.signal, body: JSON.stringify({ paused: false }) });
      if (!controller.signal.aborted) { host.onUserUpdated(response.user); setPaused(false); }
    } catch (caught) { if (!controller.signal.aborted) setError(getErrorMessage(caught)); }
    finally { if (!controller.signal.aborted) { actionRef.current = null; setBusy(false); } }
  };

  const releasePanel = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const start = panelDragRef.current;
    if (!start || event.pointerId !== start.id) return;
    panelDragRef.current = null;
    const viewport = viewportRef.current;
    if (start.moved && viewport?.clientHeight) {
      const target = feedSwipeTarget(start, event.clientX, event.clientY, cards.length) ?? start.index;
      advance(target - start.index, start.index);
    }
    setPanelHold(false);
  };

  const finishDrag = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    dragRef.current = null; setDragging(false);
    const distance = start.y - event.clientY;
    if (Math.abs(distance) > 40) advance(distance > 0 ? 1 : -1);
    else scheduleReelSnap();
  };

  return <div class={`${styles.root}${host.recommendations ? ` ${styles.recommendationsRoot}` : ""}`}>
    <DeckHeader host={host} filtered={filtered} filtersOpen={filtersOpen} onFilters={() => { setError(""); setFiltersOpen(true); }} />
    {filtersOpen ? <FilterPanel host={host} filters={filters} applying={applyingFilters} error={error} onApply={(value, discovery) => void applyFilters(value, discovery)} onClose={() => { if (!applyingFilters) setFiltersOpen(false); }} /> : null}
    <Modal isOpen={excludeOpen} onClose={() => { if (!busy) setExcludeOpen(false); }} title="Больше не показывать?"
      footer={<><Button variant="ghost" disabled={busy} onClick={() => setExcludeOpen(false)}>Отмена</Button><Button loading={busy} disabled={loading} onClick={() => void act("pass")}>Исключить</Button></>}>
      <p>Эта анкета больше не появится в твоей ленте. Обычное листание никого не исключает.</p>
      {error ? <p class={styles.error} role="alert">{error}</p> : null}
    </Modal>
    <main class={styles.content} aria-label={host.recommendations ? "Для тебя" : "Лента"}>
      {host.recommendations ? <p class={styles.recommendationIntro}>Анкеты со всего WIRING.{source === "taste" ? " Подбор по тем, кого ты лайкаешь." : source === "local" ? " Подбор по отметкам и целям. Jev сейчас недоступен: порядок по совпадениям анкет." : source === "api" ? " Подбор по отметкам и целям. Jev ранжирует предварительный список." : " Подбор по отметкам и целям."}</p> : null}
      <Modal isOpen={resetOpen} onClose={() => { if (!busy) setResetOpen(false); }} title="Показать анкеты ещё раз?"
        footer={<><Button variant="ghost" disabled={busy} onClick={() => setResetOpen(false)}>Отмена</Button><Button loading={busy} onClick={() => void repeatFeed()}>Показать ещё раз</Button></>}>
        <p>Ранее показанные анкеты снова появятся в ленте. Исключённые анкеты не вернутся; лайки и чаты сохранятся.</p>
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
      </Modal>
      {paused ? <aside class={styles.pause}><span><strong>Анкета на паузе.</strong> Тебя временно не показывают в чужой ленте.</span><Button variant="ghost" slim disabled={busy} onClick={() => void unpause()}>снять паузу</Button></aside> : null}
      <div ref={viewportRef} class={`${styles.reels}${dragging ? ` ${styles.dragging}` : ""}${panelHold ? ` ${styles.freeScroll}` : ""}`} tabIndex={0} role="region" aria-label="Анкеты" aria-busy={loading}
        onScroll={(event) => {
          if (restoreRef.current || reelLock.current.pinning) return;
          const height = event.currentTarget.clientHeight;
          if (height < 1) return;
          const next = Math.min(cards.length, Math.max(0, Math.round(event.currentTarget.scrollTop / height)));
          if (next === indexRef.current) return;
          settleScroll();
          indexRef.current = next;
          setIndex(next);
        }}
        onKeyDown={(event) => {
          if ((event.target as HTMLElement).closest("button, a, input")) return;
          if (["ArrowDown", "PageDown", " "].includes(event.key)) { event.preventDefault(); advance(1); }
          else if (["ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); advance(-1); }
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as HTMLElement).closest("button, a, input")) return;
          dragRef.current = { y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); settleScroll(); event.currentTarget.focus();
        }}
        onTouchStart={(event) => {
          if (touchFrameRef.current !== null) { cancelAnimationFrame(touchFrameRef.current); touchFrameRef.current = null; }
          if (event.touches.length !== 1) { touchRef.current = null; touchScrollRef.current = null; return; }
          const touch = event.touches[0];
          const viewport = event.currentTarget;
          touchScrollRef.current = { top: viewport.scrollTop, native: false };
          touchRef.current = { x: touch.clientX, y: touch.clientY, index: indexRef.current, axis: null };
        }}
        onTouchMove={(event) => {
          const start = touchRef.current;
          const scrollStart = touchScrollRef.current;
          if (!start || event.touches.length !== 1) { touchRef.current = null; return; }
          const touch = event.touches[0];
          lockFeedSwipeAxis(start, touch.clientX, touch.clientY);
          if (scrollStart && Math.abs(event.currentTarget.scrollTop - scrollStart.top) > 10) {
            scrollStart.native = true;
          }
        }}
        onTouchEnd={(event) => {
          const start = touchRef.current;
          const scrollStart = touchScrollRef.current;
          touchRef.current = null;
          touchScrollRef.current = null;
          if (!start || event.touches.length || event.changedTouches.length !== 1) return;
          if (scrollStart?.native) {
            scheduleReelSnap();
            return;
          }
          const touch = event.changedTouches[0];
          const target = feedSwipeTarget(start, touch.clientX, touch.clientY, cards.length);
          if (target === null) {
            scheduleReelSnap();
            return;
          }
          if (touchFrameRef.current !== null) cancelAnimationFrame(touchFrameRef.current);
          touchFrameRef.current = requestAnimationFrame(() => {
            touchFrameRef.current = null;
            advance(target - start.index, start.index);
          });
        }}
        onTouchCancel={() => {
          touchRef.current = null;
          touchScrollRef.current = null;
          if (touchFrameRef.current !== null) { cancelAnimationFrame(touchFrameRef.current); touchFrameRef.current = null; }
        }}
        onPointerUp={finishDrag}
        onPointerCancel={() => { dragRef.current = null; setDragging(false); }}>
        {cards.map((card, cardIndex) => <section key={card.id} class={styles.slide} aria-hidden={cardIndex !== index}>
          <DeckCardView host={host} card={card} active={cardIndex === index} heightLimit={cardHeight} onVertical={advance} />
        </section>)}
        <section class={styles.slide} aria-hidden={index < cards.length}>
          <div class={styles.empty}>
            <h2>{loading ? "Ищем новые анкеты…" : host.recommendations ? "Подборка закончилась" : "Новых анкет пока нет"}</h2>
            <p>{loading ? "Ещё немного." : !host.recommendations && filtered ? "Можно изменить фильтры." : "Загляни позже."}</p>
            {!loading && index >= cards.length ? <div class={styles.emptyActions}>
              <Button variant="ghost" disabled={busy} onClick={() => void loadPage(filters, Boolean(host.recommendations))}>{error ? "Повторить" : "Проверить новые"}</Button>
              {!hasMore && !host.recommendations ? <>
                <Button className={styles.repeatButton} disabled={busy || !host.user.plus} ariaDescribedBy={!host.user.plus ? "feed-plus-hint" : undefined} onClick={() => { setError(""); setResetOpen(true); }}>Показать анкеты ещё раз</Button>
                {!host.user.plus ? <p id="feed-plus-hint">Можно включить в профиле.</p> : null}
              </> : null}
            </div> : null}
          </div>
        </section>
      </div>
      {host.recommendations && current ? (
        <section class={styles.recommendationPanel} aria-labelledby="recommendation-why">
          <strong id="recommendation-why" class={styles.recommendationPanelTitle}>Почему может подойти</strong>
          <p class={styles.recommendationPanelBody}>{recommendationCopy(current, source)}</p>
        </section>
      ) : null}
      <div
        class={`${styles.controls} ${styles.actionPanel}${scrolling || !current ? ` ${styles.actionPanelHidden}` : ""}${panelHold ? ` ${styles.actionPanelHolding}` : ""}`}
        aria-hidden={(scrolling || !current) && !panelHold}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          const viewport = viewportRef.current;
          if (!viewport) return;
          panelMovedRef.current = false;
          panelDragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, index: indexRef.current, axis: null, scroll: viewport.scrollTop, moved: false };
        }}
        onPointerMove={(event) => {
          const start = panelDragRef.current;
          const viewport = viewportRef.current;
          if (!start || !viewport || event.pointerId !== start.id) return;
          lockFeedSwipeAxis(start, event.clientX, event.clientY);
          const dy = start.y - event.clientY;
          if (start.axis !== "y") return;
          if (!start.moved) {
            start.moved = true;
            panelMovedRef.current = true;
            setPanelHold(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          viewport.scrollTop = start.scroll + dy;
        }}
        onPointerUp={releasePanel}
        onPointerCancel={() => { panelDragRef.current = null; panelMovedRef.current = false; setPanelHold(false); }}
        onClickCapture={(event) => {
          if (!panelMovedRef.current) return;
          panelMovedRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {current ? <>
          <div class={styles.actionControl}><Button variant="ghost" className={styles.actionCircle} disabled={busy || loading} onClick={() => setExcludeOpen(true)} ariaLabel="Скрыть — больше не показывать" title="Скрыть">{iconPass}</Button><span aria-hidden="true">Скрыть</span></div>
          <div class={styles.actionControl}><Button variant="ghost" className={styles.actionCircle} href={host.hrefFor("person", { id: current.id })} onClick={(event) => { event.preventDefault(); host.navigate("person", { id: current.id }); }} ariaLabel="Профиль" title="Профиль">{iconProfile}</Button><span aria-hidden="true">Профиль</span></div>
          <div class={styles.actionControl}><Button variant="ghost" className={styles.actionCircle} disabled={busy || loading} onClick={() => void act("like")} ariaLabel="Лайк" title="Лайк">{iconLike}</Button><span aria-hidden="true">Лайк</span></div>
        </> : null}
      </div>
      {error && !filtersOpen && !excludeOpen && !resetOpen ? <p class={styles.error} role="alert">{error}</p> : null}
    </main>
  </div>;
}

export function DeckScreen({ host }: { host: DeckHostBridge }) {
  if (!host.user) return <DeckGuest host={host} />;
  return <DeckFeed host={{ ...host, user: host.user }} />;
}
