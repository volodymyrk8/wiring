import { useState, useEffect } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import { Tooltip } from "./Tooltip";
import { Select, type SelectOption } from "./Select";
import { Button } from "./Button";
import styles from "./AppHeader.module.css";

export const THEME_LIST = [
  { id: "mist", label: "день" },
  { id: "pastel", label: "пастель" },
  { id: "dusk", label: "сумерки" },
  { id: "night", label: "ночь" },
  { id: "slate", label: "полночь" },
] as const;

export type ThemeName = (typeof THEME_LIST)[number]["id"];

export function ThemeIcon({ theme, size = 20 }: { theme: ThemeName; size?: number }) {
  if (theme === "mist") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
      </svg>
    );
  }
  if (theme === "pastel") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v3M6.3 6.3l2.1 2.1M17.7 6.3l-2.1 2.1M2 16h20M6 16a6 6 0 0 1 12 0M4 20h16" />
      </svg>
    );
  }
  if (theme === "dusk") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 16h20M7 16a5 5 0 0 1 10 0M5 20h14M12 7v4M10 9l2 2 2-2M18.5 4l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
      </svg>
    );
  }
  if (theme === "night") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18.5 13.5A8.5 8.5 0 1 1 9.5 4.5a6.8 6.8 0 0 0 9 9z" />
      <path d="M19 3l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM15 9l.3.7.7.3-.7.3-.3.7-.3-.7-.7-.3.7-.3z" />
    </svg>
  );
}

export const THEME_OPTIONS: SelectOption<ThemeName>[] = [
  { value: "mist", label: "день", icon: <ThemeIcon theme="mist" /> },
  { value: "pastel", label: "пастель", icon: <ThemeIcon theme="pastel" /> },
  { value: "dusk", label: "сумерки", icon: <ThemeIcon theme="dusk" /> },
  { value: "night", label: "ночь", icon: <ThemeIcon theme="night" /> },
  { value: "slate", label: "полночь", icon: <ThemeIcon theme="slate" /> },
];

export type AppHeaderProps = {
  homeHref?: string;
  onHomeClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement>) => void;
  logoPosition?: "left" | "center";
  showActions?: boolean;
  showBetaBadge?: boolean;
  showThemeSelect?: boolean;
  showThemeSwatches?: boolean;
  currentTheme?: ThemeName;
  onThemeSelect?: (theme: ThemeName) => void;
  showBack?: boolean;
  backHref?: string;
  backNav?: string;
  backLabel?: ComponentChildren;
  onBackClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  leftSlot?: ComponentChildren;
  rightSlot?: ComponentChildren;
  sectionTitle?: ComponentChildren;
  children?: ComponentChildren;
  className?: string;
};

export function AppHeader({
  homeHref = "/",
  onHomeClick,
  logoPosition = "left",
  showActions = true,
  showBetaBadge = true,
  sectionTitle,
  showThemeSelect,
  showThemeSwatches,
  currentTheme,
  onThemeSelect,
  showBack,
  backHref,
  backNav,
  backLabel,
  onBackClick,
  leftSlot,
  rightSlot,
  children,
  className,
}: AppHeaderProps) {
  const isCenter = logoPosition === "center";

  const [activeTheme, setActiveTheme] = useState<ThemeName>(() => {
    if (currentTheme) return currentTheme;
    if (typeof document !== "undefined" && document.documentElement.dataset.theme) {
      return (document.documentElement.dataset.theme as ThemeName) || "mist";
    }
    return "mist";
  });

  useEffect(() => {
    if (currentTheme) setActiveTheme(currentTheme);
  }, [currentTheme]);

  const shouldShowThemeDropdown = (showThemeSelect ?? (showThemeSwatches !== undefined ? showThemeSwatches : Boolean(onThemeSelect))) && Boolean(onThemeSelect);

  return (
    <header
      class={`${styles.header}${isCenter ? ` ${styles.center}` : ""}${className ? ` ${className}` : ""}`}
      aria-label="шапка сайта"
      data-logo-position={logoPosition}
    >
      <div class={styles.inner}>
        {(showBack || backHref || onBackClick) ? (
          <div class={styles.headerStart}>
            <Button
              variant="ghost"
              slim
              href={backHref || "/"}
              nav={backNav || "back"}
              onClick={onBackClick}
              className={styles.backBtn}
              ariaLabel="Вернуться назад"
            >
              <svg
                class={styles.backArrow}
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Button>
          </div>
        ) : leftSlot ? (
          <div class={styles.headerStart}>{leftSlot}</div>
        ) : null}

        <div class={styles.brandGroup}>
          <a
            class={styles.brand}
            href={homeHref}
            onClick={onHomeClick}
            data-nav="home"
          >
            <span class={styles.brandName}>
              WIR<span>ING</span>
            </span>
            {showBetaBadge && !sectionTitle && (
              <Tooltip
                className={styles.betaTooltipWrap}
                content="Сайт в стадии беты: всё работает, но возможны небольшие ошибки. Мы постоянно улучшаем сервис."
              >
                <span class={styles.betaLabel}>beta</span>
              </Tooltip>
            )}
          </a>
          {sectionTitle && (
            <>
              <span class={styles.brandDivider} aria-hidden="true">/</span>
              <span class={styles.brandSection} aria-current="page">
                {sectionTitle}
              </span>
            </>
          )}
        </div>

        {showActions && (
          <div class={styles.headerEnd}>
            {shouldShowThemeDropdown && onThemeSelect && (
              <Select<ThemeName>
                options={THEME_OPTIONS}
                value={activeTheme}
                onChange={(theme) => {
                  setActiveTheme(theme);
                  onThemeSelect(theme);
                }}
                showValue={false}
                showChevron={false}
                variant="iconOnly"
                ariaLabel={`Оформление: ${THEME_OPTIONS.find((o) => o.value === activeTheme)?.label || activeTheme}`}
                title={`Оформление: ${THEME_OPTIONS.find((o) => o.value === activeTheme)?.label || activeTheme}`}
              />
            )}
            {rightSlot}
            {children}
          </div>
        )}
      </div>
    </header>
  );
}

