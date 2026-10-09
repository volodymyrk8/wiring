import { useState, useRef, useEffect, useLayoutEffect } from "preact/hooks";
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
  const popoverRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; arrow: number }>();

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const popover = popoverRef.current;
    if (!wrap || !popover) return;

    const place = () => {
      const anchor = wrap.getBoundingClientRect();
      const width = popover.offsetWidth;
      const preferred = window.innerWidth <= 420 ? -12 : -16;
      // Invisible absolute children can still widen the document on iOS.
      // Keep both closed and open tooltips inside the viewport.
      const left = Math.max(16 - anchor.left,
        Math.min(preferred, window.innerWidth - 16 - anchor.left - width));
      const arrow = Math.max(10, Math.min(width - 10, anchor.width / 2 - left));
      setPosition((previous) => previous?.left === left && previous.arrow === arrow
        ? previous : { left, arrow });
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(wrap);
    observer.observe(popover);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

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
        ref={popoverRef}
        class={`${styles.popover}${placement === "top" ? ` ${styles.placementTop}` : ""}`}
        style={position ? { left: `${position.left}px` } : undefined}
        role="tooltip"
        onClick={(e) => e.stopPropagation()}
      >
        <span class={styles.arrow} style={position ? { left: `${position.arrow}px` } : undefined} aria-hidden="true" />
        {content}
      </span>
    </span>
  );
}
