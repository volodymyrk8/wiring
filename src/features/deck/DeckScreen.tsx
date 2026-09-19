import { useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, ProfileMenu, TagPicker } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
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
  const svg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 40% 28%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 50% 18%)"/></linearGradient></defs><rect width="400" height="520" fill="url(#g)"/><text x="200" y="280" text-anchor="middle" fill="#d8ff3c" font-size="84" font-family="Georgia">${String(name || "?").slice(0, 1)}</text></svg>`);
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

const iconFilter = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
const iconPass = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
const iconUndo = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 8 5 12l4 4" /><path d="M5 12h8a6 6 0 0 1 6 6" /></svg>;
const iconSnooze = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;
const iconLike = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 10.1-8.8 10.1S3.2 14 3.2 8.8A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.6Z" /></svg>;

const labels = (catalog: DeckHostBridge["catalog"], kind: "genders" | "looking_for" | "intents", values: unknown) => {
  const ids = Array.isArray(values) ? values : values ? [values] : [];
  return ids.map((id) => catalog[kind]?.find((item) => item.id === id)?.label || String(id)).filter(Boolean);
};

function DeckHeader({ host }: { host: DeckHostBridge }) {
  const navigate = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view, params);
  };
  return <AppHeader
    homeHref={host.hrefFor("home")}
    onHomeClick={navigate("home")}
    sectionTitle="лента"
    showThemeSwatches
    onThemeSelect={host.onThemeSelect}
    rightSlot={!host.user.guest ? <ProfileMenu
      avatarUrl={photoUrl(host.basePath, host.user.photo, String(host.user.name || "Профиль"))}
      userName={String(host.user.name || "")}
      isPlus={Boolean(host.user.plus)}
      profileHref={host.hrefFor("profile")}
      consentsHref={host.hrefFor("consents")}
      plusHref={host.hrefFor("plus")}
      onProfileClick={navigate("profile")}
      onConsentsClick={navigate("consents")}
      onPlusClick={navigate("plus")}
      onLogout={host.onLogout}
    /> : <a class="icon-btn profile-slot" href={host.hrefFor("login")} onClick={navigate("login")} aria-label="войти">♡</a>}
  />;
}

