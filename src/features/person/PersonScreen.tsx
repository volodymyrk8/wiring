import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, Modal, ProfileMenu } from "@/components/ui";
import { usePhotoSwipe } from "@/lib/usePhotoSwipe";
import { getErrorMessage } from "@/lib/get-error-message";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
import type { PersonHostBridge, PersonProfile } from "./types";
import styles from "./PersonScreen.module.css";

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

const iconArrow = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>;
const iconPass = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
const iconLike = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 10.1-8.8 10.1S3.2 14 3.2 8.8A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.6Z" /></svg>;
const iconClock = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;

const labelsFor = (catalog: PersonHostBridge["catalog"], kind: "genders" | "looking_for" | "intents", ids: unknown) => {
  const values = Array.isArray(ids) ? ids : ids ? [ids] : [];
  return values.map((id) => catalog[kind]?.find((item) => item.id === id)?.label || String(id)).filter(Boolean);
};

const photosFor = (person: PersonProfile) => {
  const photos = (person.photos || []).map((photo) => {
    if (typeof photo === "string") return photo;
    if (photo && typeof photo === "object") return (photo as { url?: string }).url || "";
    return "";
  }).filter(Boolean);
  if (photos.length) return photos;
  return person.photo ? [person.photo] : [];
};

const photoName = (photo: unknown) => typeof photo === "string" ? photo : photo && typeof photo === "object" ? (photo as { url?: string }).url || "" : "";

function PersonHeader({ host }: { host: PersonHostBridge }) {
  const navigate = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view, params);
  };
  return <AppHeader
    homeHref={host.hrefFor("home")}
    onHomeClick={navigate("home")}
    sectionTitle="анкета"
    showThemeSwatches
    onThemeSelect={host.onThemeSelect}
    rightSlot={<ProfileMenu
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
    />}
  />;
}

