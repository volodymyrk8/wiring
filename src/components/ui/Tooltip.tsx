import { useState, useRef, useEffect } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import styles from "./Tooltip.module.css";

export type TooltipProps = {
  children: ComponentChildren;
  content: ComponentChildren;
  placement?: "bottom" | "top";
  className?: string;
};

export function Tooltip({
  children,
  content,
  placement = "bottom",
  className,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const toggle = (e: JSX.TargetedMouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  return (
    <span
      ref={wrapRef}
      class={`${styles.wrap}${isOpen ? ` ${styles.isOpen}` : ""}${className ? ` ${className}` : ""}`}
      tabIndex={0}
      role="button"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      onClick={toggle}
    >
      {children}
      <span
        class={`${styles.popover}${placement === "top" ? ` ${styles.placementTop}` : ""}`}
        role="tooltip"
        onClick={(e) => e.stopPropagation()}
      >
        <span class={styles.arrow} aria-hidden="true" />
        {content}
      </span>
    </span>
  );
}
