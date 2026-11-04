(() => {
  const gaId = String(window.WIRING_ANALYTICS_ID || "").trim();
  const ymId = String(window.WIRING_METRIKA_ID || "").trim();
  const hasGa = /^G-[A-Z0-9]+$/i.test(gaId);
  const hasYm = /^\d{5,15}$/.test(ymId);
  const consentKey = "wiring-analytics-consent";
  if (!hasGa && !hasYm) return;
  // The vendor's initialization and click requests also read the browser URL.
  // Never initialize on account links carrying private tokens or addresses.
  if (/[?&](?:reset|verify|token|code|state|email)=/i.test(location.search || "")) return;

  let consentGranted = false;
  let lastPage = "";
  // Reset/verification tokens and other query values never belong in analytics.
  const pagePath = (path) => String(path || location.pathname).split(/[?#]/)[0];

  const loadGa = () => {
    if (window.__wiringAnalyticsLoaded) return;
    window.__wiringAnalyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      wait_for_update: 500,
    });
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", gaId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(script);
  };

  const loadYm = () => {
    if (window.__wiringMetrikaLoaded) return;
    window.__wiringMetrikaLoaded = true;
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = 1 * new Date();
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://mc.yandex.ru/metrika/tag.js";
    document.head.appendChild(script);
    window.ym(Number(ymId), "init", {
      defer: true,
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
      sendTitle: false,
      ecommerce: false,
    });
  };

  const loadAnalytics = () => {
    consentGranted = true;
    if (hasGa) loadGa();
    if (hasYm) loadYm();
    page();
    document.dispatchEvent(new Event("wiring:analytics-change"));
  };

  const page = (path) => {
    if (!consentGranted) return;
    const url = pagePath(path);
    if (url === lastPage) return;
    const referer = lastPage;
    lastPage = url;
    if (hasGa && typeof window.gtag === "function") {
      window.gtag("event", "page_view", { page_path: url });
    }
    if (hasYm && typeof window.ym === "function") {
      window.ym(Number(ymId), "hit", url, { referer, title: "WIRING" });
    }
  };

  const removeBanner = () => {
    const el = document.querySelector(".analytics-consent");
    if (!el) return;
    el.classList.add("closing");
    setTimeout(() => el.remove(), 220);
  };

  const setConsent = (value) => {
    try { localStorage.setItem(consentKey, value); } catch (_) {}
    document.cookie = `wiring-analytics-consent=${value === "granted" ? "granted" : "denied"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    removeBanner();
    if (value === "granted") loadAnalytics();
    else {
      consentGranted = false;
      lastPage = "";
      if (hasYm && window.__wiringMetrikaLoaded) {
        window.ym(Number(ymId), "destruct");
        window.__wiringMetrikaLoaded = false;
      }
      document.dispatchEvent(new Event("wiring:analytics-change"));
    }
  };

  window.WIRING_ANALYTICS = { page, setConsent, removeBanner, requestConsent: () => showBanner(true) };

  // The legacy shell uses both history methods, plus browser back/forward.
  // Observe URL changes here so server pages and the SPA share one integration.
  for (const method of ["pushState", "replaceState"]) {
    const original = window.history[method];
    window.history[method] = function (...args) {
      const result = original.apply(this, args);
      page();
      return result;
    };
  }
  window.addEventListener("popstate", () => page());

  const isAuthPage = () => {
    const p = location.pathname;
    const v = document.documentElement.dataset.view;
    return (
      p.startsWith("/register") ||
      p.startsWith("/login") ||
      p.startsWith("/forgot") ||
      p.startsWith("/reset") ||
      v === "register" ||
      v === "login"
    );
  };

  const showBanner = (afterRegistration = false) => {
    if (document.querySelector(".analytics-consent")) return;
    if (!afterRegistration && isAuthPage()) return; // Don't block registration/login conversion
    const banner = document.createElement("aside");
    banner.className = "analytics-consent";
    banner.setAttribute("role", "dialog");
    const english = document.documentElement?.lang === "en";
    banner.setAttribute("aria-label", english ? "Optional analytics" : "аналитика посещений");
    banner.innerHTML = `
      <div class="analytics-consent-content">
        <p>${english ? "You can allow optional visit analytics, click and scroll maps. Page content is masked in session recordings; input values are not recorded." : "Можно разрешить необязательную аналитику посещений, карты кликов и прокрутки. Содержимое страниц маскируется в записях, значения полей не записываются."} <a href="/privacy" target="_blank" rel="noopener">${english ? "Learn more" : "Подробнее"}</a></p>
      </div>
      <div class="analytics-consent-actions">
        <button type="button" class="ghost slim" data-analytics-deny>${english ? "Not now" : "Не сейчас"}</button>
        <button type="button" class="solid slim" data-analytics-allow>${english ? "Allow" : "Разрешить"}</button>
      </div>
      <button type="button" class="analytics-consent-close" data-analytics-close aria-label="${english ? "Close" : "Закрыть"}">✕</button>`;
    document.body.appendChild(banner);
    banner.querySelector("[data-analytics-allow]").addEventListener("click", () => setConsent("granted"));
    banner.querySelector("[data-analytics-deny]").addEventListener("click", () => setConsent("denied"));
    banner.querySelector("[data-analytics-close]").addEventListener("click", () => setConsent("denied"));
  };

  let stored = "";
  try { stored = localStorage.getItem(consentKey) || ""; } catch (_) {}
  if (stored === "granted" || stored === "denied") {
    document.cookie = `wiring-analytics-consent=${stored}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  if (stored === "granted") loadAnalytics();
  else if (!stored) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => showBanner(), { once: true });
    else showBanner();
  }
  document.dispatchEvent(new Event("wiring:analytics-change"));
})();
