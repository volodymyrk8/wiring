import { useState } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import styles from "./AccordionRow.module.css";

export type AccordionRowProps = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: ComponentChildren;
  endIcon?: ComponentChildren;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: ComponentChildren;
  className?: string;
  panelClassName?: string;
};

export function AccordionRow({
  id,
  title,
  subtitle,
  icon,
  endIcon,
  isOpen: controlledOpen,
  defaultOpen = false,
  onToggle,
  children,
  className,
  panelClassName,
}: AccordionRowProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleToggle = (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const next = !open;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onToggle?.(next);
  };

  const panelId = `${id}-panel`;
  const btnId = `${id}-btn`;

  return (
    <>
      <button
        type="button"
        id={btnId}
        class={`${styles.row}${className ? ` ${className}` : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={handleToggle}
      >
        {icon && <span class={styles.icon} aria-hidden="true">{icon}</span>}
        <span class={styles.grow}>
          <strong class={styles.title}>{title}</strong>
          {subtitle && <small class={styles.subtitle}>{subtitle}</small>}
        </span>
        {endIcon && (
          <span class={`${styles.endIcon}${open ? ` ${styles.endIconRotate}` : ""}`} aria-hidden="true">
            {endIcon}
          </span>
        )}
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        class={`${styles.panel}${panelClassName ? ` ${panelClassName}` : ""}`}
        hidden={!open}
      >
        {children}
      </div>
    </>
  );
}
