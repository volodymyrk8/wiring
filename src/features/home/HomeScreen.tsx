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
        brandPosition="left"
        rightSlot={
          signed ? (
            <ProfileMenu
              avatarUrl={profileAvatar}
              userName={host.userName}
              isPlus={isPlus}
              profileHref={hrefFor("profile")}
              consentsHref={hrefFor("consents")}
              plusHref={hrefFor("plus")}
              notificationsHref={hrefFor("notifications")}
              onProfileClick={handleNav("profile")}
              onConsentsClick={handleNav("consents")}
              onPlusClick={handleNav("plus")}
              onNotificationsClick={handleNav("notifications")}
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

          <div class={styles.about}>
            <p class={styles.aboutText}>
              Мы нейроотличные люди и делаем проект для таких же, как мы. Создаём пространство для свободного и комфортного общения.
            </p>
            <aside class={styles.betaCard} aria-label="информация о бета-версии">
              <div class={styles.betaGraphic} aria-hidden="true">
                <svg viewBox="0 0 200 200" fill="none" class={styles.betaSvg}>
                  <defs>
                    <linearGradient id="betaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="currentColor" stop-opacity="0.85" />
                      <stop offset="100%" stop-color="currentColor" stop-opacity="0.25" />
                    </linearGradient>
                    <linearGradient id="curveGrad" x1="100%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stop-color="currentColor" stop-opacity="0.4" />
                      <stop offset="100%" stop-color="currentColor" stop-opacity="0.05" />
                    </linearGradient>
                  </defs>
                  <path d="M-20,160 C30,120 70,180 140,130 C190,95 210,30 230,10" stroke="url(#curveGrad)" strokeWidth="3" strokeLinecap="round" fill="none" />
                  <path d="M10,190 C60,150 110,190 170,140 C210,105 220,60 235,40" stroke="url(#curveGrad)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                  <path d="M78,185 C78,155 77,95 78,50 C78,32 90,20 108,20 C124,20 138,30 138,47 C138,62 125,74 109,76 C130,78 145,93 145,113 C145,136 126,152 101,152 C91,152 83,148 78,143 M78,56 C85,50 95,46 105,46 C116,46 124,52 124,62 C124,72 115,77 103,77 C93,77 84,74 78,70 M78,92 C86,88 96,86 106,86 C119,86 129,94 129,108 C129,122 117,132 101,132 C91,132 83,127 78,121" fill="url(#betaGrad)" />
                </svg>
              </div>
              <div class={styles.betaBody}>
                <p class={styles.betaText}>
                  <strong class={styles.betaLead}>Бета-версия.</strong> Сообщайте в{" "}
                  <a
                    class={styles.betaLink}
                    href={hrefFor("support")}
                    data-nav="support"
                    onClick={handleNav("support")}
                  >
                    поддержку
                  </a>{" "}
                  о любых замечаниях, пожеланиях и улучшениях — мы быстро и внимательно обрабатываем обратную связь.
                </p>
              </div>
            </aside>
          </div>
        </div>

        <p class={styles.quiet}>Можно быть собой.</p>
      </section>

      <LegalFooter showTopBorder={false} className={styles.homeFooter} onSupportClick={() => navigate("support")} />
    </div>
  );
}
