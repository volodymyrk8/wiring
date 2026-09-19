(() => {
  const gaId = String(window.WIRING_ANALYTICS_ID || "").trim();
  const ymId = String(window.WIRING_METRIKA_ID || "").trim();
  const hasGa = /^G-[A-Z0-9]+$/i.test(gaId);
  const hasYm = /^\d{5,15}$/.test(ymId);
  const consentKey = "wiring-analytics-consent";
  if (!hasGa && !hasYm) return;

  const removeBanner = () => document.querySelector(".analytics-consent")?.remove();

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
      clickmap: false,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false,
      ecommerce: false,
    });
  };

  const loadAnalytics = () => {
    if (hasGa) loadGa();
    if (hasYm) loadYm();
  };

  const page = (path) => {
    const url = path || location.pathname;
    if (hasGa && typeof window.gtag === "function") {
      window.gtag("event", "page_view", { page_path: url });
    }
    if (hasYm && typeof window.ym === "function") {
      window.ym(Number(ymId), "hit", url);
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
    removeBanner();
    if (value === "granted") loadAnalytics();
  };

  window.WIRING_ANALYTICS = { page, setConsent, removeBanner };

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

  const showBanner = () => {
    if (document.querySelector(".analytics-consent")) return;
    if (isAuthPage()) return; // Don't block registration/login conversion
    const banner = document.createElement("aside");
    banner.className = "analytics-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "аналитика посещений");
    banner.innerHTML = `
      <div class="analytics-consent-content">
        <p>Можно разрешить необязательную аналитику посещений. Она помогает понять, какие страницы WIRING полезны. <a href="/privacy" target="_blank" rel="noopener">Подробнее</a></p>
      </div>
      <div class="analytics-consent-actions">
        <button type="button" class="ghost slim" data-analytics-deny>Не сейчас</button>
        <button type="button" class="solid slim" data-analytics-allow>Разрешить</button>
      </div>
      <button type="button" class="analytics-consent-close" data-analytics-close aria-label="Закрыть">✕</button>`;
    document.body.appendChild(banner);
    banner.querySelector("[data-analytics-allow]").addEventListener("click", () => setConsent("granted"));
    banner.querySelector("[data-analytics-deny]").addEventListener("click", () => setConsent("denied"));
    banner.querySelector("[data-analytics-close]").addEventListener("click", () => setConsent("denied"));
  };

  let stored = "";
  try { stored = localStorage.getItem(consentKey) || ""; } catch (_) {}
  if (stored === "granted") loadAnalytics();
  else if (!stored) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showBanner, { once: true });
    else showBanner();
  }
})();
