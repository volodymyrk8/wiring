import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, IconButton, Input, Modal, TagPicker } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import { usePhotoSwipe } from "@/lib/usePhotoSwipe";
import type { DeckCard, DeckFilters, DeckHostBridge } from "./types";
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

const iconFilter = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h5m4 0h7M4 17h9m4 0h3" /><circle cx="11" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></svg>;
const iconPass = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
const iconLike = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 10.1-8.8 10.1S3.2 14 3.2 8.8A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.6Z" /></svg>;

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
    logoPosition="center"
    themePosition="start"
    showBetaBadge={false}
    showThemeSwatches
    onThemeSelect={host.onThemeSelect}
    rightSlot={<IconButton onClick={onFilters} aria-label={filtered ? "Фильтры · применены" : "Фильтры"} aria-expanded={filtersOpen} aria-haspopup="dialog">{iconFilter}{filtered ? <i class={styles.filterDot} aria-hidden="true" /> : null}</IconButton>}
  />;
}

const defaultFilters = (): DeckFilters => ({ neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "", real_only: false });

function FilterPanel({ host, filters, busy, error, onApply, onClose }: { host: DeckHostBridge; filters: DeckFilters; busy: boolean; error: string; onApply: (filters: DeckFilters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(filters);
  const [minAge, setMinAge] = useState(String(filters.min_age));
  const [maxAge, setMaxAge] = useState(String(filters.max_age));
  const cities = [...new Set((host.catalog.places || []).flatMap((place) => place.cities))];
  const update = <K extends keyof DeckFilters>(key: K, value: DeckFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const reset = () => { setDraft(defaultFilters()); setMinAge("18"); setMaxAge("99"); };
  return <Modal isOpen onClose={onClose} title="Фильтры ленты" responsiveSheet
    footer={<><Button variant="ghost" disabled={busy} onClick={reset}>Сбросить</Button><Button type="submit" form="deck-filters" loading={busy}>Применить</Button></>}>
    <form id="deck-filters" class={styles.filters} onSubmit={(event) => {
      event.preventDefault();
      if (!busy) onApply({ ...draft, min_age: Number(minAge), max_age: Number(maxAge) });
    }}>
      <p class={styles.filterIntro}>Выбери, кого хочешь видеть. Изменения сохранятся после применения.</p>
      <fieldset class={styles.filterFields} disabled={busy}>
        <div class={styles.range}>
          <Input label="Возраст от" name="deck-min-age" type="number" inputMode="numeric" required min={18} max={Number(maxAge) || 99} value={minAge} onInput={(event) => setMinAge(event.currentTarget.value)} />
          <Input label="Возраст до" name="deck-max-age" type="number" inputMode="numeric" required min={Number(minAge) || 18} max={99} value={maxAge} onInput={(event) => setMaxAge(event.currentTarget.value)} />
        </div>
        <Input label="Город" name="deck-city" value={draft.city} list="deck-cities" autoComplete="off" hint="Оставь пустым, если город неважен." onInput={(event) => update("city", event.currentTarget.value)} />
        <datalist id="deck-cities">{cities.map((city) => <option key={city} value={city} />)}</datalist>
        <TagPicker label="Формат знакомства" options={host.catalog.intents || []} selected={draft.intents} onChange={(value) => update("intents", value)} />
        <TagPicker label="Диагнозы" options={host.catalog.neuro || []} selected={draft.neuro} onChange={(value) => update("neuro", value)} />
        <TagPicker label="Вайб" options={host.catalog.vibe || []} selected={draft.vibe} onChange={(value) => update("vibe", value)} tone="vibe" />
      </fieldset>
      {error ? <p class={styles.error} role="alert">{error}</p> : null}
    </form>
  </Modal>;
}

function DeckCardView({ host, card, active, onVertical, actions, heightLimit }: { host: DeckHostBridge; card: DeckCard; active: boolean; onVertical: (direction: number) => void; actions?: JSX.Element; heightLimit: number }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoAspect, setPhotoAspect] = useState(3 / 4);
  const cardRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!active && cardRef.current?.contains(document.activeElement)) {
      cardRef.current.closest<HTMLElement>('[role="region"]')?.focus({ preventScroll: true });
    }
  }, [active]);
  const photos = photosFor(card);
  const changePhoto = (direction: number) => setPhotoIndex((index) => (index + direction + Math.max(photos.length, 1)) % Math.max(photos.length, 1));
  const gesture = usePhotoSwipe(changePhoto, onVertical);
  const labelsIntent = labels(host.catalog, "intents", card.intents?.length ? card.intents : card.intent);
  const meta = [card.city, card.job, card.height ? `${card.height} см` : "", ...labels(host.catalog, "genders", card.gender)].filter(Boolean).join(" · ");
  const secondary = [...labels(host.catalog, "looking_for", card.looking_for).map((value) => `ищет ${value}`), ...labelsIntent].join(" · ");
  const tags = [
    ...(card.neuro || []).map((id) => ({ id: `neuro-${id}`, label: host.catalog.neuro?.find((item) => item.id === id)?.label || id, vibe: false })),
    ...(card.vibe || []).map((id) => ({ id: `vibe-${id}`, label: host.catalog.vibe?.find((item) => item.id === id)?.label || id, vibe: true })),
  ];
  return <><article ref={cardRef} {...gesture} class={styles.card} tabIndex={active && photos.length > 1 ? 0 : -1}
    onKeyDown={(event) => {
      if ((event.target as HTMLElement).closest("button, a")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); changePhoto(event.key === "ArrowRight" ? 1 : -1); }
    }} style={{ "--photo-aspect": photoAspect, "--card-height-limit": `${heightLimit}px` }} aria-label={`${card.name}, ${card.age}`}>
    <div class={styles.media}>
      <img class={styles.photo} src={photoUrl(host.basePath, photos[photoIndex] || card.photo, card.name)} alt="" draggable={false}
        onLoad={(event) => { const image = event.currentTarget; if (image.naturalHeight) setPhotoAspect(image.naturalWidth / image.naturalHeight); }} />
    </div>
    {photos.length > 1 ? <span class={styles.srOnly} aria-live={active ? "polite" : "off"}>Фото {photoIndex + 1} из {photos.length}</span> : null}
    {photos.length > 1 ? <div class={styles.photoChoices} role="group" aria-label="Фотографии">
      {photos.map((_, index) => <IconButton key={index} class={styles.photoChoice} tabIndex={active ? 0 : -1} aria-label={`Фото ${index + 1} из ${photos.length}`} aria-pressed={index === photoIndex} onClick={() => setPhotoIndex(index)}>{index + 1}</IconButton>)}
    </div> : null}
    <div class={styles.body}>
      <div class={styles.head}><h2>{card.online ? <span class={styles.online} aria-label="в сети" /> : null}{card.name}, {card.age}</h2></div>
      {meta || secondary ? <p class={styles.meta}>{meta}{meta && secondary ? <br /> : null}{secondary}</p> : null}
      {card.bio ? <p class={styles.bio}>{card.bio}</p> : null}
      {tags.length ? <div class={styles.tags}>{tags.slice(0, 3).map((tag) => <span class={`${styles.tag} ${tag.vibe ? styles.tagVibe : ""}`} key={tag.id}>{tag.label}</span>)}</div> : null}
    </div>
  </article>{actions}</>;
}

