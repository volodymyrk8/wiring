import { useEffect, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, LegalFooter, Button, ProfileMenu } from "@/components/ui";
import { HomeFaces } from "./components/HomeFaces";
import type { HomeHostBridge } from "./types";
import styles from "./HomeScreen.module.css";

const ArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.2 19c1.4-3.2 4-4.8 6.8-4.8s5.4 1.6 6.8 4.8" />
  </svg>
);

export type HomeScreenProps = {
  host: HomeHostBridge;
};

export function HomeScreen({ host }: HomeScreenProps) {
  const { signed, isPlus, basePath = "", fetchHomeFaces, profileAvatar, hrefFor, navigate, onThemeSelect } = host;
  const [homeFaces, setHomeFaces] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchHomeFaces().then((faces) => {
      if (!cancelled && faces.length) setHomeFaces(faces);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchHomeFaces]);

  const handleNav = (view: string) => (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    navigate(view);
  };

  return (
    <div class={styles.page}>
      <AppHeader
        homeHref={hrefFor("home")}
        onHomeClick={handleNav("home")}
        showThemeSelect
        onThemeSelect={onThemeSelect}
        rightSlot={
          signed ? (
            <ProfileMenu
              avatarUrl={profileAvatar}
              userName={host.userName}
              isPlus={isPlus}
              profileHref={hrefFor("profile")}
              consentsHref={hrefFor("consents")}
              plusHref={hrefFor("plus")}
              onProfileClick={handleNav("profile")}
              onConsentsClick={handleNav("consents")}
              onPlusClick={handleNav("plus")}
              onLogout={host.onLogout}
            />
          ) : (
            <a
              href={hrefFor("login")}
              onClick={handleNav("login")}
              class="icon-btn profile-slot"
              data-nav="login"
              aria-label="войти"
            >
              <UserIcon />
            </a>
          )
        }
      />

      <section class={styles.home} aria-label="главная">
        <div class={styles.stack}>
          <header class={styles.hero}>
            <h1 class={styles.title}>
              <span class={styles.titleAccent}>Отличные</span> люди рядом
            </h1>
            <p class={styles.sub}>Знакомства для нейроотличных</p>
          </header>

          {homeFaces.length ? <HomeFaces faces={homeFaces} basePath={basePath} /> : null}

          {signed ? (
            <Button
              variant="solid"
              fullWidth
              href={hrefFor("deck")}
              nav="deck"
              onClick={handleNav("deck")}
            >
              Показать ленту <ArrowIcon />
            </Button>
          ) : (
            <div class={styles.guestCta}>
              <Button
                variant="solid"
                fullWidth
                href={hrefFor("register")}
                nav="register"
                onClick={handleNav("register")}
              >
                Создать профиль
              </Button>
              <div class={styles.switchRow}>
                <span class={styles.switchPrompt}>Уже есть профиль?</span>
                <a
                  class={styles.switchLink}
                  href={hrefFor("login")}
                  data-nav="login"
                  onClick={handleNav("login")}
                >
                  Войти
                </a>
              </div>
            </div>
          )}
        </div>

        <p class={styles.quiet}>Можно быть собой.</p>
      </section>

      <LegalFooter showTopBorder={false} className={styles.homeFooter} />
    </div>
  );
}
