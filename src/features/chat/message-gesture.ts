export type ReplyGesture = { x: number; y: number; axis: "x" | "y" | null };

/** Finger travel before a horizontal reply swipe wins over scrolling. */
export const REPLY_AXIS_SLOP = 10;
export const REPLY_COMMIT = 52;
export const REPLY_MAX = 76;
export const LONG_PRESS_MS = 480;
export const LONG_PRESS_CANCEL = 8;

export function lockReplyAxis(start: ReplyGesture, x: number, y: number) {
  if (start.axis) return;
  const dx = Math.abs(x - start.x);
  const dy = Math.abs(y - start.y);
  if (Math.max(dx, dy) < REPLY_AXIS_SLOP) return;
  if (dx > dy * 1.2) start.axis = "x";
  else if (dy > dx * 1.2) start.axis = "y";
}

/**
 * How far the bubble follows a reply swipe.
 * Rightward movement is the messenger gesture (Telegram, WhatsApp, iMessage).
 * Leftward movement stays put so a chat does not feel like a dismiss.
 */
export function replySwipePull(start: ReplyGesture, x: number, y: number) {
  lockReplyAxis(start, x, y);
  if (start.axis !== "x") return 0;
  const dx = x - start.x;
  if (dx <= 0) return 0;
  return Math.min(REPLY_MAX, dx);
}

export function replySwipeCommits(start: ReplyGesture, x: number, y: number) {
  return replySwipePull(start, x, y) >= REPLY_COMMIT;
}

export function longPressCancelled(start: ReplyGesture, x: number, y: number) {
  return Math.hypot(x - start.x, y - start.y) > LONG_PRESS_CANCEL;
}
