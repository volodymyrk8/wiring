import { useState } from "preact/hooks";
import { AppHeader, Button, LegalFooter } from "@/components/ui";
import type { HomeHostBridge } from "./types";
import styles from "./HomeScreen.module.css";

type HomeScreenProps = {
  host: HomeHostBridge;
};

const TagIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.5 12.8V5.5H12l7.2 7.2-6.5 6.5z" />
    <circle cx="8.2" cy="9.2" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 6v12M6 12h12" />
  </svg>
);

const MinusIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 12h12" />
  </svg>
);

const BookIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 5.5h6.2A3.3 3.3 0 0 1 14.5 8.8V19H8.2A3.2 3.2 0 0 0 5 22.2z" />
    <path d="M19 5.5h-6.2A3.3 3.3 0 0 0 9.5 8.8V19H16a3.2 3.2 0 0 1 3 3.2z" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function HomeScreen({ host }: HomeScreenProps) {
  const [traitsOpen, setTraitsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const signed = Boolean(host.user && !host.user.guest);
  const userNeuro = host.user?.neuro || [];
  const userVibe = host.user?.vibe || [];

  const labelOf = (kind: "neuro" | "vibe", id: string) => {
    const list = host.catalog?.[kind] || [];
    return list.find((item) => item.id === id)?.label || id;
  };

  const hasTraits = userNeuro.length > 0 || userVibe.length > 0;

  return (
    <div class={styles.container}>
      <AppHeader />
      <main class={styles.content}>
        <h1 class={styles.title}>Отличные люди рядом</h1>
        <p class={styles.subtitle}>Знакомства для нейроотличных</p>

        {host.faces && host.faces.length > 0 && (
          <div class={styles.faces} aria-hidden="true">
            {host.faces.map((src) => (
              <div key={src} class={styles.face}>
                <img
                  src={`${host.basePath}/public/${src}`}
                  alt=""
                  width="120"
                  height="150"
                  loading="eager"
                  onError={(e) => {
                    const parent = (e.currentTarget as HTMLElement).parentElement;
                    if (parent) parent.style.display = "none";
                  }}
                />
              </div>
            ))}
          </div>
        )}

        <div class={styles.ctaWrap}>
          {signed ? (
            <Button
              variant="primary"
              href={host.hrefFor("deck")}
              nav="deck"
              fullWidth
            >
              Перейти в ленту
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                href={host.hrefFor("register")}
                nav="register"
                fullWidth
              >
                Создать профиль
              </Button>
              <div class={styles.loginLinkWrap}>
                <a
                  class={styles.loginLink}
                  href={host.hrefFor("login")}
                  data-nav="login"
                >
                  Войти
                </a>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          class={styles.accordionBtn}
          aria-expanded={traitsOpen}
          aria-controls="home-traits"
          onClick={() => setTraitsOpen(!traitsOpen)}
        >
          <span class={styles.accordionIco}>
            <TagIcon />
          </span>
          <span class={styles.accordionGrow}>
            <strong class={styles.accordionStrong}>Мои особенности</strong>
            <small class={styles.accordionSmall}>по желанию</small>
          </span>
          <span class={styles.accordionIco}>
            {traitsOpen ? <MinusIcon /> : <PlusIcon />}
          </span>
        </button>

        {traitsOpen && (
          <div class={styles.accordionPanel} id="home-traits">
            {signed ? (
              hasTraits ? (
                <>
                  <div class={styles.chips}>
                    {userNeuro.map((id) => (
                      <span key={id} class={styles.chip}>
                        {labelOf("neuro", id)}
                      </span>
                    ))}
                    {userVibe.map((id) => (
                      <span key={id} class={`${styles.chip} ${styles.chipVibe}`}>
                        {labelOf("vibe", id)}
                      </span>
                    ))}
                  </div>
                  <Button variant="ghost" href={host.hrefFor("profile")} nav="profile" fullWidth>
                    Изменить в профиле
                  </Button>
                </>
              ) : (
                <>
                  <p>Пока ничего не отмечено — это нормально.</p>
                  <Button variant="ghost" href={host.hrefFor("profile")} nav="profile" fullWidth>
                    Изменить в профиле
                  </Button>
                </>
              )
            ) : (
              <>
                <p>По желанию. Можно указать диагнозы позже, в анкете.</p>
                <Button variant="ghost" href={host.hrefFor("register")} nav="register" fullWidth>
                  Добавить при создании профиля
                </Button>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          class={styles.accordionBtn}
          aria-expanded={aboutOpen}
          aria-controls="home-about"
          onClick={() => setAboutOpen(!aboutOpen)}
        >
          <span class={styles.accordionIco}>
            <BookIcon />
          </span>
          <span class={styles.accordionGrow}>
            <strong class={styles.accordionStrong}>Как устроен WIRING</strong>
          </span>
          <span class={styles.accordionIco}>
            <ArrowRightIcon />
          </span>
        </button>

        {aboutOpen && (
          <div class={styles.accordionPanel} id="home-about">
            <p>
              Профиль — фото, особенности и как тебе писать. Лента — анкеты свайпом. Если симпатия взаимная, открывается чат.
            </p>
          </div>
        )}

        <p class={styles.quiet}>Можно быть собой.</p>
      </main>

      <div class={styles.footerWrap}>
        <LegalFooter
          showGlossary={signed}
          testHref={signed ? host.testHref : undefined}
          openInNewTab={false}
        />
      </div>
    </div>
  );
}