export function DeckScreen({ host }: { host: DeckHostBridge }) {
  const [cards, setCards] = useState(host.cards);
  const [index, setIndex] = useState(host.index);
  const [hasMore, setHasMore] = useState(host.hasMore);
  const [filters, setFilters] = useState(host.filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [paused, setPaused] = useState(Boolean(host.user.paused));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [cardHeight, setCardHeight] = useState(640);
  const viewportRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const actionRef = useRef<AbortController | null>(null);
  const viewedRef = useRef(new Set<number>());
  const indexRef = useRef(index);
  indexRef.current = index;
  const dragRef = useRef<{ y: number } | null>(null);
  const current = cards[index];
  const filtered = Boolean(filters.neuro.length || filters.vibe.length || filters.intents.length || filters.city || filters.min_age !== 18 || filters.max_age !== 99);

  useEffect(() => {
    host.onFeedChange(cards, index, filters, hasMore);
  }, [cards, index, filters, hasMore]);

  useEffect(() => () => { requestRef.current?.abort(); actionRef.current?.abort(); }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const align = () => {
      setCardHeight(Math.max(120, viewport.clientHeight - 90));
      viewport.scrollTop = indexRef.current * viewport.clientHeight;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!current || viewedRef.current.has(current.id)) return;
    const controller = new AbortController();
    void host.api("/api/feed/view", { method: "POST", signal: controller.signal, body: JSON.stringify({ target_id: current.id }) })
      .then(() => { viewedRef.current.add(current.id); })
      .catch(() => { /* Delivery was already reserved; a failed acknowledgement cannot cause repeats. */ });
    return () => controller.abort();
  }, [current?.id]);

  const loadPage = async (nextFilters = filters, replace = false) => {
    if (requestRef.current || actionRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setError("");
    try {
      const response = await host.loadFeed(nextFilters, controller.signal);
      if (controller.signal.aborted) return;
      setHasMore(response.has_more);
      setCards((previous) => replace ? response.cards : [...previous, ...response.cards.filter((card) => !previous.some((old) => old.id === card.id))]);
      if (replace) {
        setFilters(nextFilters); setIndex(0); indexRef.current = 0; setFiltersOpen(false);
        if (viewportRef.current) viewportRef.current.scrollTop = 0;
      }
    } catch (caught) {
      if (!controller.signal.aborted) setError(getErrorMessage(caught));
    } finally {
      if (!controller.signal.aborted) { requestRef.current = null; setLoading(false); }
    }
  };

  useEffect(() => {
    if (!filtersOpen && !excludeOpen && !busy && !error && hasMore && index >= cards.length - 1) void loadPage();
  }, [index, cards.length, hasMore, filtersOpen, excludeOpen, busy, error]);

  const advance = (direction: number) => {
    const viewport = viewportRef.current;
    if (!viewport || filtersOpen || excludeOpen) return;
    const last = cards.length; // Final slide can load new candidates or explain exhaustion.
    const next = Math.max(0, Math.min(last, indexRef.current + direction));
    viewport.scrollTo({ top: next * viewport.clientHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
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
      const remaining = cards.filter((card) => card.id !== targetId);
      const nextIndex = Math.min(index, remaining.length);
      setCards(remaining); setIndex(nextIndex); setExcludeOpen(false);
      host.onFeedChange(remaining, nextIndex, filters, hasMore);
      if (response.matched && response.match) host.onMatch(response.match);
      else host.toast(direction === "like" ? "Лайк отправлен" : "Анкета больше не появится в ленте");
    } catch (caught) {
      if (!controller.signal.aborted) setError(getErrorMessage(caught));
    } finally {
      if (!controller.signal.aborted) { actionRef.current = null; setBusy(false); }
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

  const finishDrag = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    dragRef.current = null; setDragging(false);
    const distance = start.y - event.clientY;
    if (Math.abs(distance) > 40) advance(distance > 0 ? 1 : -1);
  };

  return <div class={styles.root}>
    <DeckHeader host={host} filtered={filtered} filtersOpen={filtersOpen} onFilters={() => { setError(""); setFiltersOpen(true); }} />
    {filtersOpen ? <FilterPanel host={host} filters={filters} busy={loading || busy} error={error} onApply={(value) => void loadPage(value, true)} onClose={() => { if (!loading) setFiltersOpen(false); }} /> : null}
    <Modal isOpen={excludeOpen} onClose={() => { if (!busy) setExcludeOpen(false); }} title="Больше не показывать?"
      footer={<><Button variant="ghost" disabled={busy} onClick={() => setExcludeOpen(false)}>Отмена</Button><Button loading={busy} disabled={loading} onClick={() => void act("pass")}>Исключить</Button></>}>
      <p>Эта анкета больше не появится в твоей ленте. Обычное листание никого не исключает.</p>
      {error ? <p class={styles.error} role="alert">{error}</p> : null}
    </Modal>
    <main class={styles.content} aria-label="Лента">
      {paused ? <aside class={styles.pause}><span><strong>Анкета на паузе.</strong> Тебя временно не показывают в чужой ленте.</span><Button variant="ghost" slim disabled={busy} onClick={() => void unpause()}>снять паузу</Button></aside> : null}
      <div ref={viewportRef} class={`${styles.reels}${dragging ? ` ${styles.dragging}` : ""}`} tabIndex={0} role="region" aria-label="Анкеты" aria-busy={loading}
        onScroll={(event) => setIndex(Math.min(cards.length, Math.max(0, Math.round(event.currentTarget.scrollTop / event.currentTarget.clientHeight))))}
        onKeyDown={(event) => {
          if ((event.target as HTMLElement).closest("button, a, input")) return;
          if (["ArrowDown", "PageDown", " "].includes(event.key)) { event.preventDefault(); advance(1); }
          else if (["ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); advance(-1); }
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as HTMLElement).closest("button, a")) return;
          dragRef.current = { y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); event.currentTarget.focus();
        }}
        onPointerUp={finishDrag}
        onPointerCancel={() => { dragRef.current = null; setDragging(false); }}>
        {cards.map((card, cardIndex) => <section key={card.id} class={styles.slide} aria-hidden={cardIndex !== index}>
          <DeckCardView host={host} card={card} active={cardIndex === index} heightLimit={cardHeight} onVertical={advance}
            actions={<div class={styles.controls}>{cardIndex === index ? <>
              <IconButton class={styles.exclude} disabled={busy || loading} onClick={() => setExcludeOpen(true)} aria-label="Больше не показывать" title="Больше не показывать">{iconPass}</IconButton>
              <Button variant="ghost" className={styles.openProfile} href={host.hrefFor("person", { id: card.id })} onClick={(event) => { event.preventDefault(); host.navigate("person", { id: card.id }); }}>Открыть профиль</Button>
              <IconButton class={styles.like} disabled={busy || loading} onClick={() => void act("like")} aria-label="Лайк" title="Лайк">{iconLike}</IconButton>
            </> : null}</div>} />
        </section>)}
        <section class={styles.slide} aria-hidden={index < cards.length}>
          <div class={styles.empty}>
            <h2>{loading ? "Ищем новые анкеты…" : "Новых анкет пока нет"}</h2>
            <p>{loading ? "Ещё немного." : filtered ? "Можно изменить фильтры. Уже выданные анкеты не повторяются." : "Загляни позже. Уже выданные анкеты не повторяются."}</p>
            {!loading && index >= cards.length ? <Button variant="ghost" disabled={busy} onClick={() => void loadPage()}>{error ? "Повторить" : "Проверить новые"}</Button> : null}
          </div>
        </section>
      </div>
      {error && !filtersOpen && !excludeOpen ? <p class={styles.error} role="alert">{error}</p> : null}
    </main>
  </div>;
}
