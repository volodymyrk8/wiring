import type { ComponentChildren, JSX } from "preact";
import styles from "./AppHeader.module.css";

export interface BrandSectionProps {
  children?: ComponentChildren;
  title?: ComponentChildren;
  className?: string;
}

export function BrandSection({
  children,
  title,
  className = "",
}: BrandSectionProps): JSX.Element {
  const content = children ?? title;
  return (
    <span
      class={[styles.brandSection, className].filter(Boolean).join(" ")}
      aria-current="page"
    >
      {content}
    </span>
  );
}
