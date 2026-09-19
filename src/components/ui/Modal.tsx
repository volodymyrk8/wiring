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
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    // Lock body scrolling while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      class={styles.backdrop}
      onClick={handleBackdropClick}
      data-modal-backdrop="true"
    >
      <div
        ref={modalRef}
        class={`${styles.modal}${className ? ` ${className}` : ""}`}
        role="dialog"
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
