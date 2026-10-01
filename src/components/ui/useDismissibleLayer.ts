import { useEffect } from "preact/hooks";
import type { RefObject } from "preact";

const POPUP_OPEN_EVENT = "wiring-popup-open";

export function announcePopupOpen(element: HTMLElement | null) {
  document.dispatchEvent(new CustomEvent<HTMLElement | null>(POPUP_OPEN_EVENT, { detail: element }));
}

/** Shared dismissal behavior for independent dropdowns and popovers. */
export function useDismissibleLayer(
  ref: RefObject<HTMLElement | null> | Array<RefObject<HTMLElement | null>>,
  open: boolean,
  onClose: () => void,
) {
  const refs = Array.isArray(ref) ? ref : [ref];
  useEffect(() => {
    const closeWhenAnotherOpens = (event: Event) => {
      const otherElement = (event as CustomEvent<HTMLElement | null>).detail;
      if (!refs.some((item) => item.current && otherElement === item.current)) onClose();
    };

    document.addEventListener(POPUP_OPEN_EVENT, closeWhenAnotherOpens);
    return () => document.removeEventListener(POPUP_OPEN_EVENT, closeWhenAnotherOpens);
  }, [onClose, ref]);

  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && refs.some((item) => item.current?.contains(target))) return;
      onClose();
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
