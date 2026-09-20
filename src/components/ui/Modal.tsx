import { useEffect, useRef } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import styles from "./Modal.module.css";

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: ComponentChildren;
  children: ComponentChildren;
  footer?: ComponentChildren;
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  ariaLabel?: string;
  responsiveSheet?: boolean;
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEsc = true,
  className,
  ariaLabel,
  responsiveSheet = false,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    ) || []).filter((element) => element.getClientRects().length > 0);
    (focusable()[0] || modalRef.current)?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) { e.preventDefault(); modalRef.current?.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === modalRef.current)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };

    // Lock body scrolling while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, closeOnEsc]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      class={`${styles.backdrop}${responsiveSheet ? ` ${styles.responsiveSheet}` : ""}`}
      onClick={handleBackdropClick}
      data-modal-backdrop="true"
    >
      <div
        ref={modalRef}
        class={`${styles.modal}${className ? ` ${className}` : ""}`}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={typeof title === "string" ? title : ariaLabel || "диалоговое окно"}
      >
        {(title || showCloseButton) && (
          <div class={styles.header}>
            {title ? <h3 class={styles.title}>{title}</h3> : <div />}
            {showCloseButton && (
              <button
                type="button"
                class={styles.closeBtn}
                onClick={onClose}
                aria-label="Закрыть"
                title="Закрыть"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div class={styles.body}>{children}</div>

        {footer && <div class={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
