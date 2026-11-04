const CREATED_EVENT = "wiring:registration-created";
const ANALYTICS_EVENT = "wiring:analytics-change";
const CONSENT_KEY = "wiring-analytics-consent";
export const REGISTRATION_GOAL = "registration_success";

type AnalyticsWindow = Window & {
  WIRING_METRIKA_ID?: string;
  WIRING_ANALYTICS?: { requestConsent?: () => void };
  ym?: (counter: number, method: string, target: string | ((id: string) => void)) => void;
};

/** Call only after /api/register has successfully created a new account. */
export function registrationCreated(serverManaged = false): void {
  document.dispatchEvent(new CustomEvent(CREATED_EVENT, { detail: serverManaged }));
}

/** Persist only a pending flag; the signed receipt stays in an HttpOnly cookie. */
export function initRegistrationAnalytics(win: AnalyticsWindow, doc: Document): () => void {
  const root = doc.getElementById("app");
  let pending = root?.dataset.registrationCreated === "true" ? 1 : 0;
  const receiptKey = "wiring-registration-pending";
  const base = root?.dataset.base || "";
  let serverManaged = root?.dataset.registrationManaged === "true";
  try { serverManaged ||= win.sessionStorage.getItem(receiptKey) === "1"; } catch { /* optional */ }
  if (serverManaged) pending = Math.max(1, pending);
  let sequence = 0;
  let sending = false;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retries = 0;
  if (root) delete root.dataset.registrationCreated;
  if (root) delete root.dataset.registrationManaged;

  const remember = () => {
    try {
      if (serverManaged) win.sessionStorage.setItem(receiptKey, "1");
      else win.sessionStorage.removeItem(receiptKey);
    } catch { /* The server has already saved the signup fact. */ }
  };
  remember();

  const submit = (clientId: string, consent: boolean) => {
    if (sending || stopped || !serverManaged) return;
    const version = sequence;
    sending = true;
    void win.fetch(`${base}/api/analytics/registration`, {
      method: "POST", credentials: "same-origin", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent, client_id: clientId }),
    }).then(response => {
      if (response.ok || response.status === 400) {
        if (version === sequence) { serverManaged = false; pending = 0; remember(); }
      } else throw new Error("attribution unavailable");
    }).catch(() => {
      if (!stopped && retries++ < 10) retry = setTimeout(flush, 2000);
    }).finally(() => { sending = false; });
  };

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
    if (serverManaged) {
      if (consent === "denied") submit("", false);
      else if (consent === "granted" && /^\d{5,15}$/.test(counter) && typeof win.ym === "function" && !sending) {
        try {
          win.ym(Number(counter), "getClientID", id => {
            if (!stopped && /^\d{1,20}$/.test(id)) {
              let allowed = false;
              try { allowed = win.localStorage.getItem(CONSENT_KEY) === "granted"; } catch { /* closed */ }
              submit(allowed ? id : "", allowed);
            }
          });
        } catch { /* Optional analytics must never interrupt registration. */ }
      }
      return; // Managed registrations never also send the browser reachGoal.
    }
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
  const created = (event: Event) => {
    const managed = (event as CustomEvent<unknown>).detail;
    if (typeof managed === "boolean") {
      sequence += 1; serverManaged = managed; remember();
    }
    pending += 1;
    flush();
  };
  doc.addEventListener(CREATED_EVENT, created);
  doc.addEventListener(ANALYTICS_EVENT, flush);
  flush();
  return () => {
    stopped = true;
    clearTimeout(retry);
    doc.removeEventListener(CREATED_EVENT, created);
    doc.removeEventListener(ANALYTICS_EVENT, flush);
  };
}
