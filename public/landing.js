// /m landing: platform hint, theme picker, placeholder links.
(function () {
  var root = document.documentElement;
  var ua = navigator.userAgent || "";
  root.dataset.platform = /android/i.test(ua) ? "android"
    : (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) ? "ios"
    : "desktop";

  var toast = document.querySelector("[data-toast]");
  var toastTimer = 0;
  document.addEventListener("click", function (event) {
    if (!event.target.closest("a[data-placeholder]") || !toast) return;
    event.preventDefault();
    toast.textContent = toast.dataset.text || "";
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("is-on"); }, 2600);
  });

  // Theme picker: same ids, storage key and cookie as src/lib/theme.ts.
  var THEME_COLORS = { pastel: "#f3eee6", mist: "#e9ebf3", dusk: "#3c365c", night: "#110e0c", slate: "#0b0f14" };
  var pick = document.querySelector("[data-theme-pick]");
  var themeBtn = document.querySelector("[data-theme-toggle]");
  var themeMenu = document.querySelector("[data-theme-menu]");
  if (!pick || !themeBtn || !themeMenu) return;

  function syncOptions() {
    themeMenu.querySelectorAll("[data-theme-set]").forEach(function (opt) {
      opt.setAttribute("aria-pressed", opt.dataset.themeSet === root.dataset.theme ? "true" : "false");
    });
  }

  function applyTheme(theme) {
    if (!THEME_COLORS[theme]) return;
    root.dataset.theme = theme;
    try { localStorage.setItem("wiring-theme", theme); } catch (e) { /* Storage may be unavailable. */ }
    document.cookie = "wiring-theme=" + theme + "; path=/; max-age=31536000; SameSite=Lax";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLORS[theme];
    syncOptions();
  }

  function setMenu(open) {
    themeMenu.hidden = !open;
    themeBtn.setAttribute("aria-expanded", open ? "true" : "false");
    var current = open && themeMenu.querySelector('[aria-pressed="true"]');
    if (current) current.focus();
  }

  syncOptions();
  themeBtn.addEventListener("click", function () { setMenu(themeMenu.hidden); });
  themeMenu.addEventListener("click", function (event) {
    var opt = event.target.closest("[data-theme-set]");
    if (!opt) return;
    applyTheme(opt.dataset.themeSet);
    setMenu(false);
    themeBtn.focus();
  });
  document.addEventListener("click", function (event) {
    if (!themeMenu.hidden && !pick.contains(event.target)) setMenu(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || themeMenu.hidden) return;
    setMenu(false);
    themeBtn.focus();
  });
})();
