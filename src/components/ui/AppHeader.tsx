import type { ComponentChildren, JSX } from "preact";
import styles from "./AppHeader.module.css";

export const THEME_LIST = [
  { id: "pastel", label: "пастель" },
  { id: "mist", label: "дымка" },
  { id: "night", label: "ночь" },
  { id: "dusk", label: "сумерки" },
  { id: "slate", label: "грифель" },
] as const;

export type ThemeName = (typeof THEME_LIST)[number]["id"];

export type AppHeaderProps = {
  homeHref?: string;
  onHomeClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement>) => void;
  logoPosition?: "left" | "center";
  showActions?: boolean;
  showBetaBadge?: boolean;
  showThemeSwatches?: boolean;
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
  showThemeSwatches = false,
  onThemeSelect,
  rightSlot,
  children,
  className,
}: AppHeaderProps) {
  const isCenter = logoPosition === "center";

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
        {showBetaBadge && <span class={styles.betaLabel}>beta</span>}
      </a>

      {showActions && (
        <div class={styles.headerEnd}>
          {showThemeSwatches && (
            <div class={styles.swatches} role="group" aria-label="цвет">
              {THEME_LIST.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  class={styles.swatch}
                  data-theme-set={t.id}
                  aria-label={t.label}
                  title={t.label}
                  onClick={() => onThemeSelect?.(t.id)}
                />
              ))}
            </div>
          )}
          {rightSlot}
          {children}
        </div>
      )}
    </header>
  );
}
