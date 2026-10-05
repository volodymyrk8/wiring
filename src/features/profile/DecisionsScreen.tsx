import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import { AppHeader, Button, LegalFooter, Modal, ProfileMenu } from "@/components/ui";
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
    title: "Убрать лайк?",
    body: "Анкета снова сможет попасть в ленту.",
    confirm: "Убрать лайк",
  },
  restore: {
    title: "Вернуть в ленту?",
    body: "Дизлайк снимется, и анкета снова сможет попасться.",
    confirm: "Вернуть",
  },
  unblock: {
    title: "Разблокировать?",
    body: "Блок снимется. В ленту анкета сама не вернётся — она останется в дизлайках, пока ты не вернёшь её отдельно.",
    confirm: "Разблокировать",
  },
  unmatch: {
    title: "Убрать из чатов?",
    body: "Переписка скроется. Анкета уйдёт в дизлайки и не появится в ленте, пока ты сам её не вернёшь.",
    confirm: "Убрать из чатов",
  },
};

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

  return (
    <div class={styles.root}>
      <AppHeader
        homeHref={host.hrefFor("home")}
        onHomeClick={navigate("home")}
        showBack
        backHref={host.hrefFor("profile")}
        onBackClick={navigate("profile")}
        sectionTitle="Лайки, дизлайки, блок"
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
          <h1>Лайки, дизлайки, блок</h1>
          <p>Сюда можно зайти, когда хочется передумать. В ленте и чатах этого списка нет.</p>
        </div>
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
        {!archive ? <p class={styles.empty}>Загружаем…</p> : (
          <>
            <Section title="Лайки" empty="Лайков пока нет." count={archive.likes.length}>
              {archive.likes.map((person) => (
                <Row key={person.id} person={person} href={host.hrefFor("person", { id: person.id })} onOpen={openPerson(person)}>
                  {person.matched ? <span class={styles.badge}>взаимно</span> : null}
                  <Button
                    variant="ghost"
                    slim
                    type="button"
                    onClick={() => setPending({ person, action: person.matched ? "unmatch" : "unlike" })}
                  >
                    {person.matched ? "убрать из чатов" : "убрать лайк"}
                  </Button>
                </Row>
              ))}
            </Section>
            <Section title="Дизлайки" empty="Скрытых анкет пока нет." count={archive.passes.length}>
              {archive.passes.map((person) => (
                <Row key={person.id} person={person} href={host.hrefFor("person", { id: person.id })} onOpen={openPerson(person)}>
                  <Button variant="ghost" slim type="button" onClick={() => setPending({ person, action: "restore" })}>вернуть в ленту</Button>
                </Row>
              ))}
            </Section>
            <Section title="Блок" empty="В блоке никого нет." count={archive.blocks.length}>
              {archive.blocks.map((person) => (
                <Row key={person.id} person={person}>
                  <Button variant="ghost" slim type="button" onClick={() => setPending({ person, action: "unblock" })}>разблокировать</Button>
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
          <Button variant="ghost" slim disabled={busy} onClick={() => setPending(null)}>отмена</Button>
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
  const label = `${person.name || "Анкета"}${person.age ? `, ${person.age}` : ""}`;
  return (
    <li class={styles.row}>
      {href && onOpen ? (
        <a class={styles.who} href={href} onClick={onOpen}>
          {src ? <img src={src} alt="" /> : <span class={styles.fallback} aria-hidden="true">{String(person.name || "?").slice(0, 1)}</span>}
          <span><strong>{label}</strong>{person.city ? <small>{person.city}</small> : null}</span>
        </a>
      ) : (
        <div class={styles.who}>
          {src ? <img src={src} alt="" /> : <span class={styles.fallback} aria-hidden="true">{String(person.name || "?").slice(0, 1)}</span>}
          <span><strong>{label}</strong>{person.city ? <small>{person.city}</small> : null}</span>
        </div>
      )}
      <div class={styles.actions}>{children}</div>
    </li>
  );
}
