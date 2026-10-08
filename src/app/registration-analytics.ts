const CREATED_EVENT = "wiring:registration-created";
const ANALYTICS_EVENT = "wiring:analytics-change";
const CONSENT_KEY = "wiring-analytics-consent";
export const REGISTRATION_GOAL = "registration_success";

type AnalyticsWindow = Window & {
  WIRING_METRIKA_ID?: string;
  WIRING_ANALYTICS?: { requestConsent?: () => void };
  ym?: (counter: number, method: "reachGoal", target: string) => void;
};

/** Call only after /api/register has successfully created a new account. */
export function registrationCreated(): void {
  document.dispatchEvent(new Event(CREATED_EVENT));
}

/** Keep pending events in this document only; never opt a person into analytics. */
export function initRegistrationAnalytics(win: AnalyticsWindow, doc: Document): () => void {
  const root = doc.getElementById("app");
  let pending = root?.dataset.registrationCreated === "true" ? 1 : 0;
  if (root) delete root.dataset.registrationCreated;

  const flush = () => {
    let consent: string | null;
    try {
      consent = win.localStorage.getItem(CONSENT_KEY);
    } catch {
      return;
    }
    if (consent === "denied") pending = 0;
    if (pending && !consent) {
      try {
        win.WIRING_ANALYTICS?.requestConsent?.();
      } catch {
        // Optional consent UI must not block account creation either.
      }
    }
    const counter = String(win.WIRING_METRIKA_ID || "").trim();
    if (!pending || consent !== "granted" || !/^\d{5,15}$/.test(counter) || typeof win.ym !== "function") return;
    while (pending > 0) {
      pending -= 1;
      try {
        win.ym(Number(counter), "reachGoal", REGISTRATION_GOAL);
      } catch {
        // Tracking must never interrupt registration or navigation.
      }
    }
  };
  const created = () => {
    pending += 1;
    flush();
  };
  doc.addEventListener(CREATED_EVENT, created);
  doc.addEventListener(ANALYTICS_EVENT, flush);
  flush();
  return () => {
    doc.removeEventListener(CREATED_EVENT, created);
    doc.removeEventListener(ANALYTICS_EVENT, flush);
  };
}
