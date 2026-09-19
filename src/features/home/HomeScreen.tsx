import type { JSX } from "preact";
import { AppHeader, LegalFooter, AccordionRow, Button, ProfileMenu } from "@/components/ui";
import { HomeFaces } from "./components/HomeFaces";
import type { HomeHostBridge } from "./types";
import styles from "./HomeScreen.module.css";

const TagIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 12.8V5.5H12l7.2 7.2-6.5 6.5z" />
    <circle cx="8.2" cy="9.2" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6v12M6 12h12" />
  </svg>
);

const BookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 5.5h6.2A3.3 3.3 0 0 1 14.5 8.8V19H8.2A3.2 3.2 0 0 0 5 22.2z" />
    <path d="M19 5.5h-6.2A3.3 3.3 0 0 0 9.5 8.8V19H16a3.2 3.2 0 0 1 3 3.2z" />
  </svg>
);

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

const GemIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3h12l4 6-10 13L2 9Z" />
    <path d="M11 3 8 9l4 13 4-13-3-6" />
    <path d="M2 9h20" />
  </svg>
);

export type HomeScreenProps = {
  host: HomeHostBridge;
};

export function HomeScreen({ host }: HomeScreenProps) {
  const { signed, isPlus, basePath = "", homeFaces, userTraits, profileAvatar, hrefFor, navigate, onThemeSelect } = host;

  const handleNav = (view: string) => (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    navigate(view);
  };

  return (
    <>
      <AppHeader
        homeHref={hrefFor("home")}
        onHomeClick={handleNav("home")}
        showThemeSwatches={true}
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
        <h1 class={styles.title}>Отличные люди рядом</h1>
        <p class={styles.sub}>Знакомства для нейроотличных</p>

        <HomeFaces faces={homeFaces} basePath={basePath} />

        {signed ? (
          <Button
            variant="solid"
            fullWidth
            href={hrefFor("deck")}
            nav="deck"
            onClick={handleNav("deck")}
            className={styles.ctaBtn}
          >
            Перейти в ленту <ArrowIcon />
          </Button>
        ) : (
          <div class={styles.guestCtaGroup}>
            <Button
              variant="solid"
              fullWidth
              href={hrefFor("register")}
              nav="register"
              onClick={handleNav("register")}
              className={styles.ctaBtn}
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

        <AccordionRow
          id="home-traits"
          title="Мои особенности"
          subtitle="по желанию"
          icon={<TagIcon />}
          endIcon={<PlusIcon />}
        >
          {signed ? (
            <>
              {userTraits && userTraits.length > 0 ? (
                <div class={styles.chips}>
                  {userTraits.map((t) => (
                    <span key={t.label} class={`${styles.chip}${t.vibe ? ` ${styles.chipVibe}` : ""}`}>
                      {t.label}
                    </span>
                  ))}
                </div>
              ) : (
                <p class={styles.hint}>Пока ничего не отмечено — это нормально.</p>
              )}
              <a
                class={styles.actionLink}
                href={hrefFor("profile")}
                onClick={handleNav("profile")}
                data-nav="profile"
              >
                Изменить в профиле
              </a>
            </>
          ) : (
            <>
              <p class={styles.hint}>По желанию. Можно указать диагнозы позже, в анкете.</p>
              <a
                class={styles.actionLink}
                href={hrefFor("register")}
                onClick={handleNav("register")}
                data-nav="register"
              >
                Добавить при создании профиля
              </a>
            </>
          )}
        </AccordionRow>

        <AccordionRow
          id="home-about"
          title="Как устроен WIRING"
          icon={<BookIcon />}
          endIcon={<ArrowIcon />}
        >
          <p class={styles.hint}>
            Профиль — фото, особенности и как тебе писать. Лента — анкеты свайпом. Если симпатия взаимная, открывается чат.
          </p>
        </AccordionRow>

        <p class={styles.quiet}>Можно быть собой.</p>
      </section>

      <LegalFooter showGlossary={signed} />
    </>
  );
}
