import { tr } from "@/lib/i18n";
import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import { AppHeader, Button, IconButton, LegalFooter, Modal, ProfileMenu } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
import type { ProfileHostBridge } from "./types";
import styles from "./DecisionsScreen.module.css";

type DecisionPerson = {
  id: number;
  name: string;
  age?: number | string;
  city?: string;
  photo?: string;
  matched?: boolean;
};

type Archive = {
  likes: DecisionPerson[];
  passes: DecisionPerson[];
  blocks: DecisionPerson[];
};

type Action = "unlike" | "restore" | "unblock" | "unmatch";

type Pending = { person: DecisionPerson; action: Action };

const COPY: Record<Action, { title: string; body: string; confirm: string }> = {
  unlike: {
    title: tr("Убрать лайк?"),
    body: tr("Анкета снова сможет попасть в ленту."),
    confirm: tr("Убрать лайк"),
  },
  restore: {
    title: tr("Вернуть в ленту?"),
    body: tr("Дизлайк снимется, и анкета снова сможет попасться."),
    confirm: tr("Вернуть"),
  },
  unblock: {
    title: tr("Разблокировать?"),
    body: tr("Блок снимется. В ленту анкета сама не вернётся — она останется в дизлайках, пока ты не вернёшь её отдельно."),
    confirm: tr("Разблокировать"),
  },
  unmatch: {
    title: tr("Убрать из чатов?"),
    body: tr("Переписка скроется. Анкета уйдёт в дизлайки и не появится в ленте, пока ты сам её не вернёшь."),
    confirm: tr("Убрать из чатов"),
  },
};

const iconLike = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.8 8.8c0 5.2-8.8 10.1-8.8 10.1S3.2 14 3.2 8.8A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.6Z" />
  </svg>
);
const iconPass = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

const photoSrc = (person: DecisionPerson) => {
  const value = person.photo || "";
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http") || value.startsWith("/")) return value;
  return `/${value}`;
};

