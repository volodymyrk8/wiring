import { useEffect } from "preact/hooks";
import type { RefObject } from "preact";

const POPUP_OPEN_EVENT = "wiring-popup-open";

export function announcePopupOpen(element: HTMLElement | null) {
  document.dispatchEvent(new CustomEvent<HTMLElement | null>(POPUP_OPEN_EVENT, { detail: element }));
}

/** Shared dismissal behavior for independent dropdowns and popovers. */
export function useDismissibleLayer(
  ref: RefObject<HTMLElement>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    const closeWhenAnotherOpens = (event: Event) => {
      const otherElement = (event as CustomEvent<HTMLElement | null>).detail;
      if (otherElement !== ref.current) onClose();
    };

    document.addEventListener(POPUP_OPEN_EVENT, closeWhenAnotherOpens);
    return () => document.removeEventListener(POPUP_OPEN_EVENT, closeWhenAnotherOpens);
  }, [onClose, ref]);

  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("pointerdown", closeOnPointerDown, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose, ref]);
}
