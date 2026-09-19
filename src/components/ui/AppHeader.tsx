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

export const THEME_OPTIONS: SelectOption<ThemeName>[] = [
  { value: "mist", label: "день", swatchTheme: "mist" },
  { value: "pastel", label: "пастель", swatchTheme: "pastel" },
  { value: "dusk", label: "сумерки", swatchTheme: "dusk" },
  { value: "night", label: "ночь", swatchTheme: "night" },
  { value: "slate", label: "полночь", swatchTheme: "slate" },
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
  backLabel?: ComponentChildren;
  onBackClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  leftSlot?: ComponentChildren;
  rightSlot?: ComponentChildren;
  children?: ComponentChildren;
  className?: string;
};

export function AppHeader({
  homeHref = "/",
  onHomeClick,
  logoPosition = "left",
  showActions = true,
  showBetaBadge = true,
  showThemeSelect,
  showThemeSwatches,
  currentTheme,
  onThemeSelect,
  showBack,
  backHref,
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
      {(showBack || backHref || onBackClick) ? (
        <div class={styles.headerStart}>
          <Button
            variant="ghost"
            slim
            href={backHref || "/"}
            nav="back"
            onClick={onBackClick}
            className={styles.backBtn}
            ariaLabel="Вернуться назад"
          >
            <svg
              class={styles.backArrow}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>{backLabel ?? "Назад"}</span>
          </Button>
        </div>
      ) : leftSlot ? (
        <div class={styles.headerStart}>{leftSlot}</div>
      ) : null}

      <a
        class={styles.brand}
        href={homeHref}
        onClick={onHomeClick}
        data-nav="home"
      >
        <span class={styles.brandName}>
          WIR<span>ING</span>
        </span>
        {showBetaBadge && (
          <Tooltip
            className={styles.betaTooltipWrap}
            content="Сайт в стадии беты: всё работает, но возможны небольшие ошибки. Мы постоянно улучшаем сервис."
          >
            <span class={styles.betaLabel}>beta</span>
          </Tooltip>
        )}
      </a>

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
              variant="default"
              ariaLabel="Оформление"
              title="Оформление"
            />
          )}
          {rightSlot}
          {children}
        </div>
      )}
    </header>
  );
}