export function DecisionsScreen({ host }: { host: ProfileHostBridge }) {
  const [archive, setArchive] = useState<Archive | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = (view: string) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view);
  };

  useEffect(() => {
    let cancelled = false;
    host.api("/api/archive")
      .then((response: Archive) => {
        if (!cancelled) setArchive({ likes: response.likes || [], passes: response.passes || [], blocks: response.blocks || [] });
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(getErrorMessage(caught));
      });
    return () => { cancelled = true; };
  }, [host]);

  const reloadArchive = () => host.api("/api/archive").then((response: Archive) => {
    setArchive({ likes: response.likes || [], passes: response.passes || [], blocks: response.blocks || [] });
  });

  const quickSwipe = async (person: DecisionPerson, direction: "like" | "pass") => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await host.api("/api/swipe", {
        method: "POST",
        body: JSON.stringify({ target_id: person.id, direction }),
      });
      await reloadArchive();
      if (response.matched) host.toast(tr("взаимно с {0}. Чат в разделе «Чаты».", person.name || tr("собой")));
      else host.toast(direction === "like" ? tr("Лайк отправлен") : tr("Анкета больше не появится в ленте"));
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await host.api("/api/archive", {
        method: "POST",
        body: JSON.stringify({ user_id: pending.person.id, action: pending.action }),
      });
      setArchive({ likes: response.likes || [], passes: response.passes || [], blocks: response.blocks || [] });
      setPending(null);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const openPerson = (person: DecisionPerson) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    host.navigate("person", { id: person.id });
  };

  const oneWayLikes = archive?.likes.filter((person) => !person.matched) || [];

  return (
    <div class={styles.root}>
      <AppHeader
        homeHref={host.hrefFor("home")}
        onHomeClick={navigate("home")}
        showBack
        backHref={host.hrefFor("profile")}
        onBackClick={navigate("profile")}
        sectionTitle={tr("Лайки, дизлайки, блок")}
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
      />
      <main class={styles.content}>
        <div class={styles.heading}>
          <h1>{tr("Лайки, дизлайки, блок")}</h1>
          <p>{tr("Сюда можно зайти, когда хочется передумать. В ленте и чатах этого списка нет.")}</p>
        </div>
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
        {!archive ? <p class={styles.empty}>{tr("Загружаем…")}</p> : (
          <>
            <Section title={tr("Лайки")} empty={tr("Лайков пока нет. Взаимные — в разделе «Чаты».")} count={oneWayLikes.length}>
              {oneWayLikes.map((person) => (
                <Row key={person.id} person={person} href={host.hrefFor("person", { id: person.id })} onOpen={openPerson(person)}>
                  <div class={styles.quickActions}>
                    <IconButton class={`${styles.quickBtn} ${styles.quickLikeActive}`} type="button" disabled aria-label={tr("Лайк уже отправлен")} title={tr("Лайк уже отправлен")}>{iconLike}</IconButton>
                    <IconButton class={styles.quickBtn} type="button" disabled={busy} aria-label={tr("Скрыть из ленты")} title={tr("Скрыть из ленты")} onClick={() => void quickSwipe(person, "pass")}>{iconPass}</IconButton>
                  </div>
                  <Button variant="ghost" slim type="button" disabled={busy} onClick={() => setPending({ person, action: "unlike" })}>{tr("убрать лайк")}</Button>
                </Row>
              ))}
            </Section>
            <Section title={tr("Дизлайки")} empty={tr("Скрытых анкет пока нет.")} count={archive.passes.length}>
              {archive.passes.map((person) => (
                <Row key={person.id} person={person} href={host.hrefFor("person", { id: person.id })} onOpen={openPerson(person)}>
                  <div class={styles.quickActions}>
                    <IconButton class={styles.quickBtn} type="button" disabled={busy} aria-label={tr("Лайк")} title={tr("Лайк")} onClick={() => void quickSwipe(person, "like")}>{iconLike}</IconButton>
                    <IconButton class={`${styles.quickBtn} ${styles.quickPassActive}`} type="button" disabled aria-label={tr("Скрыто из ленты")} title={tr("Скрыто из ленты")}>{iconPass}</IconButton>
                  </div>
                  <Button variant="ghost" slim type="button" disabled={busy} onClick={() => setPending({ person, action: "restore" })}>{tr("только в ленту")}</Button>
                </Row>
              ))}
            </Section>
            <Section title={tr("Блок")} empty={tr("В блоке никого нет.")} count={archive.blocks.length}>
              {archive.blocks.map((person) => (
                <Row key={person.id} person={person}>
                  <Button variant="ghost" slim type="button" onClick={() => setPending({ person, action: "unblock" })}>{tr("разблокировать")}</Button>
                </Row>
              ))}
            </Section>
          </>
        )}
      </main>
      <LegalFooter />
      <Modal
        isOpen={pending !== null}
        onClose={() => { if (!busy) setPending(null); }}
        title={pending ? COPY[pending.action].title : ""}
        footer={pending ? <>
          <Button variant="ghost" slim disabled={busy} onClick={() => setPending(null)}>{tr("отмена")}</Button>
          <Button variant="solid" slim loading={busy} disabled={busy} onClick={() => void apply()}>{COPY[pending.action].confirm}</Button>
        </> : null}
      >
        <p class={styles.hint}>{pending ? COPY[pending.action].body : ""}</p>
      </Modal>
    </div>
  );
}

function Section({ title, empty, count, children }: { title: string; empty: string; count: number; children: ComponentChildren }) {
  return (
    <section class={styles.section}>
      <h2>{title}</h2>
      {count ? <ul class={styles.list}>{children}</ul> : <p class={styles.empty}>{empty}</p>}
    </section>
  );
}

function Row({
  person,
  href,
  onOpen,
  children,
}: {
  person: DecisionPerson;
  href?: string;
  onOpen?: (event: JSX.TargetedMouseEvent<HTMLAnchorElement>) => void;
  children: ComponentChildren;
}) {
  const src = photoSrc(person);
  const label = `${person.name || tr("Анкета")}${person.age ? `, ${person.age}` : ""}`;
  return (
    <li class={styles.row}>
      {href && onOpen ? (
        <a class={styles.who} href={href} onClick={onOpen}>
          {src ? <img src={src} alt="" /> : <span class={styles.fallback} aria-hidden="true">{String(person.name || "?").slice(0, 1)}</span>}
          <span><strong>{label}</strong>{person.city ? <small>{tr(person.city)}</small> : null}</span>
        </a>
      ) : (
        <div class={styles.who}>
          {src ? <img src={src} alt="" /> : <span class={styles.fallback} aria-hidden="true">{String(person.name || "?").slice(0, 1)}</span>}
          <span><strong>{label}</strong>{person.city ? <small>{tr(person.city)}</small> : null}</span>
        </div>
      )}
      <div class={styles.actions}>{children}</div>
    </li>
  );
}
