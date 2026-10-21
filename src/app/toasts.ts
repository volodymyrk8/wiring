/** One placement and dismissal model for notices on every screen. */
export function showToast(text: string, action?: () => void) {
  let stack = document.getElementById("toasts");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toasts";
    stack.className = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = action ? "toast tap" : "toast";
  const label = document.createElement(action ? "button" : "span");
  label.textContent = text;
  if (action) label.addEventListener("click", () => { dismiss(); action(); });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Закрыть уведомление");
  const timer = window.setTimeout(() => dismiss(), action ? 5000 : 1800);
  const dismiss = () => { clearTimeout(timer); el.remove(); };
  close.addEventListener("click", dismiss);
  let start: { x: number; y: number } | null = null;
  el.addEventListener("pointerdown", (event) => { start = { x: event.clientX, y: event.clientY }; });
  el.addEventListener("pointermove", (event) => {
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) el.setPointerCapture(event.pointerId);
  });
  el.addEventListener("pointerup", (event) => {
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 35) dismiss();
    start = null;
  });
  el.addEventListener("pointercancel", () => { start = null; });
  el.append(label, close);
  stack.appendChild(el);
  while (stack.children.length > 2) stack.firstElementChild?.remove();
}
