export type FeedSwipe = { x: number; y: number; index: number; axis: "x" | "y" | null };

export function lockFeedSwipeAxis(start: FeedSwipe, x: number, y: number) {
  if (start.axis) return;
  const dx = Math.abs(x - start.x);
  const dy = Math.abs(y - start.y);
  if (Math.max(dx, dy) < 10) return;
  if (dx > dy * 1.2) start.axis = "x";
  else if (dy > dx * 1.2) start.axis = "y";
}

/** One completed vertical gesture moves one card from where it started. */
export function feedSwipeTarget(start: FeedSwipe, x: number, y: number, last: number) {
  lockFeedSwipeAxis(start, x, y);
  const dy = start.y - y;
  if (start.axis !== "y" || Math.abs(dy) <= 40) return null;
  return Math.max(0, Math.min(last, start.index + (dy > 0 ? 1 : -1)));
}
