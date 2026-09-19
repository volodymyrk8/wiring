import { useState, useEffect } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import { Tooltip } from "./Tooltip";
import { Select, type SelectOption } from "./Select";
import styles from "./AppHeader.module.css";

export const THEME_LIST = [
  { id: "mist", label: "день" },
  { id: "pastel", label: "пастель" },
  { id: "night", label: "ночь" },
  { id: "dusk", label: "сумерки" },
  { id: "slate", label: "сталь" },
] as const;

export type ThemeName = (typeof THEME_LIST)[number]["id"];

export const THEME_OPTIONS: SelectOption<ThemeName>[] = [
  { value: "mist", label: "день", swatchTheme: "mist" },
  { value: "pastel", label: "пастель", swatchTheme: "pastel" },
  { value: "night", label: "ночь", swatchTheme: "night" },
  { value: "dusk", label: "сумерки", swatchTheme: "dusk" },
  { value: "slate", label: "сталь", swatchTheme: "slate" },
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