export function PersonScreen({ host }: { host: PersonHostBridge }) {
  const person = host.person;
  const isSelf = Boolean(host.user?.id && person.id === host.user.id);
  const photos = photosFor(person);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"block" | "unmatch" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(host.catalog.report_reasons?.[0]?.id || "");
  const [reportDetails, setReportDetails] = useState("");
  const [photoAspect, setPhotoAspect] = useState(3 / 4);

  const backView = host.personFrom === "likes" ? "likes" : host.personFrom === "matches" || host.personFrom === "chat" ? "matches" : "deck";
  const go = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view, params);
  };
  const selectPhoto = (index: number) => setPhotoIndex((index + photos.length) % Math.max(photos.length, 1));
  const changePhoto = (direction: number) => selectPhoto(photoIndex + direction);
  const gesture = usePhotoSwipe(changePhoto);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); } catch (caught) { setError(getErrorMessage(caught)); } finally { setBusy(false); }
  };

  const performSwipe = (direction: "like" | "pass" | "snooze") => void run(() => host.swipe(direction));
  const confirmAction = () => void run(async () => {
    if (confirm === "block") {
      await host.api("/api/block", { method: "POST", body: JSON.stringify({ user_id: person.id }) });
      setConfirm(null);
      host.toast("в блоке");
      host.navigate("deck");
    } else if (confirm === "unmatch") {
      await host.api("/api/unmatch", { method: "POST", body: JSON.stringify({ user_id: person.id }) });
      setConfirm(null);
      host.toast("убрано · в пропущенных");
      host.navigate("matches");
    }
  });
  const submitReport = () => void run(async () => {
    if (!reportReason) return;
    await host.api("/api/report", { method: "POST", body: JSON.stringify({ user_id: person.id, reason: reportReason, details: reportDetails }) });
    setReportOpen(false);
    host.toast("жалоба отправлена, человек скрыт");
    host.navigate("deck");
  });
  const onHeroClick = (event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    changePhoto(event.clientX < rect.left + rect.width * .4 ? -1 : 1);
  };

  const gender = labelsFor(host.catalog, "genders", person.gender);
  const looking = labelsFor(host.catalog, "looking_for", person.looking_for);
  const intents = labelsFor(host.catalog, "intents", person.intents?.length ? person.intents : person.intent);
  const meta = [person.city, person.job, person.height ? `${person.height} см` : "", ...gender].filter(Boolean).join(" · ");
  const secondaryMeta = [...(looking.length ? [`ищет ${looking.join(", ")}`] : []), ...intents].join(" · ");
  const tags = [
    ...(person.neuro || []).map((id) => ({ id, label: host.catalog.neuro?.find((item) => item.id === id)?.label || id, vibe: false })),
    ...(person.vibe || []).map((id) => ({ id, label: host.catalog.vibe?.find((item) => item.id === id)?.label || id, vibe: true })),
  ];
  const reportReasons = host.catalog.report_reasons || [];

  return <div class={styles.root}>
    <PersonHeader host={host} />
    <main class={styles.content}>
      <Button variant="ghost" slim href={host.hrefFor(backView)} nav={backView} onClick={go(backView)} className={styles.back}>{iconArrow}<span>назад</span></Button>
      <section {...gesture} class={styles.hero} style={{ "--photo-aspect": photoAspect }} tabIndex={photos.length > 1 ? 0 : -1} onClick={onHeroClick}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); changePhoto(event.key === "ArrowRight" ? 1 : -1); } }} aria-label={`Фото анкеты ${person.name}`}>
        {photos.length > 1 ? <div class={styles.dots}>{photos.map((_, index) => <i key={index} class={index === photoIndex ? styles.active : ""} />)}</div> : null}
        <img class={styles.heroImage} src={photoUrl(host.basePath, photos[photoIndex] || person.photo, person.name)} alt={`Фото ${photoIndex + 1} из ${photos.length || 1}: ${person.name}`} draggable={false}
          onLoad={(event) => { const image = event.currentTarget; if (image.naturalHeight) setPhotoAspect(image.naturalWidth / image.naturalHeight); }} />
        <div class={styles.heroOverlay}>
          <h1>{person.online ? <span class={styles.online} aria-label="в сети" /> : null}{person.name}{person.age ? `, ${person.age}` : ""}</h1>
          {meta ? <p class={styles.meta}>{meta}</p> : null}
          {secondaryMeta ? <p class={`${styles.meta} ${styles.metaSecondary}`}>{secondaryMeta}</p> : null}
        </div>
      </section>
      {photos.length > 1 ? <div class={styles.photoStrip} aria-label="Фотографии анкеты">{photos.map((photo, index) => <button type="button" data-photo={index} key={`${photoName(photo)}-${index}`} class={`${styles.photoThumb} ${index === photoIndex ? styles.active : ""}`} onClick={() => selectPhoto(index)} aria-pressed={index === photoIndex} aria-label={`Фото ${index + 1} из ${photos.length}`}><img src={photoUrl(host.basePath, photo, person.name)} alt="" /></button>)}</div> : null}
      <div class={styles.body}>
        {person.bio ? <p class={styles.bio}>{person.bio}</p> : null}
        {person.communication ? <div class={styles.prompt}><strong>как тебе писать</strong><p>{person.communication}</p></div> : null}
        {tags.length ? <div class={styles.tags}>{tags.map((tag) => <span key={`${tag.vibe ? "vibe" : "neuro"}-${tag.id}`} class={`${styles.tag} ${tag.vibe ? styles.tagVibe : ""}`}>{tag.label}</span>)}</div> : null}
        {(person.prompts || []).map((prompt) => <div class={styles.prompt} key={prompt.id}><strong>{host.catalog.prompts?.find((item) => item.id === prompt.id)?.label || prompt.id}</strong><p>{prompt.answer}</p></div>)}
        <div class={styles.actions}>
          {isSelf ? (
            <Button fullWidth href={host.hrefFor("profile")} nav="profile" onClick={go("profile")}>Редактировать анкету</Button>
          ) : null}
          {!isSelf && (host.personFrom === "deck" || host.personFrom === "likes") ? <>
            <button type="button" class={`${styles.actionIcon} ${styles.pass}`} disabled={busy} onClick={() => performSwipe("pass")} aria-label="пропустить" title="пропустить">{iconPass}</button>
            {host.user.plus ? <button type="button" class={`${styles.actionIcon} ${styles.snooze}`} disabled={busy} onClick={() => performSwipe("snooze")} aria-label="отложить на неделю" title="отложить на неделю">{iconClock}</button> : null}
            <button type="button" class={`${styles.actionIcon} ${styles.like}`} disabled={busy} onClick={() => performSwipe("like")} aria-label="лайк" title="лайк">{iconLike}</button>
          </> : null}
          {!isSelf && person.matched ? <Button slim className={styles.matchedAction} href={host.hrefFor("chat", { id: person.id })} nav="chat" onClick={go("chat", { id: person.id })}>написать</Button> : null}
        </div>
        {!isSelf ? <div class={styles.safety}>
          {person.matched ? <Button variant="ghost" slim disabled={busy} onClick={() => setConfirm("unmatch")}>размэтчить</Button> : null}
          {person.matched ? <Button variant="ghost" slim disabled={busy} onClick={() => setConfirm("block")}>в блок</Button> : null}
          <Button variant="ghost" slim disabled={busy} onClick={() => setReportOpen(true)}>пожаловаться</Button>
        </div> : null}
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
      </div>
    </main>
    <Modal isOpen={confirm !== null} onClose={() => !busy && setConfirm(null)} title={confirm === "unmatch" ? "Убрать чат?" : "Скрыть человека?"} footer={<><Button variant="ghost" slim disabled={busy} onClick={() => setConfirm(null)}>отмена</Button><Button variant="solid" slim loading={busy} disabled={busy} onClick={confirmAction}>{confirm === "unmatch" ? "убрать чат" : "скрыть"}</Button></>}>
      <p class={styles.modalHint}>{confirm === "unmatch" ? "Переписка сохранится, но чат исчезнет из списка." : "Человек исчезнет из ленты и чатов."}</p>
    </Modal>
    <Modal isOpen={reportOpen} onClose={() => !busy && setReportOpen(false)} title="Пожаловаться" footer={<><Button variant="ghost" slim disabled={busy} onClick={() => setReportOpen(false)}>отмена</Button><Button variant="solid" slim loading={busy} disabled={busy || !reportReason} onClick={submitReport}>отправить</Button></>}>
      <div class={styles.reportForm}>
        <div class={styles.reportReasons}>{reportReasons.map((reason) => <label class={styles.reason} key={reason.id}><input type="radio" name="person-report-reason" value={reason.id} checked={reportReason === reason.id} onChange={() => setReportReason(reason.id)} /> <span>{reason.label}</span></label>)}</div>
        <label>коротко, если нужно<textarea maxlength={280} rows={3} value={reportDetails} onInput={(event) => setReportDetails(event.currentTarget.value)} /></label>
      </div>
    </Modal>
  </div>;
}
