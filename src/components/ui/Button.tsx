import type { ComponentChildren } from "preact";
import styles from "./Button.module.css";

type ButtonProps = {
  variant?: "solid" | "ghost";
  slim?: boolean;
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  href?: string;
  nav?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e: any) => void;
  className?: string;
  ariaLabel?: string;
  children: ComponentChildren;
};

/** Design-system control — styles from `public/styles.css` (`.btn`, `.solid`, `.ghost`). */
export function Button({
  variant = "solid",
  slim,
  fullWidth,
  type = "button",
  href,
  nav,
  disabled,
  loading,
  onClick,
  className,
  ariaLabel,
  children,
}: ButtonProps) {
  const classNames = [
    "btn",
    variant === "solid" ? "solid" : "ghost",
    slim ? "slim" : "",
    fullWidth ? "fullWidth" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <a
        class={classNames}
        href={href}
        data-nav={nav}
        onClick={onClick}
        aria-disabled={disabled || loading ? "true" : undefined}
        aria-label={ariaLabel}
      >
        <span>{children}</span>
      </a>
    );
  }

  return (
    <button
      class={classNames}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {loading && (
        <svg
          class={styles.spinner}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
      )}
      <span>{children}</span>
    </button>
  );
}