function FilterPanel({ host, filters, onApply, onClear }: { host: DeckHostBridge; filters: DeckFilters; onApply: (filters: DeckFilters) => void; onClear: () => void }) {
  const [draft, setDraft] = useState(filters);
  const cities = (host.catalog.places || []).flatMap((place) => place.cities).filter((city, index, list) => list.indexOf(city) === index);
  const update = <K extends keyof DeckFilters>(key: K, value: DeckFilters[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <div class={styles.filters}>
    <div class={styles.filterGroup}><p class={styles.filterLabel}>диагнозы</p><TagPicker options={host.catalog.neuro || []} selected={draft.neuro} onChange={(value) => update("neuro", value)} /></div>
    <div class={styles.filterGroup}><p class={styles.filterLabel}>вайб</p><TagPicker options={host.catalog.vibe || []} selected={draft.vibe} onChange={(value) => update("vibe", value)} tone="vibe" /></div>
    <div class={styles.filterGroup}><p class={styles.filterLabel}>формат</p><TagPicker options={host.catalog.intents || []} selected={draft.intents} onChange={(value) => update("intents", value)} /></div>
    <div class={styles.range}>
      <label>от<input type="number" min="18" max="99" value={draft.min_age} onInput={(event) => update("min_age", Number(event.currentTarget.value) || 18)} /></label>
      <label>до<input type="number" min="18" max="99" value={draft.max_age} onInput={(event) => update("max_age", Number(event.currentTarget.value) || 99)} /></label>
    </div>
    <label class={styles.filterGroup}><span class={styles.filterLabel}>город</span><select class={styles.citySelect} value={draft.city} onChange={(event) => update("city", event.currentTarget.value)}><option value="">неважно</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
    <div class={styles.filterFooter}><Button variant="ghost" slim onClick={onClear}>сбросить</Button><Button variant="solid" slim onClick={() => onApply(draft)}>применить</Button></div>
  </div>;
}

function DeckCardView({ host, card, stacked, photoIndex, dragX, onOpen }: { host: DeckHostBridge; card: DeckCard; stacked?: boolean; photoIndex: number; dragX: number; onOpen: () => void }) {
  const photos = photosFor(card);
  const labelsIntent = labels(host.catalog, "intents", card.intents?.length ? card.intents : card.intent);
  const meta = [card.city, card.job, card.height ? `${card.height} см` : "", ...labels(host.catalog, "genders", card.gender)].filter(Boolean).join(" · ");
  const secondary = [...(labels(host.catalog, "looking_for", card.looking_for).map((value) => `ищет ${value}`)), ...labelsIntent].join(" · ");
  const tags = [
    ...(card.neuro || []).map((id) => ({ id: `neuro-${id}`, label: host.catalog.neuro?.find((item) => item.id === id)?.label || id, vibe: false })),
    ...(card.vibe || []).map((id) => ({ id: `vibe-${id}`, label: host.catalog.vibe?.find((item) => item.id === id)?.label || id, vibe: true })),
  ];
  const style = stacked ? undefined : { transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)` };
  return <article class={`${styles.card}${stacked ? ` ${styles.cardStacked}` : ""}`} style={style}>
    <div class={styles.media}>
      <img class={styles.photo} src={photoUrl(host.basePath, photos[photoIndex] || card.photo, card.name)} alt="" draggable={false} />
      {!stacked && photos.length > 1 ? <div class={styles.dots}>{photos.map((_, index) => <i key={index} class={index === photoIndex ? styles.active : ""} />)}</div> : null}
      {!stacked ? <div class={styles.stamps}><span class={styles.stamp} style={{ opacity: dragX > 24 ? Math.min(1, (dragX - 24) / 90) : 0 }}>YES</span><span class={`${styles.stamp} ${styles.stampNo}`} style={{ opacity: dragX < -24 ? Math.min(1, (-dragX - 24) / 90) : 0 }}>NOPE</span></div> : null}
    </div>
    <div class={styles.body}>
      <div class={styles.head}><h2>{card.online ? <span class={styles.online} aria-label="в сети" /> : null}{card.name}, {card.age}</h2>{!stacked ? <a class={styles.more} href={host.hrefFor("person", { id: card.id })} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpen(); }}>анкета</a> : null}</div>
      {meta || secondary ? <p class={styles.meta}>{meta}{meta && secondary ? <><br /></> : null}{secondary}</p> : null}
      {card.bio ? <p class={styles.bio}>{card.bio}</p> : null}
      {tags.length ? <div class={styles.tags}>{tags.slice(0, 5).map((tag) => <span class={`${styles.tag} ${tag.vibe ? styles.tagVibe : ""}`} key={tag.id}>{tag.label}</span>)}</div> : null}
    </div>
  </article>;
}

export function DeckScreen({ host }: { host: DeckHostBridge }) {
  const [cards, setCards] = useState(host.cards);
  const [index, setIndex] = useState(host.index);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [filters, setFilters] = useState(host.filters);
  const [filtersOpen, setFiltersOpen] = useState(host.filtersOpen);
  const [recycled, setRecycled] = useState(host.recycled);
  const [passed, setPassed] = useState(host.passed);
  const [paused, setPaused] = useState(Boolean(host.user.paused));
  const [busy, setBusy] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [error, setError] = useState("");
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef("");
  const current = cards[index];
  const next = cards[index + 1];
  const filtered = Boolean(filters.neuro.length || filters.vibe.length || filters.intents.length || filters.city || filters.min_age !== 18 || filters.max_age !== 99);

  const applyFilters = async (nextFilters: DeckFilters) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await host.loadFeed(nextFilters);
      setFilters(nextFilters); setCards(response.cards || []); setIndex(0); setPhotoIndex(0); setRecycled(Boolean(response.recycled)); setPassed(Number(response.passed || 0)); setFiltersOpen(false);
    } catch (caught) { setError(getErrorMessage(caught)); } finally { setBusy(false); }
  };
  const clearFilters = () => void applyFilters({ neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "", real_only: false });
  const action = (direction: "like" | "pass" | "snooze") => {
    if (!current || busy) return;
    setBusy(true); setError(""); setDragX(direction === "like" ? 520 : -520);
    void host.swipe(direction).finally(() => setBusy(false));
  };
  const undo = () => { if (busy) return; setBusy(true); void host.rewind().finally(() => setBusy(false)); };
  const restart = () => { if (busy) return; setBusy(true); void host.restart().finally(() => setBusy(false)); };
  const unpause = () => void (async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { const response = await host.api("/api/plus", { method: "PATCH", body: JSON.stringify({ paused: false }) }); host.onUserUpdated(response.user); setPaused(false); host.toast("пауза снята"); } catch (caught) { setError(getErrorMessage(caught)); } finally { setBusy(false); }
  })();
  const selectPhoto = (direction: number) => {
    const photos = current ? photosFor(current) : [];
    if (photos.length < 2) return;
    setPhotoIndex((value) => (value + direction + photos.length) % photos.length);
  };
  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a, button, .chip")) return;
    startRef.current = { x: event.clientX, y: event.clientY }; axisRef.current = ""; setDragX(0); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    if (!startRef.current) return;
    const dx = event.clientX - startRef.current.x; const dy = event.clientY - startRef.current.y;
    if (!axisRef.current && (Math.abs(dx) > 14 || Math.abs(dy) > 14)) axisRef.current = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
    if (axisRef.current === "x") setDragX(dx);
  };
  const onPointerUp = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    const start = startRef.current; startRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    if (axisRef.current === "x" && dx > 130) action("like");
    else if (axisRef.current === "x" && dx < -130) action("pass");
    else if (axisRef.current === "x" && Math.abs(dx) > 40) { selectPhoto(dx < 0 ? 1 : -1); setDragX(0); }
    else if (axisRef.current === "y" && Math.abs(dy) > 40) { selectPhoto(dy < 0 ? 1 : -1); setDragX(0); }
    else setDragX(0);
    axisRef.current = "";
  };
  const navigate = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => { event.preventDefault(); host.navigate(view, params); };

  return <div class={styles.root}>
    <DeckHeader host={host} />
    <main class={styles.content}>
      {host.user.needs_profile && !host.user.guest ? <aside class={styles.profileNudge}><div><strong>Анкета ещё пустая</strong><p>Добавь фото, город и особенности, чтобы тебя находили.</p></div><Button slim href={host.hrefFor("profile")} nav="profile" onClick={navigate("profile")}>дозаполнить</Button></aside> : null}
      <div class={styles.toolbar}><Button variant="ghost" slim className={styles.filterButton} onClick={() => setFiltersOpen((open) => !open)}>{iconFilter}<span>{filtersOpen ? "скрыть фильтры" : "фильтры"}</span></Button><span class={styles.toolbarHint}>{recycled ? "снова пропущенные · " : ""}ещё {Math.max(0, cards.length - index)}</span></div>
      {filtersOpen ? <FilterPanel host={host} filters={filters} onApply={(nextFilters) => void applyFilters(nextFilters)} onClear={clearFilters} /> : null}
      {paused ? <aside class={styles.pause}><span><strong>Анкета на паузе.</strong> Тебя временно не показывают в чужой ленте.</span><Button variant="ghost" slim disabled={busy} onClick={unpause}>снять паузу</Button></aside> : null}
      {current ? <>
        <div class={styles.deck} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { startRef.current = null; setDragX(0); }}>
          {next ? <DeckCardView host={host} card={next} stacked photoIndex={0} dragX={0} onOpen={() => {}} /> : null}
          <DeckCardView host={host} card={current} photoIndex={photoIndex} dragX={dragX} onOpen={() => host.navigate("person", { id: current.id })} />
        </div>
        <div class={styles.controls}>
          <button type="button" class={`${styles.action} ${styles.pass}`} disabled={busy} onClick={() => action("pass")} aria-label="пропустить" title="пропустить">{iconPass}</button>
          <button type="button" class={`${styles.action} ${styles.undo}`} disabled={busy} onClick={undo} aria-label="вернуть предыдущего" title="вернуть предыдущего">{iconUndo}</button>
          {host.user.plus ? <button type="button" class={`${styles.action} ${styles.snooze}`} disabled={busy} onClick={() => action("snooze")} aria-label="отложить на неделю" title="отложить на неделю">{iconSnooze}</button> : null}
          <button type="button" class={`${styles.action} ${styles.like}`} disabled={busy} onClick={() => action("like")} aria-label="лайк" title="лайк">{iconLike}</button>
        </div>
      </> : <section class={styles.empty}><h2>{filtered ? "По фильтрам никого нет" : "Анкеты на сегодня закончились"}</h2><p>{filtered ? "Сними часть фильтров — так лента снова откроется." : passed ? "Пропущенные сами не вернутся. Можно вернуть их вручную — лайки и чаты не сбросятся." : "Можно ослабить фильтры или заглянуть позже."}</p>{filtered ? <Button variant="ghost" slim onClick={clearFilters}>сбросить фильтры</Button> : passed ? <Button variant="solid" slim onClick={restart}>вернуть пропущенных</Button> : null}</section>}
      {error ? <p class={styles.error} role="alert">{error}</p> : null}
    </main>
  </div>;
}
