import { createApi } from "./api";
import { createFeatureLoader } from "./features";
import { createInboxController } from "./inbox";

(() => {
  const root = document.getElementById("app");
  const BASE = root.dataset.base || "";
  const api = createApi(BASE);
  const featureLoader = createFeatureLoader(BASE);
  const pinChatHeight = () => {
    const port = window.visualViewport;
    const height = Math.round(port ? port.height : window.innerHeight);
    const top = Math.round(port ? port.offsetTop : 0);
    const keyboard = Boolean(port && window.innerHeight - port.height > 80);
    document.documentElement.style.setProperty("--vvh", `${height}px`);
    document.documentElement.style.setProperty("--vvt", `${top}px`);
    document.documentElement.classList.toggle("keyboard", keyboard);
    if (document.documentElement.dataset.view === "chat") {
      window.scrollTo(0, 0);
      if (keyboard) {
        const box = document.getElementById("thread");
        if (box) box.scrollTop = box.scrollHeight;
      }
    }
  };
  pinChatHeight();
  window.addEventListener("resize", pinChatHeight);
  window.addEventListener("scroll", () => {
    if (document.documentElement.dataset.view === "chat") window.scrollTo(0, 0);
  }, { passive: true });
  window.visualViewport?.addEventListener("resize", pinChatHeight);
  window.visualViewport?.addEventListener("scroll", pinChatHeight);
  const savedFilters = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("wiring-filters") || "null");
    } catch {
      return null;
    }
  })();
  const state = {
    user: null,
    catalog: null,
    view: "home",
    cards: [],
    index: 0,
    photoIndex: 0,
    matches: [],
    likes: [],
    person: null,
    personFrom: "deck",
    filters: { ...(savedFilters || { neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "" }), real_only: false },
    filtersOpen: false,
    likesFilters: { neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "" },
    resetToken: "",
    verifyEmail: "",
    recycled: false,
    unseen: 0,
    passed: 0,
    liked: 0,
    likesIn: 0,
    unread: 0,
    busy: false,
    pendingFiles: [],
    guestNudge: false,
    guestNudgeHidden: false,
    notifySkip: localStorage.getItem("wiring-notify-skip") === "1",
    pendingPath: "",
    pendingRef: sessionStorage.getItem("wiring-ref") || "",
    profileDraft: null,
    profileEdit: null,
    chatId: null,
  };
  const urlSyncState = { lastUrl: "" };
  let profileScrollY = 0;

  let routing = null;
  const ensureRouting = () => {
    if (routing) return Promise.resolve(routing);
    return import(`${BASE}/public/dist/router.js?v=2`).then((mod) => {
      routing = mod;
      return mod;
    });
  };

  const pathOf = () => routing.normalizePath(location.pathname || "/", BASE);

  const hrefFor = (view, extra = {}) => routing.hrefFor(BASE, view, extra);

  const rememberRef = (code) => {
    const clean = String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
    if (!clean) return "";
    state.pendingRef = clean;
    sessionStorage.setItem("wiring-ref", clean);
    return clean;
  };

  const peekRef = () => {
    const q = new URLSearchParams(location.search).get("ref");
    if (q) return rememberRef(q);
    return state.pendingRef || sessionStorage.getItem("wiring-ref") || "";
  };

  const currentHref = () =>
    hrefFor(state.view, {
      id: state.view === "chat" ? state.chatId : state.view === "person" ? state.person?.id : undefined,
    });

  const syncUrl = () => {
    routing.syncViewToUrl(urlSyncState, BASE, state.view, {
      id:
        state.view === "chat"
          ? state.chatId
          : state.view === "person"
            ? state.person?.id
            : undefined,
    });
  };

  const escapeHtml = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const escapeAttr = escapeHtml;

  const svgIcon = (inner, { fill = false, size = 22, strokeWidth = 1.6 } = {}) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="${fill ? "currentColor" : "none"}" stroke="${fill ? "none" : "currentColor"}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

  const ICONS = {
    pass: svgIcon(`<path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"/>`),
    undo: svgIcon(`<path d="M8 9h9a4 4 0 0 1 0 8h-4"/><path d="M11.5 5.5L7 9l4.5 3.5"/>`, { size: 20 }),
    like: svgIcon(
      `<path d="M12 20.2s-7.1-4.3-9.5-8.6C.7 8.4 1.3 4.7 4.1 3.2c2.2-1.2 4.7-.5 6.3 1.5L12 6.5l1.6-1.8c1.6-2 4.1-2.7 6.3-1.5 2.8 1.5 3.4 5.2 1.6 8.4-2.4 4.3-9.5 8.6-9.5 8.6z"/>`,
      { fill: true }
    ),
    snooze: svgIcon(`<path d="M14.2 4.4A7.2 7.2 0 1 0 19.6 14 5.6 5.6 0 0 1 14.2 4.4z"/>`, { size: 20 }),
    gem: svgIcon(
      `<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>`,
      { size: 11, strokeWidth: 2.2 }
    ),
    home: svgIcon(
      `<path d="M4.5 11.5L12 5l7.5 6.5V19.5a1.5 1.5 0 0 1-1.5 1.5H14.5a1 1 0 0 1-1-1V15.5a1.5 1.5 0 0 0-3 0V20a1 1 0 0 1-1 1H6a1.5 1.5 0 0 1-1.5-1.5z"/>`,
      { size: 21, strokeWidth: 1.5 }
    ),
    feed: svgIcon(
      `<rect x="4.45" y="4.2" width="9.5" height="16.5" rx="2.2" transform="rotate(-10 9.2 12.45)" opacity="0.45"/><rect x="10.05" y="4.2" width="9.5" height="16.5" rx="2.2" transform="rotate(10 14.8 12.45)" opacity="0.45"/><rect x="6.75" y="3.5" width="10.5" height="17.5" rx="2.4" fill="var(--bg-2, #18181b)"/><circle cx="12" cy="8.9" r="2"/><path d="M9 15.7c.6-1.4 1.7-1.9 3-1.9s2.4.5 3 1.9"/><path d="M2.8 12.25H1.2m1.2-1.2L1.2 12.25l1.2 1.2"/><path d="M21.2 12.25H22.8m-1.2-1.2l1.2 1.2-1.2 1.2"/>`,
      { size: 21, strokeWidth: 1.5 }
    ),
    heart: svgIcon(
      `<path d="M12 21.2S3 15.6 3 9.4A5.4 5.4 0 0 1 12 5.5a5.4 5.4 0 0 1 9 3.9c0 6.2-9 11.8-9 11.8z"/>`,
      { size: 21, strokeWidth: 1.5 }
    ),
    thumb: svgIcon(
      `<path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3zm2 11h8.3a2 2 0 0 0 2-1.6l1.4-7a2 2 0 0 0-2-2.4H14V5a3 3 0 0 0-3-3l-4 8v11z"/>`,
      { size: 21, strokeWidth: 1.5 }
    ),
    chat: svgIcon(
      `<path d="M21 12c0 4.7-4 8.5-9 8.5-1.6 0-3.1-.4-4.4-1.1L3.2 21.2l1.6-3.9C4 15.8 3.2 14 3.2 12c0-4.7 4-8.5 9-8.5s8.8 3.8 8.8 8.5z"/><circle cx="8" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1.2" fill="currentColor" stroke="none"/>`,
      { size: 21, strokeWidth: 1.5 }
    ),
    user: svgIcon(
      `<circle cx="12" cy="7.8" r="3.4"/><path d="M5.5 20.2c1.3-3.6 3.6-5 6.5-5s5.2 1.4 6.5 5"/>`,
      { size: 20, strokeWidth: 1.8 }
    ),
    tag: svgIcon(`<path d="M4.5 12.8V5.5H12l7.2 7.2-6.5 6.5z"/><circle cx="8.2" cy="9.2" r="1" fill="currentColor" stroke="none"/>`, { size: 20 }),
    eye: svgIcon(`<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>`, { size: 18 }),
    eyeOff: svgIcon(`<path d="M3 4l17 16M10.5 10.7a2.6 2.6 0 0 0 3.7 3.6M9.4 5.5A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-4.2 4.6M6.2 6.7C3.8 8.3 2 12 2 12a17 17 0 0 0 5.4 5.2"/>`, { size: 18 }),
    book: svgIcon(`<path d="M5 5.5h6.2A3.3 3.3 0 0 1 14.5 8.8V19H8.2A3.2 3.2 0 0 0 5 22.2z"/><path d="M19 5.5h-6.2A3.3 3.3 0 0 0 9.5 8.8V19H16a3.2 3.2 0 0 1 3 3.2z"/>`, { size: 20 }),
    plus: svgIcon(`<path d="M12 6v12M6 12h12"/>`, { size: 20 }),
    theme: svgIcon(`<path d="M14.2 4.4A7.2 7.2 0 1 0 19.6 14 5.6 5.6 0 0 1 14.2 4.4z"/>`, { size: 20, strokeWidth: 1.8 }),
    arrow: svgIcon(`<path d="M5 12h14M13 6l6 6-6 6"/>`, { size: 18 }),
    filter: svgIcon(`<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>`, { size: 14, strokeWidth: 1.8 }),
  };

  const THEME_ICONS = {
    mist: svgIcon(
      `<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77"/>`,
      { size: 20, strokeWidth: 1.8 }
    ),
    pastel: svgIcon(
      `<path d="M12 3v3M6.3 6.3l2.1 2.1M17.7 6.3l-2.1 2.1M2 16h20M6 16a6 6 0 0 1 12 0M4 20h16"/>`,
      { size: 20, strokeWidth: 1.8 }
    ),
    dusk: svgIcon(
      `<path d="M2 16h20M7 16a5 5 0 0 1 10 0M5 20h14M12 7v4M10 9l2 2 2-2M18.5 4l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>`,
      { size: 20, strokeWidth: 1.8 }
    ),
    night: svgIcon(
      `<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>`,
      { size: 20, strokeWidth: 1.8 }
    ),
    slate: svgIcon(
      `<path d="M18.5 13.5A8.5 8.5 0 1 1 9.5 4.5a6.8 6.8 0 0 0 9 9z"/><path d="M19 3l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM15 9l.3.7.7.3-.7.3-.3.7-.3-.7-.7-.3.7-.3z"/>`,
      { size: 20, strokeWidth: 1.8 }
    ),
  };
  const themeIcon = (theme) => THEME_ICONS[theme] || THEME_ICONS.mist;
  const CHECK_ICON = `<span class="check" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>`;

  const THEME_KEY = "wiring-theme";
  const THEMES = {
    mist: { label: "день", chrome: "#e9ebf3" },
    pastel: { label: "пастель", chrome: "#f3eee6" },
    dusk: { label: "сумерки", chrome: "#1a1c24" },
    night: { label: "ночь", chrome: "#110e0c" },
    slate: { label: "полночь", chrome: "#0b0f14" },
  };
  const themeNow = () => (THEMES[document.documentElement.dataset.theme] ? document.documentElement.dataset.theme : "mist");
  const applyTheme = (theme) => {
    const next = THEMES[theme] ? theme : "mist";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEMES[next].chrome);

    const openBtn = document.getElementById("theme-open");
    if (openBtn) {
      openBtn.innerHTML = themeIcon(next);
      const lbl = `Оформление: ${THEMES[next].label}`;
      openBtn.setAttribute("aria-label", lbl);
      openBtn.setAttribute("title", lbl);
    }
    document.querySelectorAll(".theme-opt").forEach((opt) => {
      const isSel = opt.dataset.themeSet === next;
      opt.classList.toggle("active", isSel);
      opt.classList.toggle("selectedOption", isSel);
      const chk = opt.querySelector(".check");
      if (isSel && !chk) {
        opt.insertAdjacentHTML("beforeend", CHECK_ICON);
      } else if (!isSel && chk) {
        chk.remove();
      }
    });
  };
  const themeSwatches = () =>
    `<div class="theme-swatches" role="group" aria-label="цвет">
      ${Object.entries(THEMES)
        .map(
          ([id, t]) =>
            `<button type="button" class="swatch" data-theme-set="${id}" aria-label="${t.label}" title="${t.label}"></button>`
        )
        .join("")}
    </div>`;
  const themePicker = () => {
    const cur = themeNow();
    return `<div class="theme-pop">
      <button type="button" class="icon-btn" id="theme-open" aria-expanded="false" aria-controls="theme-menu" aria-haspopup="true" aria-label="Оформление: ${escapeAttr(THEMES[cur]?.label || cur)}" title="Оформление: ${escapeAttr(THEMES[cur]?.label || cur)}">${themeIcon(cur)}</button>
      <div class="theme-menu" id="theme-menu" hidden>
        ${Object.entries(THEMES)
          .map(
            ([id, t]) =>
              `<button type="button" class="theme-opt${id === cur ? " selectedOption active" : ""}" data-theme-set="${id}"><span class="theme-opt-icon">${THEME_ICONS[id]}</span><span class="theme-opt-label">${t.label}</span>${id === cur ? CHECK_ICON : ""}</button>`
          )
          .join("")}
      </div>
    </div>`;
  };
  let themeUiBound = false;
  const bindThemePicker = () => {
    const wrap = root.querySelector(".theme-pop");
    if (!wrap) return;
    const btn = wrap.querySelector("#theme-open");
    const menu = wrap.querySelector("#theme-menu");
    if (!btn || !menu) return;
    const setOpen = (open) => {
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    if (!themeUiBound) {
      themeUiBound = true;
      document.addEventListener("click", (e) => {
        const openMenu = document.getElementById("theme-menu");
        const openBtn = document.getElementById("theme-open");
        if (openMenu && !openMenu.hidden) {
          openMenu.hidden = true;
          if (openBtn) openBtn.setAttribute("aria-expanded", "false");
        }
        if (!e.target?.closest?.(".beta-wrap")) {
          document.querySelectorAll(".beta-wrap.is-open").forEach((w) => w.classList.remove("is-open"));
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const openMenu = document.getElementById("theme-menu");
        const openBtn = document.getElementById("theme-open");
        if (openMenu && !openMenu.hidden) {
          openMenu.hidden = true;
          if (openBtn) {
            openBtn.setAttribute("aria-expanded", "false");
            openBtn.focus();
          }
        }
        document.querySelectorAll(".beta-wrap.is-open").forEach((w) => w.classList.remove("is-open"));
      });
    }
  };
  const bindThemeControls = () => {
    root.querySelectorAll("[data-theme-set]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(btn.dataset.themeSet);
        const menu = root.querySelector("#theme-menu");
        const trigger = root.querySelector("#theme-open");
        if (menu && !menu.hidden) {
          menu.hidden = true;
          if (trigger) trigger.setAttribute("aria-expanded", "false");
        }
      });
    });
    bindThemePicker();
    bindProfileMenu();
  };

  let profileUiBound = false;
  const bindProfileMenu = () => {
    const wrap = root.querySelector(".profile-pop");
    if (!wrap) return;
    const btn = wrap.querySelector("#profile-open");
    const menu = wrap.querySelector("#profile-menu");
    if (!btn || !menu) return;
    const setOpen = (open) => {
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    menu.addEventListener("click", (e) => e.stopPropagation());

    const logoutBtn = menu.querySelector("#profile-menu-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setOpen(false);
        void logout();
      });
    }

    if (!profileUiBound) {
      profileUiBound = true;
      document.addEventListener("click", () => {
        const m = document.getElementById("profile-menu");
        const b = document.getElementById("profile-open");
        if (m && !m.hidden) {
          m.hidden = true;
          if (b) b.setAttribute("aria-expanded", "false");
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const m = document.getElementById("profile-menu");
        const b = document.getElementById("profile-open");
        if (m && !m.hidden) {
          m.hidden = true;
          if (b) {
            b.setAttribute("aria-expanded", "false");
            b.focus();
          }
        }
      });
    }
  };
  applyTheme(themeNow());

  const persistFilters = () => {
    const { real_only: _ignore, ...rest } = state.filters;
    sessionStorage.setItem("wiring-filters", JSON.stringify(rest));
  };
  state.filters.real_only = false;

  const photoUrl = (photo, name) => {
    if (Array.isArray(photo)) photo = photo[0];
    if (photo && typeof photo === "object") photo = photo.url;
    if (photo) {
      if (photo.startsWith("data:") || photo.startsWith("blob:") || photo.startsWith("http")) return photo;
      if (photo.startsWith("/")) return `${BASE}${photo}`;
      return `${BASE}/public/${photo}`;
    }
    const hue = [...(name || "?")].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 520'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='hsl(${hue} 40% 28%)'/><stop offset='1' stop-color='hsl(${(hue + 40) % 360} 50% 18%)'/></linearGradient></defs><rect width='400' height='520' fill='url(#g)'/><text x='200' y='280' text-anchor='middle' fill='#d8ff3c' font-size='84' font-family='Georgia'>${(name || "?").slice(0, 1)}</text></svg>`
    );
    return `data:image/svg+xml,${svg}`;
  };

  const avatarUrl = (photo, name) => {
    const url = photoUrl(photo, name);
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
    return url.includes("?") ? `${url}&s=sm` : `${url}?s=sm`;
  };

  const labelOf = (kind, id) => {
    const list = state.catalog?.[kind] || [];
    return (list.find((x) => x.id === id) || {}).label || id;
  };

  const itemOf = (kind, id) => (state.catalog?.[kind] || []).find((x) => x.id === id) || { id, label: id };

  const tipText = (kind, id) => {
    const item = itemOf(kind, id);
    return item.tip || item.expand || item.hint || "";
  };

  const chipMark = (kind, id, extra = "") => {
    const item = itemOf(kind, id);
    const tip = escapeAttr(tipText(kind, id));
    return `<span class="chip has-tip ${kind === "vibe" ? "vibe" : ""} ${extra}" data-tip="${tip}" tabindex="0">${escapeHtml(item.label || id)}<i class="tip-bubble">${escapeHtml(tipText(kind, id))}</i></span>`;
  };

  const TEST_HREF = "https://neuro-raznoobrazie.web.app/";
  const TEST_LINK = `<a href="${TEST_HREF}" target="_blank" rel="noopener">neuro-raznoobrazie.web.app</a>`;
  const GLOSS_LINK = `не знаешь, что выбрать? пройди тест: ${TEST_LINK}`;
  const PICK_NEURO = "wiring-pick-neuro";

  const seedNeuro = () => {
    const q = new URLSearchParams(location.search).get("neuro") || "";
    const stored = sessionStorage.getItem(PICK_NEURO) || "";
    sessionStorage.removeItem(PICK_NEURO);
    const id = q || stored;
    return (state.catalog?.neuro || []).some((item) => item.id === id) ? [id] : [];
  };

  const uiButton = ({
    variant = "solid",
    slim = false,
    fullWidth = false,
    type = "button",
    href = "",
    nav = "",
    disabled = false,
    className = "",
    id = "",
    children = "",
  } = {}) => {
    const cls = ["btn", variant, slim ? "slim" : "", fullWidth ? "fullWidth" : "", className].filter(Boolean).join(" ");
    const idAttr = id ? ` id="${escapeAttr(id)}"` : "";
    if (href) {
      const navAttr = nav ? ` data-nav="${escapeAttr(nav)}"` : "";
      return `<a class="${cls}" href="${escapeAttr(href)}"${navAttr}${idAttr}><span>${children}</span></a>`;
    }
    return `<button class="${cls}" type="${escapeAttr(type)}"${idAttr}${disabled ? " disabled" : ""}><span>${children}</span></button>`;
  };

  const captionHtml = (kind, id) => {
    const item = itemOf(kind, id);
    const expand = item.expand || item.label || id;
    const blurb = item.blurb || item.hint || "";
    return `<b>${escapeHtml(expand)}</b>${blurb ? `<br>${escapeHtml(blurb)}` : ""}`;
  };

  const setCaption = (kind, id) => {
    root.querySelectorAll(`[data-caption="${kind}"]`).forEach((el) => {
      if (!id) {
        el.hidden = true;
        el.innerHTML = "";
        return;
      }
      el.hidden = false;
      el.innerHTML = captionHtml(kind, id);
    });
  };

  const pickerBlock = (kind, selected, { id = "", lead = "", gloss = false, test = false, bindAs = "" } = {}) => `
    <div class="chip-picker">
      <p class="hint">${lead}${test ? ` Не знаешь, что выбрать? Пройди <a href="${TEST_HREF}" target="_blank" rel="noopener noreferrer">тест нейроотличий ↗</a>.` : ""}${gloss ? ` ${GLOSS_LINK}` : ""}</p>
      <div class="chips"${id ? ` id="${id}"` : ""}>${chips(kind, selected, bindAs || kind)}</div>
      ${kind === "intents" || bindAs ? "" : `<p class="chip-caption" data-caption="${kind}" hidden></p>`}
    </div>`;

  const chips = (kind, selected, bindKind = kind) =>
    (state.catalog?.[kind] || [])
      .map((item) => {
        const on = selected.includes(item.id) ? "on" : "";
        const tipText = item.tip || item.hint || "";
        const tippy = (kind === "neuro" || kind === "vibe") && tipText && !String(bindKind).startsWith("hide");
        const tip = tippy ? escapeAttr(tipText) : "";
        const mark = tippy ? `<span class="tip-mark" data-tip-open title="что это">?</span>` : "";
        return `<button type="button" class="chip ${tippy ? "has-tip" : ""} ${kind === "vibe" ? "vibe" : ""} ${on}" data-kind="${bindKind}" data-id="${item.id}"${
          tip ? ` data-tip="${tip}"` : ""
        }>${item.label}${mark}${tippy ? `<i class="tip-bubble">${escapeHtml(tipText)}</i>` : ""}</button>`;
      })
      .join("");

  const bindTips = () => {
    const placeTip = (el) => {
      el.classList.remove("tip-start", "tip-end");
      const chipRect = el.getBoundingClientRect();
      const pad = 10;
      const maxW = Math.min(280, window.innerWidth * 0.72);
      const center = chipRect.left + chipRect.width / 2;
      if (center - maxW / 2 < pad) el.classList.add("tip-start");
      else if (center + maxW / 2 > window.innerWidth - pad) el.classList.add("tip-end");
    };
    root.querySelectorAll(".has-tip").forEach((el) => {
      const kind = el.dataset.kind;
      const id = el.dataset.id;
      const show = () => {
        root.querySelectorAll(".has-tip.show").forEach((other) => {
          if (other !== el) other.classList.remove("show");
        });
        placeTip(el);
        el.classList.add("show");
        if (kind && id) setCaption(kind, id);
      };
      const hide = () => el.classList.remove("show");
      el.addEventListener("pointerenter", () => {
        if (el.matches(":hover")) show();
      });
      el.addEventListener("pointerleave", hide);
      el.addEventListener("focus", show);
      el.addEventListener("blur", hide);
      if (el.tagName !== "BUTTON") {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (el.classList.contains("show")) hide();
          else show();
        });
      }
      el.querySelectorAll("[data-tip-open]").forEach((mark) => {
        mark.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (el.classList.contains("show")) hide();
          else show();
          if (kind && id) setCaption(kind, id);
        });
      });
    });
  };

  const bindChips = (selectedMap) => {
    root.querySelectorAll(".chip[data-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (e.target.closest("[data-tip-open]")) return;
        const kind = btn.dataset.kind;
        const id = btn.dataset.id;
        const arr = selectedMap[kind];
        const i = arr.indexOf(id);
        if (i >= 0) {
          arr.splice(i, 1);
          btn.classList.remove("on");
          btn.classList.remove("show");
          setCaption(kind, arr.length ? arr[arr.length - 1] : "");
        } else {
          arr.push(id);
          btn.classList.add("on");
          setCaption(kind, id);
        }
      });
    });
  };

  const toast = (text, action) => {
    const el = document.createElement("div");
    el.className = action ? "toast tap" : "toast";
    el.textContent = text;
    if (action) el.addEventListener("click", () => action());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), action ? 10000 : 2200);
  };

  const canNotify = () => typeof Notification !== "undefined";
  const notifyAllowed = () => canNotify() && Notification.permission === "granted";
  const canAskNotify = () =>
    canNotify() && Notification.permission === "default" && !state.notifySkip && state.user && !state.user.guest;

  const pingBrowser = (text) => {
    if (!notifyAllowed() || !text) return;
    try {
      const note = new Notification("WIRING", {
        body: text,
        icon: "/public/favicon.svg",
        tag: text.slice(0, 48),
        requireInteraction: true,
      });
      note.onclick = () => {
        window.focus();
        note.close();
      };
      setTimeout(() => note.close(), 20000);
    } catch {
      /* Safari / denied */
    }
  };

  const askNotify = async () => {
    if (!canNotify()) {
      toast("этот браузер не умеет уведомления");
      return;
    }
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
    state.notifySkip = Notification.permission !== "granted";
    if (state.notifySkip) localStorage.setItem("wiring-notify-skip", "1");
    else localStorage.removeItem("wiring-notify-skip");
    render();
  };

  const compressImage = async (file) => {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file;
    }
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob || file;
  };

  const uploadPhoto = async (file, rightsConsent = false) => {
    const blob = await compressImage(file);
    const fd = new FormData();
    fd.append("file", blob, "photo.jpg");
    const rights = root.querySelector("#photo-rights-consent");
    if (rights?.checked || rightsConsent) fd.append("photo_rights_consent", "1");
    return api("/api/photos", { method: "POST", body: fd });
  };

  const loadLikes = async (filters = state.likesFilters) => {
    const q = new URLSearchParams();
    const f = filters || {};
    state.likesFilters = { ...state.likesFilters, ...f };
    if ((f.neuro || []).length) q.set("neuro", f.neuro.join(","));
    if ((f.vibe || []).length) q.set("vibe", f.vibe.join(","));
    if ((f.intents || []).length) q.set("intent", f.intents.join(","));
    if (f.min_age && f.min_age !== 18) q.set("min_age", String(f.min_age));
    if (f.max_age && f.max_age !== 99) q.set("max_age", String(f.max_age));
    if (f.city) q.set("city", f.city);
    const data = await api(`/api/likes?${q.toString()}`);
    state.likes = data.likes || [];
    if (state.user && typeof data.plus === "boolean") state.user.plus = data.plus;
    return data;
  };

  const refreshMe = async () => {
    const me = await api("/api/me");
    state.user = me.user;
    state.likesIn = me.user?.likes_in || 0;
    state.unread = me.user?.unread || 0;
  };

  const pip = (n) => (n ? `<span class="pip">${n > 9 ? "9+" : n}</span>` : "");
  const QUIET_VIEWS = new Set(["login", "register", "forgot", "reset", "verify", "onboard", "invite", "chat", "delete-account"]);
  const showsTabbar = () => !QUIET_VIEWS.has(state.view);
  const HOME_FACE_SRC = Array.from({ length: 12 }, (_, i) => `people/${String(i + 1).padStart(2, "0")}.jpg`);
  const pickHomeFaces = () => {
    const pool = HOME_FACE_SRC.slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  };
  const HOME_FACES = pickHomeFaces();

  const countSlot = (kind) => {
    const n = kind === "likes" ? state.user?.likes_in || state.likesIn || 0 : state.user?.unread || state.unread || 0;
    return `<span class="pip-slot" data-count="${kind}">${pip(n)}</span>`;
  };

  const navLinks = (kind) => {
    const from = state.personFrom;
    const isTab = kind === "tab";
    const items = [
      ["home", "Главная", ICONS.home, state.view === "home"],
      ["deck", "Лента", ICONS.feed, state.view === "deck" || (state.view === "person" && from === "deck")],
      ["likes", "Лайки", friendlyLike().icon === ICONS.thumb ? ICONS.thumb : ICONS.heart, state.view === "likes" || (state.view === "person" && from === "likes")],
      [
        "matches",
        "Чаты",
        ICONS.chat,
        state.view === "matches" || state.view === "chat" || (state.view === "person" && (from === "matches" || from === "chat")),
      ],
    ];
    if (isTab) {
      const isMe = state.view === "profile" || state.view === "plus" || (state.view === "person" && from === "profile");
      const dest = state.user ? "profile" : "login";
      const label = state.user ? "Профиль" : "Войти";
      const hasPhoto = Boolean(state.user && state.user.photo);
      const icon = hasPhoto
        ? `<span class="nav-avatar"><img src="${avatarUrl(state.user.photo, state.user.name)}" alt=""></span>`
        : ICONS.user;
      items.push([dest, label, icon, isMe]);
    }
    return items
      .map(([view, label, icon, on]) => {
        const badge = view === "likes" ? countSlot("likes") : view === "matches" ? countSlot("unread") : "";
        return `<a href="${hrefFor(view)}" data-nav="${view}" class="${kind}-link${on ? " on" : ""}"${on ? ' aria-current="page"' : ""}>
          <span class="nav-ico" aria-hidden="true">${icon}${badge}</span>
          <span class="nav-lbl">${label}</span>
        </a>`;
      })
      .join("");
  };

  const profileSlot = () => {
    if (!state.user || state.user.guest) {
      const dest = state.user ? "profile" : "login";
      return `<a class="icon-btn profile-slot" href="${hrefFor(dest)}" data-nav="${dest}" aria-label="${state.user ? "профиль" : "войти"}">${ICONS.user}</a>`;
    }
    const on = state.view === "profile" || state.view === "plus";
    const plus = Boolean(state.user.plus);
    const name = escapeHtml(state.user.name || "Профиль");
    return `<div class="profile-pop">
      <button type="button" class="avatar-slot avatar-btn" id="profile-open" aria-expanded="false" aria-controls="profile-menu" aria-haspopup="true" aria-label="${plus ? "Меню профиля · WIRING+" : "Меню профиля"}" title="${plus ? "Меню профиля · WIRING+" : "Меню профиля"}">
        <span class="avatar-link${on ? " on" : ""}${plus ? " plus" : ""}">
          <img src="${avatarUrl(state.user.photo, state.user.name)}" alt="">
        </span>
        ${plus ? `<span class="plus-mark" title="WIRING+" aria-hidden="true">${ICONS.gem}</span>` : ""}
      </button>
      <div class="profile-menu" id="profile-menu" hidden>
        <div class="profile-menu-header">
          <span class="profile-menu-name">${name}</span>
        </div>
        <div class="profile-menu-divider"></div>
        <a class="profile-menu-item profile-menu-plus" href="${hrefFor("plus")}" data-nav="plus">
          <span class="badge-gem-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 3h12l4 6-10 13L2 9Z"/>
              <path d="M11 3 8 9l4 13 4-13-3-6"/>
              <path d="M2 9h20"/>
            </svg>
          </span>
          <span class="profile-menu-text">WIRING+</span>
          ${plus ? `<span class="profile-menu-status">активен</span>` : `<span class="profile-menu-status inactive">подключить</span>`}
        </a>
        <a class="profile-menu-item" href="${hrefFor("profile")}" data-nav="profile">
          <span class="profile-menu-icon">${ICONS.user}</span>
          <span class="profile-menu-text">Профиль</span>
        </a>
        <a class="profile-menu-item" href="${hrefFor("consents")}" data-nav="consents">
          <span class="profile-menu-icon">${svgIcon(`<path d="M7 3.5h10v17H7z"/><path d="m9.5 12 1.7 1.7 3.5-3.8"/>`, { size: 18 })}</span>
          <span class="profile-menu-text">Согласия</span>
        </a>
        <a class="profile-menu-item" href="/support">
          <span class="profile-menu-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </span>
          <span class="profile-menu-text">Поддержка</span>
        </a>
        <div class="profile-menu-divider"></div>
        <button type="button" class="profile-menu-item profile-menu-logout" id="profile-menu-logout">
          <span class="profile-menu-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </span>
          <span class="profile-menu-text">Выйти</span>
        </button>
      </div>
    </div>`;
  };

  const appHead = (opts = {}) => {
    const isAuth = QUIET_VIEWS.has(state.view) && state.view !== "chat";
    const logoPos = opts.logoPosition !== undefined ? opts.logoPosition : (isAuth ? "center" : "left");
    const showActions = opts.showActions !== undefined ? opts.showActions : !isAuth;
    const showBack = opts.showBack !== undefined ? opts.showBack : isAuth;
    const backHref = opts.backHref || hrefFor("home");
    const backNav = opts.backNav !== undefined ? opts.backNav : "back";
    const backLabel = opts.backLabel || "Назад";
    const centerClass = logoPos === "center" ? " center" : "";
    const sectionTitle = opts.sectionTitle || "";
    const brandBlock = `
      <div class="brand-group">
        <a class="brand" href="${hrefFor("home")}" data-nav="home"><span class="brand-name">WIR<span>ING</span></span>${sectionTitle ? "" : `<span class="beta-wrap" tabindex="0" role="button" aria-haspopup="dialog" aria-label="О бета-версии"><span class="beta-label">beta</span><span class="beta-popover" role="tooltip">Сайт в стадии беты: всё работает, но возможны небольшие ошибки. Мы постоянно улучшаем сервис.</span></span>`}</a>
        ${sectionTitle ? `
          <span class="brand-divider" aria-hidden="true">/</span>
          <span class="brand-section" aria-current="page">${escapeHtml(sectionTitle)}</span>
        ` : ""}
      </div>`;
    return `
    <header class="app-head${centerClass}" data-logo-position="${logoPos}">
      ${showBack ? `
      <div class="app-head-start">
        <a class="icon-btn app-head-back" href="${escapeAttr(backHref)}" data-nav="${escapeAttr(backNav)}" aria-label="Вернуться назад" title="Назад">
          <svg class="app-head-back-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </a>
      </div>` : ""}
      ${brandBlock}
      ${showActions ? `
      <div class="app-head-end">
        ${themePicker()}
        ${isAuth ? "" : profileSlot()}
      </div>` : ""}
    </header>`;
  };

  const tabbar = () =>
    showsTabbar()
      ? `<nav class="tabbar" aria-label="разделы">${navLinks("tab")}</nav>`
      : "";

  const legalFooterBar = (signed = false) => `
    <footer class="legal-footer-bar" aria-label="юридическая информация">
      <span class="badge-18">18+</span>
      <a href="/rules">правила</a>
      <a href="/privacy">конфиденциальность</a>
      <a href="/support">поддержка</a>
      ${signed ? `<a href="/glossary">глоссарий</a>` : ""}
    </footer>`;

  const authLayout = (body) => `
      ${appHead({ logoPosition: "center", showActions: true, showBack: true })}
      <div class="auth-shell">
        <section class="panel auth-panel">${body}</section>
      </div>`;

  const ownTraitMarks = () => {
    const neuro = state.user?.neuro || [];
    const vibe = state.user?.vibe || [];
    if (!neuro.length && !vibe.length) return `<p class="hint">Пока ничего не отмечено — это нормально.</p>`;
    return `<div class="chips">${[
      ...neuro.map((id) => `<span class="chip">${escapeHtml(labelOf("neuro", id))}</span>`),
      ...vibe.map((id) => `<span class="chip vibe">${escapeHtml(labelOf("vibe", id))}</span>`),
    ].join("")}</div>`;
  };

  const cityGateView = () => ({
    html: `
      ${appHead()}
      <section class="panel">
        <h2>Уточни город</h2>
        <p class="lede">Сначала страна, потом город из списка.</p>
        <form class="form" id="city-gate">
          ${placeFields(state.user?.city || "", { id: "gate-city" })}
          <div class="err" id="err"></div>
          <div class="actions">
            <button class="solid" type="submit">сохранить и продолжить</button>
          </div>
        </form>
      </section>
      ${tabbar()}`,
    bind() {
      bindPlaceCountry();
      root.querySelector("#city-gate").addEventListener("submit", async (e) => {
        e.preventDefault();
        const city = new FormData(e.target).get("city");
        try {
          const data = await api("/api/me/city", { method: "POST", body: JSON.stringify({ city }) });
          state.user = data.user;
          toast("город сохранён");
          state.view = "deck";
          await loadFeed();
          render();
        } catch (err) {
          root.querySelector("#err").textContent = err.message;
        }
      });
    },
  });

    const homeView = () => {
    const signed = state.user && !state.user.guest;
    const cta = signed
      ? `<a class="home-cta" href="${hrefFor("deck")}" data-nav="deck">Перейти в ленту ${ICONS.arrow}</a>`
      : `<a class="home-cta" href="${hrefFor("register")}" data-nav="register">Создать профиль</a>
         <p class="home-more"><a href="${hrefFor("login")}" data-nav="login">Войти</a></p>`;
    const traitsBody = signed
      ? `${ownTraitMarks()}<a class="ghost slim" href="${hrefFor("profile")}" data-nav="profile">Изменить в профиле</a>`
      : `<p class="hint">По желанию. Можно указать диагнозы позже, в анкете.</p>
         <a class="ghost slim" href="${hrefFor("register")}" data-nav="register">Добавить при создании профиля</a>`;
    return `
    ${appHead()}
    <section class="home-v2">
      <h1 class="home-v2-title">Отличные люди рядом</h1>
      <p class="home-v2-sub">Знакомства для нейроотличных</p>
      <div class="home-faces" aria-hidden="true">${HOME_FACES.map(
        (src) =>
          `<div class="home-face"><img src="${BASE}/public/${src}" alt="" width="120" height="150" onerror="this.remove()"></div>`
      ).join("")}</div>
      ${cta}
      <button type="button" class="home-row" id="traits-open" aria-expanded="false" aria-controls="home-traits">
        <span class="nav-ico" aria-hidden="true">${ICONS.tag}</span>
        <span class="grow"><strong>Мои особенности</strong><small>по желанию</small></span>
        <span class="nav-ico" aria-hidden="true">${ICONS.plus}</span>
      </button>
      <div class="home-panel" id="home-traits" hidden>${traitsBody}</div>
      <button type="button" class="home-row" id="about-open" aria-expanded="false" aria-controls="home-about">
        <span class="nav-ico" aria-hidden="true">${ICONS.book}</span>
        <span class="grow"><strong>Как устроен WIRING</strong></span>
        <span class="nav-ico" aria-hidden="true">${ICONS.arrow}</span>
      </button>
      <div class="home-panel" id="home-about" hidden>
        <p>Профиль — фото, особенности и как тебе писать. Лента — анкеты свайпом. Если симпатия взаимная, открывается чат.</p>
      </div>
      <p class="home-quiet">Можно быть собой.</p>
    </section>
    ${legalFooterBar(signed)}
    ${tabbar()}`;
  };

  const options = (kind, selected) =>
    (state.catalog[kind] || [])
      .map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${item.label}</option>`)
      .join("");

  const formatMultiline = (text) => escapeHtml(String(text || "")).replace(/\n/g, "<br>");

  const friendlyLike = () => {
    const intents = state.user?.intents || (state.user?.intent ? [state.user.intent] : []);
    const soft = intents.length > 0 && intents.every((id) => id === "friends" || id === "chat");
    return {
      icon: soft ? ICONS.thumb : ICONS.like,
      label: soft ? "лайк / ок" : "лайк",
      title: soft ? "лайк — дружба или общение" : "лайк",
    };
  };

  const countryOfCity = (city) => {
    const needle = String(city || "").trim();
    if (!needle) return "";
    for (const block of state.catalog?.places || []) {
      if ((block.cities || []).includes(needle)) return block.country || "";
    }
    return "";
  };

  const citiesForCountry = (country) => {
    const places = state.catalog?.places || [];
    const block = places.find((b) => b.country === country);
    const list = block ? [...(block.cities || [])] : places.flatMap((b) => b.cities || []);
    return list.sort((a, b) => String(a).localeCompare(String(b), "ru"));
  };

  const citySelect = (name, selected, { required = true, allowEmpty = false, emptyLabel = "город или выбери из списка", id = "" } = {}) => {
    const places = state.catalog.places || [];
    const current = selected || "";
    const listId = `${id || name || "city"}-list`;
    const options = places
      .flatMap((block) => block.cities || [])
      .slice()
      .sort((a, b) => String(a).localeCompare(String(b), "ru"))
      .map((c) => `<option value="${escapeAttr(c)}"></option>`)
      .join("");
    return `<span class="city-combo">
      <input name="${name}" ${id ? `id="${id}"` : ""} list="${listId}" value="${escapeAttr(current)}" ${
        required && !allowEmpty ? "required" : ""
      } maxlength="48" autocomplete="address-level2" placeholder="${escapeAttr(emptyLabel)}">
      <datalist id="${listId}">${options}</datalist>
    </span>`;
  };

  const placeFields = (selectedCity, { name = "city", required = true, id = "city", country = "" } = {}) => {
    const places = state.catalog?.places || [];
    const pickedCountry = country || countryOfCity(selectedCity) || places[0]?.country || "";
    const cities = citiesForCountry(pickedCountry);
    const listId = `${id}-list`;
    const countryOpts = places
      .map(
        (b) =>
          `<option value="${escapeAttr(b.country)}" ${b.country === pickedCountry ? "selected" : ""}>${escapeHtml(
            b.country
          )}</option>`
      )
      .join("");
    const cityOpts = cities.map((c) => `<option value="${escapeAttr(c)}"></option>`).join("");
    return `
      <label>страна
        <select id="${id}-country" data-city-country="${id}" autocomplete="country-name">${countryOpts}</select>
      </label>
      <label class="city-field">город
        <span class="city-combo">
          <input name="${name}" id="${id}" list="${listId}" value="${escapeAttr(selectedCity || "")}" ${
            required ? "required" : ""
          } maxlength="48" autocomplete="address-level2" placeholder="выбери из списка" list="${listId}">
          <datalist id="${listId}">${cityOpts}</datalist>
        </span>
      </label>`;
  };

  const bindPlaceCountry = () => {
    root.querySelectorAll("[data-city-country]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const id = sel.dataset.cityCountry;
        const list = root.querySelector(`#${id}-list`);
        if (!list) return;
        const cities = citiesForCountry(sel.value);
        list.innerHTML = cities.map((c) => `<option value="${escapeAttr(c)}"></option>`).join("");
        if (state.profileDraft) state.profileDraft.country = sel.value;
      });
    });
  };

  const clearProfileDraft = () => {
    state.profileDraft = null;
    state.profileEdit = null;
  };

  const logout = async () => {
    try {
      await api("/api/logout", { method: "POST" });
    } catch (_) {}
    state.user = null;
    clearProfileDraft();
    state.view = "home";
    stopInbox();
    render();
  };

  const captureProfileDraft = () => {
    if (state.view !== "profile") return;
    const form = root.querySelector("form#me");
    if (!form || !state.user || state.user.guest) return;
    // Before bind() profileEdit is empty — do not clobber tags with [].
    const edit = state.profileEdit;
    if (!edit) return;
    const fd = new FormData(form);
    state.profileDraft = {
      name: String(fd.get("name") || ""),
      age: String(fd.get("age") || ""),
      country: root.querySelector("#profile-city-country")?.value || "",
      city: String(fd.get("city") || ""),
      gender: String(fd.get("gender") || ""),
      looking_for: String(fd.get("looking_for") || ""),
      height: String(fd.get("height") || ""),
      job: String(fd.get("job") || ""),
      bio: String(fd.get("bio") || ""),
      communication: String(fd.get("communication") || ""),
      neuro: [...(edit.neuro || [])],
      vibe: [...(edit.vibe || [])],
      intents: [...(edit.intents || [])],
      prompts: (edit.prompts || []).map((p) => ({ id: p.id, answer: p.answer })),
      hide_tags: [...(edit.hideNeuro || []), ...(edit.hideVibe || [])],
      seek_min_age: String(fd.get("seek_min_age") || ""),
      seek_max_age: String(fd.get("seek_max_age") || ""),
      seek_place: String(fd.get("seek_place") || ""),
      special_data_consent: Boolean(root.querySelector("#special-data-consent")?.checked),
      photo_rights_consent: Boolean(root.querySelector("#photo-rights-consent")?.checked),
    };
  };

  const passwordField = (name, { autocomplete = "current-password", required = true, value = "" } = {}) =>
    `<label class="password-field">Пароль
      <span class="password-wrap">
        <input name="${name}" type="password" ${required ? "required" : ""} minlength="6" autocomplete="${autocomplete}" value="${escapeAttr(value)}">
        <button type="button" class="password-toggle" aria-label="показать пароль" title="показать пароль">${ICONS.eye}</button>
      </span>
    </label>`;

  const bindPasswordToggles = () => {
    root.querySelectorAll(".password-wrap").forEach((wrap) => {
      const input = wrap.querySelector("input");
      const btn = wrap.querySelector(".password-toggle");
      if (!input || !btn) return;
      btn.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-label", show ? "скрыть пароль" : "показать пароль");
        btn.title = show ? "скрыть пароль" : "показать пароль";
        btn.classList.toggle("on", show);
        btn.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
      });
    });
  };

  const intentPicker = (selected, { id = "intents" } = {}) => {
    const picked = Array.isArray(selected) ? [...selected] : selected ? [selected] : ["dating"];
    return {
      selected: picked,
      html: `<div class="chip-picker">
        <p class="hint">зачем ты здесь — можно несколько</p>
        <div class="chips" id="${id}">${chips("intents", picked)}</div>
      </div>`,
    };
  };

  const promptFields = (prompts) => {
    const used = new Set(prompts.map((p) => p.id));
    return `
      <div class="prompt-edit" id="prompts">
        ${prompts
          .map(
            (p, i) => `
          <div class="prompt-card" data-prompt-i="${i}">
            <div class="q">${escapeHtml(labelOf("prompts", p.id))}</div>
            <textarea data-prompt-answer="${i}" maxlength="280">${escapeHtml(p.answer)}</textarea>
            <button type="button" class="ghost slim" data-prompt-del="${i}">убрать</button>
          </div>`
          )
          .join("")}
        ${
          prompts.length < 3
            ? `<label>добавить промпт
                <select id="prompt-add">
                  <option value="">выбери вопрос</option>
                  ${(state.catalog.prompts || [])
                    .filter((p) => !used.has(p.id))
                    .map((p) => `<option value="${p.id}">${p.label}</option>`)
                    .join("")}
                </select>
              </label>`
            : ""
        }
      </div>`;
  };

  const bindPrompts = (prompts) => {
    const redraw = () => {
      const box = root.querySelector("#prompts");
      if (!box) return;
      box.outerHTML = promptFields(prompts);
      bindPrompts(prompts);
    };
    root.querySelectorAll("[data-prompt-answer]").forEach((el) => {
      el.addEventListener("input", () => {
        prompts[Number(el.dataset.promptAnswer)].answer = el.value;
      });
    });
    root.querySelectorAll("[data-prompt-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        prompts.splice(Number(btn.dataset.promptDel), 1);
        redraw();
      });
    });
    const add = root.querySelector("#prompt-add");
    if (add) {
      add.addEventListener("change", () => {
        if (!add.value) return;
        prompts.push({ id: add.value, answer: "" });
        redraw();
      });
    }
  };

  const filePicker = (id) =>
    `<label class="photo-add">+<input id="${id}" type="file" accept="image/*" multiple></label>`;

  const profileNudge = () => {
    if (!state.user || state.user.guest || !state.user.needs_profile) return "";
    return `<div class="profile-nudge">
      <div>
        <strong>Анкета ещё пустая</strong>
        <p>Можно смотреть ленту. Чтобы тебя находили — добавь фото, город и особенности.</p>
      </div>
      <a class="solid slim" href="${hrefFor("profile")}" data-nav="profile">дозаполнить</a>
    </div>`;
  };

  const goAfterInvite = async () => {
    if (state.pendingPath) {
      const pending = state.pendingPath;
      state.pendingPath = "";
      history.replaceState({ view: "pending" }, "", `${BASE}${pending}`);
      urlSyncState.lastUrl = `${BASE}${pending}`;
      await hydrateFromUrl();
      return;
    }
    state.view = "deck";
    await loadFeed();
    render();
  };




  const photoManager = (u) => {
    const albums = u.albums || [];
    const photos = Array.isArray(u.photos) && u.photos.length && typeof u.photos[0] === "object" ? u.photos : albums.flatMap((a) => a.photos || []);
    const avatar = photos.find((ph) => ph.is_primary) || photos[0];
    return `
      ${
        avatar
          ? `<div class="avatar-pick">
        <img class="avatar-preview" src="${avatarUrl(avatar.url, u.name)}" alt="">
        <div class="hint">аватар</div>
      </div>`
          : ""
      }
      <div class="photo-grid">
        ${photos
          .map(
            (ph) => `
          <div class="photo-cell ${ph.is_primary ? "primary" : ""}" style="background-image:url('${photoUrl(ph.url, u.name)}')">
            <button type="button" class="photo-pick-btn" data-primary="${ph.id}" aria-label="${ph.is_primary ? "это аватар" : "сделать аватаром"}"></button>
            ${ph.is_primary ? `<span class="avatar-badge">аватар</span>` : ""}
            <button type="button" class="photo-del" data-del-photo="${ph.id}" aria-label="убрать фото">×</button>
          </div>`
          )
          .join("")}
        ${filePicker("add-photos")}
      </div>`;
  };


  const profileView = () => {
    const u = state.user;
    const d = state.profileDraft || {};
    const neuro = [...(Array.isArray(d.neuro) ? d.neuro : u.neuro || [])];
    const vibe = [...(Array.isArray(d.vibe) ? d.vibe : u.vibe || [])];
    const prompts = (Array.isArray(d.prompts) ? d.prompts : u.prompts || []).map((p) => ({ ...p }));
    const intentSeed = Array.isArray(d.intents) ? d.intents : u.intents || (u.intent ? [u.intent] : ["dating"]);
    const intentsHold = intentPicker(intentSeed, { id: "me-intents" });
    const nameVal = d.name != null ? d.name : u.name;
    const ageVal = d.age != null && d.age !== "" ? d.age : u.age;
    const cityVal = d.city != null ? d.city : u.city;
    const countryVal = d.country || countryOfCity(cityVal);
    const genderVal = d.gender || u.gender;
    const lookingVal = d.looking_for || u.looking_for;
    const heightVal = d.height != null ? d.height : u.height || "";
    const jobVal = d.job != null ? d.job : u.job || "";
    const bioVal = d.bio != null ? d.bio : u.bio;
    const communicationVal = d.communication != null ? d.communication : u.communication || "";
    const specialOn = d.special_data_consent != null ? d.special_data_consent : !u.needs_special_consent;
    const photoOn = d.photo_rights_consent != null ? d.photo_rights_consent : !u.needs_photo_consent;
    const seekMin = d.seek_min_age != null ? d.seek_min_age : u.seek_min_age || 18;
    const seekMax = d.seek_max_age != null ? d.seek_max_age : u.seek_max_age || 99;
    const seekPlace = d.seek_place != null ? d.seek_place : u.seek_place || "";
    const hideTags = [...(Array.isArray(d.hide_tags) ? d.hide_tags : u.hide_tags || [])];
    const hideNeuro = hideTags.filter((id) => (state.catalog?.neuro || []).some((x) => x.id === id));
    const hideVibe = hideTags.filter((id) => (state.catalog?.vibe || []).some((x) => x.id === id));
    const seekPlaceOpts = [
      `<option value="" ${!seekPlace ? "selected" : ""}>везде</option>`,
      cityVal
        ? `<option value="${escapeAttr(cityVal)}" ${seekPlace === cityVal ? "selected" : ""}>только ${escapeHtml(cityVal)}</option>`
        : "",
      ...(state.catalog?.places || []).map(
        (b) =>
          `<option value="${escapeAttr(b.country)}" ${seekPlace === b.country ? "selected" : ""}>${escapeHtml(
            b.country
          )}</option>`
      ),
    ].join("");
    return {
      html: `
      ${appHead()}
      <section class="panel">
        <h2>Профиль${u.guest ? "" : u.plus ? ` <span class="plus-pill on">WIRING+</span>` : ` <span class="plus-pill">без плюса</span>`}</h2>
        ${
          u.guest
            ? `<p class="lede">Это гостевой просмотр. Чтобы тебя находили, грузили фото и можно было писать — собери свой аккаунт.</p>
               <div class="actions"><a class="solid" href="${hrefFor("register")}" data-nav="register">создать профиль</a><button class="ghost" id="out">на главную</button></div>`
            : `${
                u.needs_profile
                  ? `<p class="lede">Дозаполни анкету — без фото, города и особенностей тебя не видно в ленте. Можно сохранить и вернуться позже.</p>`
                  : ""
              }<form class="form" id="me">
          <div class="consent-box">
            <p class="hint">сначала согласия — без них анкету с особенностями и фото сохранить нельзя:</p>
            <label class="check"><input name="special_data_consent" id="special-data-consent" type="checkbox" ${
              specialOn ? "checked" : ""
            } ${u.needs_special_consent && !specialOn ? "required" : ""} autocomplete="off"> согласен(на) на обработку и показ выбранных особенностей</label>
            <label class="check"><input name="photo_rights_consent" id="photo-rights-consent" type="checkbox" ${
              photoOn ? "checked" : ""
            } ${u.needs_photo_consent && !photoOn ? "required" : ""} autocomplete="off"> загружаю только свои фото и разрешаю показывать их участникам WIRING</label>
          </div>
          <div>
            <div class="hint">фото — минимум одно</div>
            ${photoManager(u)}
          </div>
          <div class="row">
            <label>имя<input name="name" value="${escapeAttr(nameVal)}" required></label>
            <label>возраст<input name="age" type="number" min="18" max="99" value="${escapeAttr(ageVal)}" required></label>
          </div>
          ${placeFields(cityVal, { id: "profile-city", country: countryVal })}
          <div class="row">
            <label>кто ты<select name="gender">${options("genders", genderVal)}</select></label>
            <label>кого ищешь<select name="looking_for">${options("looking_for", lookingVal)}</select></label>
          </div>
          ${intentsHold.html}
          <div class="plus-box">
            <div class="q">кто может меня находить</div>
            <p class="hint">для ленты: кого пускать к тебе. взаимный «кого ищешь» и так учитывается.</p>
            <div class="filter-row">
              <label>от<input name="seek_min_age" type="number" min="18" max="99" value="${escapeAttr(seekMin)}"></label>
              <label>до<input name="seek_max_age" type="number" min="18" max="99" value="${escapeAttr(seekMax)}"></label>
              <label>место<select name="seek_place">${seekPlaceOpts}</select></label>
            </div>
            ${pickerBlock("neuro", hideNeuro, { id: "hide-neuro", lead: "не показывать, если у них есть диагноз:", gloss: false, bindAs: "hideNeuro" })}
            ${pickerBlock("vibe", hideVibe, { id: "hide-vibe", lead: "не показывать, если у них такой вайб:", gloss: false, bindAs: "hideVibe" })}
          </div>
          <label>рост, см<input name="height" type="number" min="140" max="220" value="${escapeAttr(heightVal)}" placeholder="необязательно"></label>
          <label>занятость<input name="job" maxlength="60" value="${escapeAttr(jobVal)}" placeholder="необязательно"></label>
          ${pickerBlock("neuro", neuro, {
            lead: "свои диагнозы и расстройства — хотя бы одно. Нажми «?» на теге — коротко, что это.",
            test: true,
          })}
          ${pickerBlock("vibe", vibe, { lead: "вайб анкеты — как с тобой лучше быть." })}
          <label>о себе<textarea name="bio" maxlength="1200" placeholder="специальный интерес, сенсорные лимиты, чего лучше не делать">${escapeHtml(bioVal)}</textarea></label>
          <label>как тебе писать<textarea name="communication" maxlength="280" placeholder="голосовые ок / нет, small talk — сразу в блок">${escapeHtml(communicationVal)}</textarea></label>
          <div>
            <div class="hint">промпты — до трёх</div>
            ${promptFields(prompts)}
          </div>
          <div class="plus-box">
            <div class="q">уведомления</div>
            ${
              notifyAllowed()
                ? `<p class="hint">браузерные уведомления включены — лайки и сообщения, пока вкладка жива.</p>`
                : canNotify()
                  ? `<p class="hint">браузер скажет, когда лайкнули или написали. работает, пока сайт открыт.</p>
                     <button class="ghost slim" type="button" id="enable-notify">включить уведомления</button>`
                  : `<p class="hint">этот браузер не умеет системные уведомления — смотри счётчики в шапке.</p>`
            }
          </div>
          <a class="plus-box" href="${hrefFor("plus")}" data-nav="plus" style="display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:inherit;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="badge-gem-icon" aria-hidden="true" style="width:22px;height:22px;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 3h12l4 6-10 13L2 9Z"/>
                  <path d="M11 3 8 9l4 13 4-13-3-6"/>
                  <path d="M2 9h20"/>
                </svg>
              </span>
              <div>
                <div class="q" style="margin:0;">WIRING+</div>
                <p class="hint" style="margin:2px 0 0;">${u.plus ? "активен" : "спокойный режим, инкогнито, пауза"}</p>
              </div>
            </div>
            <span class="ghost slim" style="pointer-events:none;">настроить ↗</span>
          </a>
          ${
            u.ref_url
              ? `<div class="plus-box">
            <div class="q">пригласи своих</div>
            <p class="hint">по ссылке зарегистрируется человек — WIRING+ на ${u.ref_days || 30} дней вам обоим. уже привели: ${u.ref_count || 0}</p>
            <div class="ref-row">
              <input id="ref-link" readonly value="${escapeAttr(u.ref_url)}">
              <button class="ghost slim" type="button" id="ref-copy">копировать</button>
            </div>
          </div>`
              : ""
          }
          <div class="err" id="err"></div>
          <div class="actions">
            <button class="solid" type="submit">сохранить</button>
            <button class="ghost" type="button" id="out">выйти</button>
            <button class="ghost" type="button" id="kill">удалить аккаунт</button>
          </div>
        </form>`
        }
        ${legalFooterBar(true)}
      </section>
      ${tabbar()}`,
      bind() {
        const out = root.querySelector("#out");
        if (out) {
          out.addEventListener("click", async () => {
            await api("/api/logout", { method: "POST" });
            state.user = null;
            clearProfileDraft();
            state.view = "home";
            stopInbox();
            render();
          });
        }
        if (u.guest) return;
        state.profileEdit = { neuro, vibe, intents: intentsHold.selected, prompts, hideNeuro, hideVibe };
        bindChips({ neuro, vibe, intents: intentsHold.selected, hideNeuro, hideVibe });
        bindTips();
        bindPrompts(prompts);
        bindPlaceCountry();
        const killBtn = root.querySelector("#kill");
        if (killBtn) {
          killBtn.addEventListener("click", () => { void goToView("delete-account"); });
        }
        const add = root.querySelector("#add-photos");
        if (add) {
          add.addEventListener("change", async () => {
            for (const file of add.files) {
              try {
                await uploadPhoto(file);
              } catch (err) {
                toast(err.message);
              }
            }
            await refreshMe();
            render();
          });
        }
        root.querySelectorAll("[data-primary]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (btn.closest(".photo-cell")?.classList.contains("primary")) return;
            try {
              await api(`/api/photos/${btn.dataset.primary}`, { method: "PATCH", body: JSON.stringify({ is_primary: true }) });
              await refreshMe();
              toast("это теперь аватар");
              render();
            } catch (err) {
              toast(err.message);
            }
          });
        });
        root.querySelectorAll("[data-del-photo]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!confirm("Убрать это фото?")) return;
            try {
              await api(`/api/photos/${btn.dataset.delPhoto}`, { method: "DELETE" });
              await refreshMe();
              toast("фото удалено");
              render();
            } catch (err) {
              toast(err.message);
            }
          });
        });
        root.querySelector("#me").addEventListener("submit", async (e) => {
          e.preventDefault();
          const form = new FormData(e.target);
          const payload = Object.fromEntries(form.entries());
          payload.age = Number(payload.age);
          payload.height = payload.height ? Number(payload.height) : null;
          const edit = state.profileEdit || {};
          payload.neuro = [...(edit.neuro || neuro)];
          payload.vibe = [...(edit.vibe || vibe)];
          payload.intents = [...(edit.intents || intentsHold.selected)];
          delete payload.intent;
          payload.prompts = (edit.prompts || prompts).filter((p) => String(p.answer || "").trim().length >= 4);
          payload.seek_min_age = Number(payload.seek_min_age || 18);
          payload.seek_max_age = Number(payload.seek_max_age || 99);
          payload.seek_place = String(payload.seek_place || "").trim();
          payload.hide_tags = [...(edit.hideNeuro || hideNeuro), ...(edit.hideVibe || hideVibe)];
          payload.special_data_consent = form.has("special_data_consent") || form.get("special_data_consent") === "1" || form.get("special_data_consent") === "on";
          payload.photo_rights_consent = form.has("photo_rights_consent") || form.get("photo_rights_consent") === "1" || form.get("photo_rights_consent") === "on";
          if (root.querySelector("#special-data-consent")?.checked) payload.special_data_consent = true;
          if (root.querySelector("#photo-rights-consent")?.checked) payload.photo_rights_consent = true;
          if (!payload.neuro.length) {
            root.querySelector("#err").textContent = "отметь хотя бы одну особенность";
            return;
          }
          if (!payload.special_data_consent) {
            root.querySelector("#err").textContent = "отметь согласие на особенности — чекбоксы в начале анкеты";
            root.querySelector("#special-data-consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
          if (!payload.photo_rights_consent) {
            root.querySelector("#err").textContent = "отметь согласие на фото — чекбоксы в начале анкеты";
            root.querySelector("#photo-rights-consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
          const photos = Array.isArray(u.photos) ? u.photos : [];
          if (!photos.length && !u.photo) {
            root.querySelector("#err").textContent = "нужно хотя бы одно фото";
            return;
          }
          try {
            const data = await api("/api/me", { method: "PATCH", body: JSON.stringify(payload) });
            state.user = data.user;
            clearProfileDraft();
            toast("сохранено");
            render();
          } catch (err) {
            root.querySelector("#err").textContent = err.message;
          }
        });
      },
    };
  };


  const openPerson = async (id, from) => {
    const data = await api(`/api/people/${id}`);
    state.person = data.person;
    state.personFrom = from || "deck";
    state.photoIndex = 0;
    state.view = "person";
    render();
  };



  const swipe = async (direction) => {
    const card = state.view === "person" && state.person ? state.person : state.cards[state.index];
    if (!card || state.busy) return;
    const targetId = card.id;
    state.busy = true;
    const el = root.querySelector(".card:not(.stacked)");
    if (el) {
      el.style.transition = "transform 0.28s ease, opacity 0.28s ease";
      el.style.transform = `translateX(${direction === "like" ? 160 : -160}px) rotate(${direction === "like" ? 12 : -12}deg)`;
      el.style.opacity = "0";
    }
    try {
      const data = await api("/api/swipe", {
        method: "POST",
        body: JSON.stringify({ target_id: targetId, direction }),
      });
      if (data.matched && data.match?.id) {
        toast(`взаимно с ${data.match.name}`);
        // Drop the card now so a second gesture can't pass over the mutual like.
        if (state.view === "person") {
          state.person = null;
        } else {
          state.cards = state.cards.filter((c) => c.id !== targetId);
          if (state.index >= state.cards.length) state.index = Math.max(0, state.cards.length - 1);
          state.photoIndex = 0;
        }
        try {
          await openChat(data.match.id);
        } catch (err) {
          toast(err.message);
          state.view = "matches";
          const matches = await api("/api/matches");
          state.matches = matches.matches || [];
          render();
        }
        state.busy = false;
        return;
      }
      if (direction === "snooze") toast("отложено на неделю");
      else if (data.guest_nudge) state.guestNudge = true;
    } catch (err) {
      if (err?.payload?.matched && err.payload?.match?.id) {
        toast(err.message);
        try {
          await openChat(err.payload.match.id);
        } catch (openErr) {
          toast(openErr.message);
        }
        state.busy = false;
        return;
      }
      toast(err.message);
      state.busy = false;
      render();
      return;
    }
    if (state.view === "person") {
      state.person = null;
      state.view = state.personFrom === "likes" ? "likes" : "deck";
      if (state.view === "likes") {
        await loadLikes();
        await refreshMe();
      } else {
        state.index += 1;
        state.photoIndex = 0;
        if (!state.cards[state.index]) await loadFeed();
      }
    } else {
      // Advance without full-page flicker when next card is already loaded.
      state.index += 1;
      state.photoIndex = 0;
      if (!state.cards[state.index]) await loadFeed();
    }
    state.busy = false;
    // Let the fly-off finish, then paint.
    await new Promise((r) => setTimeout(r, 180));
    render();
  };

  const rewind = async () => {
    if (state.busy) return;
    state.busy = true;
    try {
      const data = await api("/api/rewind", { method: "POST" });
      await loadFeed();
      toast(data.undid === "like" ? "лайк отменён" : "пропуск отменён");
    } catch (err) {
      toast(err.message);
    }
    state.busy = false;
    render();
  };

  const restart = async () => {
    try {
      const data = await api("/api/deck/restart", { method: "POST" });
      await loadFeed();
      toast(data.cleared ? `вернуто: ${data.cleared}` : "некого возвращать");
      render();
    } catch (err) {
      toast(err.message);
    }
  };

  const openChat = async (id) => {
    state.chatId = Number(id);
    state.view = "chat";
    render();
  };

  const inboxController = createInboxController({
    api,
    root,
    state,
    pageTitle: document.title,
    toast,
    pingBrowser,
    pip,
    loadLikes,
    openChat,
    refreshMe,
    render: () => render(),
  });
  const { applyInbox, pollInbox, start: startInbox, stop: stopInbox } = inboxController;

  const resumeApp = async () => {
    if (!state.user) return;
    await pollInbox();
    try {
      if (state.view === "matches") {
        const data = await api("/api/matches");
        state.matches = data.matches;
        render();
      } else if (state.view === "likes") {
        await loadLikes();
        render();
      }
    } catch {
      /* offline or sleeping radio */
    }
  };



  const loadFeed = async (filters = state.filters) => {
    state.filters = { ...state.filters, ...filters, intents: filters.intents || [] };
    const f = state.filters;
    const q = new URLSearchParams();
    if (f.neuro.length) q.set("neuro", f.neuro.join(","));
    if (f.vibe.length) q.set("vibe", f.vibe.join(","));
    if ((f.intents || []).length) q.set("intent", f.intents.join(","));
    if (f.min_age && f.min_age !== 18) q.set("min_age", String(f.min_age));
    if (f.max_age && f.max_age !== 99) q.set("max_age", String(f.max_age));
    if (f.city) q.set("city", f.city);
    const data = await api(`/api/feed?${q.toString()}`);
    state.cards = data.cards || [];
    state.index = 0;
    state.photoIndex = 0;
    state.recycled = !!data.recycled;
    state.unseen = data.unseen || 0;
    state.passed = data.passed || 0;
    state.liked = data.liked || 0;
    state.likesIn = data.likes_in || 0;
    state.unread = data.unread || 0;
    if (state.user) {
      state.user.likes_in = state.likesIn;
      state.user.unread = state.unread;
    }
    return data;
  };

  const AUTH_FEATURE_VIEWS = new Set(["login", "register", "forgot", "verify", "reset"]);
  let authFeatureUnmount = null;
  let homeFeatureUnmount = null;
  let profileFeatureUnmount = null;
  let likesFeatureUnmount = null;
  let personFeatureUnmount = null;
  let deckFeatureUnmount = null;
  let accountFeatureUnmount = null;
  const CHAT_FEATURE_VIEWS = new Set(["matches", "chat"]);
  let chatFeatureUnmount = null;
  let chatFeatureMountToken = 0;

  const buildHomeHostBridge = () => {
    const signed = Boolean(state.user && !state.user.guest);
    const neuro = state.user?.neuro || [];
    const vibe = state.user?.vibe || [];
    const userTraits = [
      ...neuro.map((id) => ({ label: labelOf("neuro", id) })),
      ...vibe.map((id) => ({ label: labelOf("vibe", id), vibe: true })),
    ].filter((t) => Boolean(t.label));

    return {
      signed,
      isPlus: Boolean(state.user?.plus),
      basePath: BASE,
      homeFaces: HOME_FACES,
      userTraits,
      profileAvatar: state.user ? avatarUrl(state.user.photo, state.user.name) : undefined,
      userName: state.user?.name || "",
      hrefFor,
      navigate: (view) => {
        void goToView(view);
      },
      onThemeSelect: (theme) => {
        applyTheme(theme);
      },
      onLogout: logout,
    };
  };

  const buildProfileHostBridge = () => ({
    user: state.user,
    catalog: state.catalog,
    basePath: BASE,
    hrefFor,
    navigate: (view) => {
      void goToView(view);
    },
    api,
    toast,
    uploadPhoto,
    refreshUser: async () => {
      await refreshMe();
      return state.user;
    },
    setPrimaryPhoto: (id) => api(`/api/photos/${id}`, { method: "PATCH", body: JSON.stringify({ is_primary: true }) }).then(() => undefined),
    deletePhoto: (id) => api(`/api/photos/${id}`, { method: "DELETE" }).then(() => undefined),
    onUserUpdated: (user) => {
      state.user = user;
      clearProfileDraft();
    },
    onLogout: logout,
    onThemeSelect: (theme) => applyTheme(theme),
  });

  const buildLikesHostBridge = () => ({
    user: state.user,
    catalog: state.catalog,
    likes: state.likes,
    matchesCount: (state.matches || []).length,
    filters: state.likesFilters,
    basePath: BASE,
    hrefFor,
    navigate: (view, params = {}) => {
      if (view === "person" && params.id) {
        void openPerson(Number(params.id), "likes");
        return;
      }
      void goToView(view);
    },
    api,
    loadLikes,
    toast,
    onUserUpdated: (user) => {
      state.user = user;
      state.likesIn = user.likes_in || 0;
      state.unread = user.unread || 0;
    },
    onThemeSelect: (theme) => applyTheme(theme),
    onLogout: logout,
  });

  const buildPersonHostBridge = () => ({
    user: state.user,
    catalog: state.catalog,
    person: state.person,
    personFrom: state.personFrom,
    basePath: BASE,
    hrefFor,
    navigate: (view, params = {}) => {
      if (view === "chat" && params.id) {
        void openChat(Number(params.id));
        return;
      }
      void goToView(view);
    },
    swipe,
    api,
    toast,
    onThemeSelect: (theme) => applyTheme(theme),
    onLogout: logout,
  });

  const buildDeckHostBridge = () => ({
    user: state.user,
    catalog: state.catalog,
    cards: state.cards,
    index: state.index,
    filters: state.filters,
    filtersOpen: state.filtersOpen,
    recycled: state.recycled,
    passed: state.passed,
    basePath: BASE,
    hrefFor,
    navigate: (view, params = {}) => {
      if (view === "person" && params.id) {
        void openPerson(Number(params.id), "deck");
        return;
      }
      void goToView(view);
    },
    loadFeed: async (filters = state.filters) => {
      state.filters = { ...state.filters, ...filters, intents: filters.intents || [] };
      persistFilters();
      return loadFeed(state.filters);
    },
    swipe,
    rewind,
    restart,
    api,
    toast,
    onUserUpdated: (user) => {
      state.user = user;
    },
    onThemeSelect: (theme) => applyTheme(theme),
    onLogout: logout,
  });

  const buildAccountHostBridge = () => ({
    user: state.user,
    catalog: state.catalog,
    basePath: BASE,
    hrefFor,
    navigate: (view, params = {}) => void goToView(view, params),
    api,
    toast,
    continueAfterInvite: goAfterInvite,
    onDeleted: async () => {
      state.user = null;
      clearProfileDraft();
      stopInbox();
      await goToView("home");
    },
    uploadPhoto,
    refreshUser: async () => {
      await refreshMe();
      return state.user;
    },
    onUserUpdated: (user) => { state.user = user; },
    onThemeSelect: (theme) => applyTheme(theme),
    onLogout: logout,
  });

  const buildChatHostBridge = () => ({
    mode: state.view === "chat" ? "chat" : "matches",
    chatId: state.chatId || undefined,
    user: state.user,
    matches: state.matches,
    basePath: BASE,
    hrefFor,
    navigate: (view, params = {}) => {
      if (view === "chat" && params.id) {
        void openChat(Number(params.id));
        return;
      }
      if (view === "person" && params.id) {
        void openPerson(Number(params.id), "chat");
        return;
      }
      void goToView(view);
    },
    api,
    toast,
    onThemeSelect: (theme) => applyTheme(theme),
    onLogout: logout,
  });

  const buildAuthHostBridge = (mode) => ({
    mode,
    basePath: BASE,
    verifyEmail: state.verifyEmail || "",
    resetToken: state.resetToken || "",
    inviteLede: Boolean(peekRef()),
    getReferralCode: peekRef,
    hrefFor,
    api,
    toast,
    navigate: (view) => {
      void goToView(view);
    },
    onRegisterVerify: (email) => {
      sessionStorage.removeItem("wiring-ref");
      state.pendingRef = "";
      state.verifyEmail = email;
      state.user = null;
      state.view = "verify";
      toast("проверь почту — нужна ссылка подтверждения");
      render();
    },
    onAuthSuccess: async (mode, data) => {
      state.user = data.user;
      if (mode === "register") {
        sessionStorage.removeItem("wiring-ref");
        state.pendingRef = "";
        if (data.user?.plus) toast("WIRING+ за приглашение");
        await refreshMe();
      }
      startInbox();
      if (mode === "register") {
        state.view = state.user?.needs_profile ? "profile" : "deck";
        if (state.view === "deck") await loadFeed();
        render();
        return;
      }
      if (state.pendingPath) {
        const pending = state.pendingPath;
        state.pendingPath = "";
        history.replaceState({ view: "pending" }, "", `${BASE}${pending}`);
        urlSyncState.lastUrl = `${BASE}${pending}`;
        await hydrateFromUrl();
        return;
      }
      state.view = state.user?.needs_profile ? "profile" : "deck";
      if (state.view === "deck") await loadFeed();
      render();
    },
    onForgotDone: () => {
      state.view = "login";
      render();
    },
    onResetDone: () => {
      state.resetToken = "";
      state.view = "login";
      render();
    },
  });

  const goToView = async (next, meta = {}) => {
    if (meta.neuro && next === "register") sessionStorage.setItem(PICK_NEURO, meta.neuro);
    if (meta.neuro && next === "deck") {
      state.filters.neuro = [meta.neuro];
      persistFilters();
    }
    if (!state.user && ["deck", "likes", "matches", "profile", "consents", "person", "chat", "delete-account", "plus"].includes(next)) {
      let pending = hrefFor(next);
      if (BASE && pending.startsWith(BASE)) pending = pending.slice(BASE.length) || "/";
      state.pendingPath = pending;
      state.view = "login";
      render();
      return;
    }
    if (state.view === "person" && next === "deck") {
      state.view = "deck";
      render();
      return;
    }
    state.view = next;
    state.photoIndex = 0;
    if (next !== "chat") state.chatId = null;
    if (next !== "profile" && next !== "plus" && next !== "consents") clearProfileDraft();
    if (state.view === "deck" && state.user) await loadFeed();
    if (state.view === "matches" && state.user) {
      const data = await api("/api/matches");
      state.matches = data.matches;
      await refreshMe();
    }
    if (state.view === "likes" && state.user) {
      await loadLikes();
      await refreshMe();
    }
    if (["profile", "consents", "plus"].includes(state.view) && state.user && !state.profileDraft) await refreshMe();
    render();
  };

  const bindDataNavLinks = () => {
    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        if (btn.tagName === "A") e.preventDefault();
        const next = btn.dataset.nav;
        if (next === "back") {
          if (
            window.history.length > 1 &&
            (window.history.state?.view ||
              (document.referrer && new URL(document.referrer, location.origin).origin === location.origin))
          ) {
            window.history.back();
          } else {
            await goToView("home");
          }
          return;
        }
        await goToView(next, { neuro: btn.dataset.neuro });
      });
    });
  };

  const renderAuthFeature = async (mode) => {
    authFeatureUnmount?.();
    authFeatureUnmount = null;
    root.innerHTML = authLayout('<div id="auth-feature-root"></div>');
    bindDataNavLinks();
    bindThemeControls();
    const mountEl = root.querySelector("#auth-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.auth();
      authFeatureUnmount = mod.mountAuth(mountEl, buildAuthHostBridge(mode));
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      mountEl.innerHTML = `<p class="err">не загрузился модуль auth (${err.message}). выполни npm run build</p>`;
    }
  };

  const renderHomeFeature = async () => {
    homeFeatureUnmount?.();
    homeFeatureUnmount = null;
    root.innerHTML = '<div id="home-feature-root"></div>' + tabbar();
    bindDataNavLinks();
    bindThemeControls();
    const mountEl = root.querySelector("#home-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.home();
      homeFeatureUnmount = mod.mountHome(mountEl, buildHomeHostBridge());
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      root.innerHTML = homeView();
      bindFold("#traits-open", "#home-traits");
      bindFold("#about-open", "#home-about");
      bindDataNavLinks();
      bindThemeControls();
    }
  };

  const renderProfileFeature = async (view = state.view) => {
    profileFeatureUnmount?.();
    profileFeatureUnmount = null;
    root.innerHTML = '<div id="profile-feature-root"></div>' + tabbar();
    bindDataNavLinks();
    bindThemeControls();
    const mountEl = root.querySelector("#profile-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.profile();
      const profileHost = buildProfileHostBridge();
      profileFeatureUnmount = view === "consents"
        ? mod.mountConsent(mountEl, profileHost)
        : view === "plus"
          ? mod.mountPlus(mountEl, profileHost)
          : mod.mountProfile(mountEl, profileHost);
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      const fallback = profileView();
      root.innerHTML = fallback.html;
      fallback.bind();
      bindDataNavLinks();
      bindThemeControls();
      toast(`не загрузился модуль profile (${err.message}).`);
    }
  };

  const renderLikesFeature = async () => {
    likesFeatureUnmount?.();
    likesFeatureUnmount = null;
    root.innerHTML = '<div id="likes-feature-root"></div>' + tabbar();
    bindDataNavLinks();
    bindThemeControls();
    const mountEl = root.querySelector("#likes-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.likes();
      if (state.view !== "likes") return;
      likesFeatureUnmount = mod.mountLikes(mountEl, buildLikesHostBridge());
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      root.innerHTML = `<p class="err">не загрузился модуль likes (${escapeHtml(err.message)}). выполни npm run build</p>`;
      toast(`не загрузился модуль likes (${err.message}).`);
    }
  };

  const renderPersonFeature = async () => {
    personFeatureUnmount?.();
    personFeatureUnmount = null;
    if (!state.person) {
      state.view = "deck";
      await loadFeed();
      render();
      return;
    }
    root.innerHTML = '<div id="person-feature-root"></div>' + tabbar();
    bindDataNavLinks();
    bindThemeControls();
    const mountEl = root.querySelector("#person-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.person();
      if (state.view !== "person" || !state.person) return;
      personFeatureUnmount = mod.mountPerson(mountEl, buildPersonHostBridge());
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      root.innerHTML = `<p class="err">не загрузился модуль person (${escapeHtml(err.message)}). выполни npm run build</p>`;
      toast(`не загрузился модуль person (${err.message}).`);
    }
  };

  const renderDeckFeature = async () => {
    deckFeatureUnmount?.();
    deckFeatureUnmount = null;
    root.innerHTML = '<div id="deck-feature-root"></div>' + tabbar();
    bindDataNavLinks();
    bindThemeControls();
    const mountEl = root.querySelector("#deck-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.deck();
      if (state.view !== "deck") return;
      deckFeatureUnmount = mod.mountDeck(mountEl, buildDeckHostBridge());
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      root.innerHTML = `<p class="err">не загрузился модуль deck (${escapeHtml(err.message)}). выполни npm run build</p>`;
      toast(`не загрузился модуль deck (${err.message}).`);
    }
  };

  const renderAccountFeature = async (view) => {
    accountFeatureUnmount?.();
    accountFeatureUnmount = null;
    root.innerHTML = '<div id="account-feature-root"></div>' + (["invite", "onboard"].includes(view) ? tabbar() : "");
    bindDataNavLinks();
    bindThemeControls();
    const mountEl = root.querySelector("#account-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.account();
      if (!["invite", "delete-account", "onboard"].includes(state.view)) return;
      const accountHost = buildAccountHostBridge();
      accountFeatureUnmount = view === "invite"
        ? mod.mountInvite(mountEl, accountHost)
        : view === "onboard"
          ? mod.mountOnboard(mountEl, accountHost)
          : mod.mountDeleteAccount(mountEl, accountHost);
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      root.innerHTML = `<p class="err">не загрузился модуль account (${escapeHtml(err.message)}). выполни npm run build</p>`;
      toast(`не загрузился модуль account (${err.message}).`);
    }
  };

  const renderChatFeature = async () => {
    const token = ++chatFeatureMountToken;
    chatFeatureUnmount?.();
    chatFeatureUnmount = null;
    root.innerHTML = '<div id="chat-feature-root"></div>' + (state.view === "matches" ? tabbar() : "");
    bindDataNavLinks();
    bindThemeControls();
    const mountEl = root.querySelector("#chat-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.chat();
      if (token !== chatFeatureMountToken || !CHAT_FEATURE_VIEWS.has(state.view)) return;
      chatFeatureUnmount = mod.mountChat(mountEl, buildChatHostBridge());
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      root.innerHTML = `<p class="err">не загрузился модуль chat (${escapeHtml(err.message)}). выполни npm run build</p>`;
      toast(`не загрузился модуль chat (${err.message}).`);
    }
  };

  const render = () => {
    if (state.view === "profile") {
      captureProfileDraft();
      profileScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    }
    document.documentElement.dataset.view = state.view;
    document.documentElement.toggleAttribute("data-tabs", showsTabbar());
    let bound = null;
    if (!AUTH_FEATURE_VIEWS.has(state.view)) {
      authFeatureUnmount?.();
      authFeatureUnmount = null;
    }
    if (state.view !== "home") {
      homeFeatureUnmount?.();
      homeFeatureUnmount = null;
    }
    if (!["profile", "consents", "plus"].includes(state.view)) {
      profileFeatureUnmount?.();
      profileFeatureUnmount = null;
    }
    if (!CHAT_FEATURE_VIEWS.has(state.view)) {
      chatFeatureMountToken += 1;
      chatFeatureUnmount?.();
      chatFeatureUnmount = null;
    }
    if (state.view !== "likes") {
      likesFeatureUnmount?.();
      likesFeatureUnmount = null;
    }
    if (state.view !== "person") {
      personFeatureUnmount?.();
      personFeatureUnmount = null;
    }
    if (state.view !== "deck") {
      deckFeatureUnmount?.();
      deckFeatureUnmount = null;
    }
    if (!["invite", "delete-account", "onboard"].includes(state.view)) {
      accountFeatureUnmount?.();
      accountFeatureUnmount = null;
    }
    if (!state.catalog) {
      root.innerHTML = `<p class="lede">загрузка…</p>`;
      return;
    }
    if (state.view === "register" && (!state.user || state.user.guest)) {
      void renderAuthFeature("register");
      return;
    }
    if (!state.user && state.view === "login") {
      void renderAuthFeature("login");
      return;
    }
    if (!state.user && state.view === "forgot") {
      void renderAuthFeature("forgot");
      return;
    }
    if (!state.user && state.view === "reset") {
      void renderAuthFeature("reset");
      return;
    }
    if (!state.user && state.view === "verify") {
      void renderAuthFeature("verify");
      return;
    }
    else if (state.view === "home" || !state.user) {
      void renderHomeFeature();
      return;
    }
    else if (state.user && !state.user.guest && state.user.needs_city && !state.user.needs_profile && state.view !== "profile") bound = cityGateView();
    else if (CHAT_FEATURE_VIEWS.has(state.view)) {
      void renderChatFeature();
      return;
    }
    else if (state.view === "likes") {
      void renderLikesFeature();
      return;
    }
    else if (state.view === "person") {
      void renderPersonFeature();
      return;
    }
    else if (state.view === "deck") {
      void renderDeckFeature();
      return;
    }
    else if (["invite", "delete-account", "onboard"].includes(state.view)) {
      void renderAccountFeature(state.view);
      return;
    }
    else if (["profile", "consents", "plus"].includes(state.view)) {
      void renderProfileFeature(state.view);
      return;
    }
    else root.innerHTML = homeView();

    if (bound) {
      root.innerHTML = bound.html;
      bound.bind();
    }
    if (state.view === "profile") {
      requestAnimationFrame(() => window.scrollTo(0, profileScrollY));
    }
    bindDataNavLinks();
    root.querySelectorAll("[data-person]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (btn.tagName === "A") e.preventDefault();
        openPerson(Number(btn.dataset.person), btn.dataset.from || "deck");
      });
    });
    const hideNudge = root.querySelector("#hide-nudge");
    if (hideNudge) {
      hideNudge.addEventListener("click", () => {
        state.guestNudgeHidden = true;
        render();
      });
    }
    const enableNotify = root.querySelector("#enable-notify");
    if (enableNotify) enableNotify.addEventListener("click", () => askNotify());
    const copyRef = root.querySelector("#ref-copy");
    if (copyRef) {
      copyRef.addEventListener("click", async () => {
        const link = (root.querySelector("#ref-link") || {}).value || "";
        if (!link) return;
        try {
          await navigator.clipboard.writeText(link);
          toast("ссылка скопирована");
        } catch {
          const input = root.querySelector("#ref-link");
          if (input) {
            input.focus();
            input.select();
          }
          toast("скопируй ссылку");
        }
      });
    }
    const skipNotify = root.querySelector("#skip-notify");
    if (skipNotify) {
      skipNotify.addEventListener("click", () => {
        state.notifySkip = true;
        localStorage.setItem("wiring-notify-skip", "1");
        render();
      });
    }
    bindThemeControls();
    root.querySelectorAll(".beta-wrap").forEach((wrap) => {
      wrap.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrap.classList.toggle("is-open");
      });
    });
    const bindFold = (btnId, panelId) => {
      const foldBtn = root.querySelector(btnId);
      const panel = root.querySelector(panelId);
      if (!foldBtn || !panel) return;
      foldBtn.addEventListener("click", () => {
        const open = foldBtn.getAttribute("aria-expanded") === "true";
        foldBtn.setAttribute("aria-expanded", String(!open));
        panel.hidden = open;
      });
    };
    bindFold("#traits-open", "#home-traits");
    bindFold("#about-open", "#home-about");

    bindTips();
    syncUrl();
  };

  const hydrateFromUrl = async () => {
    const params = new URLSearchParams(location.search);
    const resetQ = params.get("reset");
    if (resetQ) {
      state.resetToken = resetQ;
      state.view = "reset";
      history.replaceState({ view: "reset" }, "", hrefFor("reset"));
      render();
      return;
    }
    const verifyQ = params.get("verify");
    if (verifyQ) {
      history.replaceState({ view: "verify" }, "", hrefFor("verify"));
      try {
        const data = await api("/api/email/verify", {
          method: "POST",
          body: JSON.stringify({ token: verifyQ }),
        });
        state.user = data.user;
        state.verifyEmail = "";
        toast("почта подтверждена");
        startInbox();
        state.view = state.user?.needs_profile ? "profile" : "deck";
        if (state.view === "deck") await loadFeed();
        render();
      } catch (err) {
        state.verifyEmail = "";
        state.view = "verify";
        render();
        toast(err.message || "ссылка не сработала");
      }
      return;
    }
    const matched = routing.matchRoute(location.pathname || "/", BASE);
    if (matched.inviteRef) rememberRef(matched.inviteRef);
    const session = state.user
      ? { loggedIn: true, isGuest: !!state.user.guest }
      : { loggedIn: false };
    const plan = routing.planRoute(matched, session, pathOf());

    if (plan.kind === "login") {
      state.pendingPath = plan.pendingPath;
      state.view = "login";
      render();
      return;
    }
    if (plan.kind === "feed") {
      state.view = "deck";
      await loadFeed();
      render();
      return;
    }
    if (plan.kind === "person") {
      try {
        await openPerson(plan.id, "deck");
      } catch (err) {
        toast(err.message);
        state.view = "deck";
        await loadFeed();
        render();
      }
      return;
    }
    if (plan.kind === "chat") {
      state.chatId = plan.id;
      state.view = "chat";
      render();
      return;
    }
    state.view = plan.view;
    state.chatId = null;
    state.photoIndex = 0;
    if (state.view === "deck") await loadFeed();
    if (state.view === "matches") {
      const data = await api("/api/matches");
      state.matches = data.matches;
    }
    if (state.view === "likes") await loadLikes();
    if (state.view === "profile" || state.view === "consents" || state.view === "plus") await refreshMe();
    render();
  };

  const boot = async () => {
    await ensureRouting();
    state.catalog = await api("/api/catalog");
    const me = await api("/api/me");
    state.user = me.user;
    state.likesIn = me.user?.likes_in || 0;
    state.unread = me.user?.unread || 0;
    state.guestNudge = !!me.user?.guest_nudge;
    if (me.user) {
      await applyInbox(
        { likes_in: me.user.likes_in, unread: me.user.unread, notices: me.user.notices || [] },
        { announce: true }
      );
      startInbox();
    }
    await hydrateFromUrl();
  };

  window.addEventListener("popstate", () => {
    urlSyncState.lastUrl = location.pathname;
    hydrateFromUrl().catch((err) => {
      root.innerHTML = `<p class="err">${escapeHtml(err.message)}</p>`;
    });
  });

  let lastWake = 0;
  const onWake = () => {
    if (document.visibilityState && document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastWake < 1200) return;
    lastWake = now;
    resumeApp().catch(() => {});
  };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) onWake();
  });
  window.addEventListener("focus", onWake);

  boot().catch((err) => {
    root.innerHTML = `<p class="err">${escapeHtml(err.message)}</p>`;
  });
})();
