import { useRef } from "preact/hooks";
import type { JSX } from "preact";

/** Lock the first clear gesture axis; touch vertical scrolling stays native. */
export function usePhotoSwipe(onPhoto: (direction: number) => void, onVertical?: (direction: number) => void) {
  const gesture = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    suppressClick.current = false;
    if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    gesture.current = { x: event.clientX, y: event.clientY, axis: null };
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const lockAxis = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    const start = gesture.current;
    if (!start || start.axis) return;
    const x = Math.abs(event.clientX - start.x);
    const y = Math.abs(event.clientY - start.y);
    if (Math.max(x, y) < 10) return;
    if (x > y * 1.2) start.axis = "x";
    else if (y > x * 1.2) start.axis = "y";
  };
  const onPointerUp = (event: JSX.TargetedPointerEvent<HTMLElement>) => {
    lockAxis(event);
    const start = gesture.current;
    gesture.current = null;
    if (!start) return;
    event.stopPropagation();
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    suppressClick.current = Math.max(Math.abs(dx), Math.abs(dy)) > 10;
    if (start.axis === "x" && Math.abs(dx) > 40) onPhoto(dx < 0 ? 1 : -1);
    else if (start.axis === "y" && Math.abs(dy) > 40 && event.pointerType === "mouse") onVertical?.(dy < 0 ? 1 : -1);
  };
  return {
    onPointerDown,
    onPointerMove: lockAxis,
    onPointerUp,
    onPointerCancel: () => { gesture.current = null; suppressClick.current = true; },
    onClickCapture: (event: JSX.TargetedMouseEvent<HTMLElement>) => {
      if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
    },
  };
}
