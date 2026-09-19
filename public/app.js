(() => {
  const root = document.getElementById("app");
  const BASE = root.dataset.base || "";
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
    thread: null,
    person: null,
    personFrom: "deck",
    filters: { ...(savedFilters || { neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "" }), real_only: false },
    filtersOpen: false,
    likesFilters: { neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "" },
    likesFiltersOpen: false,
    replyTo: null,
    reportFor: null,
    reportReason: "",
    reportDetails: "",
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
    onboardFiles: [],
    notifySkip: localStorage.getItem("wiring-notify-skip") === "1",
    pendingPath: "",
    pendingRef: sessionStorage.getItem("wiring-ref") || "",
    profileDraft: null,
    profileEdit: null,
  };
  let chatTimer = 0;
  let inboxTimer = 0;
  const urlSyncState = { lastUrl: "" };
  let profileScrollY = 0;
  const seenNotices = new Set();
  const PAGE_TITLE = document.title;

  let routing = null;
  const ensureRouting = () => {
    if (routing) return Promise.resolve(routing);
    return import(`${BASE}/public/dist/router.js`).then((mod) => {
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
      id: state.view === "chat" ? state.thread?.peer?.id : state.view === "person" ? state.person?.id : undefined,
    });

  const syncUrl = () => {
    routing.syncViewToUrl(urlSyncState, BASE, state.view, {
      id:
        state.view === "chat"
          ? state.thread?.peer?.id
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
    home: svgIcon(
      `<path d="M4 10.2L12 3.5l8 6.7V20a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 20z"/><path d="M9 21.5v-6.5a3 3 0 0 1 6 0v6.5"/>`,
      { size: 21, strokeWidth: 1.5 }
    ),
    feed: svgIcon(
      `<rect x="4.45" y="3.5" width="9.5" height="16.5" rx="2.2" transform="rotate(-10 9.2 11.75)" opacity="0.45"/><rect x="10.05" y="3.5" width="9.5" height="16.5" rx="2.2" transform="rotate(10 14.8 11.75)" opacity="0.45"/><rect x="6.75" y="2.8" width="10.5" height="17.5" rx="2.4" fill="var(--bg-2, #18181b)"/><circle cx="12" cy="8.2" r="2"/><path d="M9 15c.6-1.4 1.7-1.9 3-1.9s2.4.5 3 1.9"/><path d="M2.8 11.75H1.2m1.2-1.2L1.2 11.75l1.2 1.2"/><path d="M21.2 11.75H22.8m-1.2-1.2l1.2 1.2-1.2 1.2"/>`,
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
      `<path d="M21 11.5c0 4.6-4.1 8.2-9 8.2-1.5 0-3-.4-4.3-1L3 20l1.5-3.8C3.7 15 3 13.3 3 11.5 3 6.9 7.1 3.3 12 3.3s9 3.6 9 8.2z"/><circle cx="8" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="11.5" r="1" fill="currentColor" stroke="none"/>`,
      { size: 21, strokeWidth: 1.5 }
    ),
    user: svgIcon(`<circle cx="12" cy="8" r="3.2"/><path d="M5.2 19c1.4-3.2 4-4.8 6.8-4.8s5.4 1.6 6.8 4.8"/>`, { size: 20 }),
    tag: svgIcon(`<path d="M4.5 12.8V5.5H12l7.2 7.2-6.5 6.5z"/><circle cx="8.2" cy="9.2" r="1" fill="currentColor" stroke="none"/>`, { size: 20 }),
    eye: svgIcon(`<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>`, { size: 18 }),
    eyeOff: svgIcon(`<path d="M3 4l17 16M10.5 10.7a2.6 2.6 0 0 0 3.7 3.6M9.4 5.5A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-4.2 4.6M6.2 6.7C3.8 8.3 2 12 2 12a17 17 0 0 0 5.4 5.2"/>`, { size: 18 }),
    book: svgIcon(`<path d="M5 5.5h6.2A3.3 3.3 0 0 1 14.5 8.8V19H8.2A3.2 3.2 0 0 0 5 22.2z"/><path d="M19 5.5h-6.2A3.3 3.3 0 0 0 9.5 8.8V19H16a3.2 3.2 0 0 1 3 3.2z"/>`, { size: 20 }),
    plus: svgIcon(`<path d="M12 6v12M6 12h12"/>`, { size: 20 }),
    photo: svgIcon(
      `<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9.5" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M8 17l3.2-3.6a1.2 1.2 0 0 1 1.8 0L16.5 17"/>`,
      { size: 20 }
    ),
    theme: svgIcon(`<path d="M14.2 4.4A7.2 7.2 0 1 0 19.6 14 5.6 5.6 0 0 1 14.2 4.4z"/>`, { size: 20 }),
    arrow: svgIcon(`<path d="M5 12h14M13 6l6 6-6 6"/>`, { size: 18 }),
  };

  const THEME_ICONS = {
    mist: svgIcon(
      `<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77"/>`,
      { size: 20, strokeWidth: 1.9 }
    ),
    pastel: svgIcon(
      `<path d="M12 3v3M6.3 6.3l2.1 2.1M17.7 6.3l-2.1 2.1M2 16h20M6 16a6 6 0 0 1 12 0M4 20h16"/>`,
      { size: 20, strokeWidth: 1.9 }
    ),
    dusk: svgIcon(
      `<path d="M2 16h20M7 16a5 5 0 0 1 10 0M5 20h14M12 7v4M10 9l2 2 2-2M18.5 4l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>`,
      { size: 20, strokeWidth: 1.9 }
    ),
    night: svgIcon(
      `<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>`,
      { size: 20, strokeWidth: 1.9 }
    ),
    slate: svgIcon(
      `<path d="M18.5 13.5A8.5 8.5 0 1 1 9.5 4.5a6.8 6.8 0 0 0 9 9z"/><path d="M19 3l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM15 9l.3.7.7.3-.7.3-.3.7-.3-.7-.7-.3.7-.3z"/>`,
      { size: 20, strokeWidth: 1.9 }
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
  };
  applyTheme(themeNow());

  const persistFilters = () => {
    const { real_only: _ignore, ...rest } = state.filters;
    sessionStorage.setItem("wiring-filters", JSON.stringify(rest));
  };
  state.filters.real_only = false;

  const plusUntil = (ts) => {
    if (!ts) return "";
    return new Date(ts * 1000).toLocaleDateString("ru", { day: "numeric", month: "short", year: "numeric" });
  };

  const api = async (path, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (!(opts.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(`${BASE}${path}`, {
      credentials: "same-origin",
      headers,
      ...opts,
    });
    const data = await res.json().catch(() => ({ ok: false, error: "битый ответ" }));
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || `ошибка ${res.status}`);
      err.payload = data;
      err.status = res.status;
      throw err;
    }
    return data;
  };

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

  const cardPhotos = (card) => {
    const list = (card.photos || []).map((p) => (typeof p === "string" ? p : p.url)).filter(Boolean);
    if (list.length) return list;
    return card.photo ? [card.photo] : [];
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

  const FEED_CHIP_LIMIT = 4;
  const feedChipsHtml = (card) => {
    const items = [
      ...(card.neuro || []).map((id) => ({ kind: "neuro", id })),
      ...(card.vibe || []).map((id) => ({ kind: "vibe", id })),
    ];
    const shown = items.slice(0, FEED_CHIP_LIMIT);
    const rest = items.length - shown.length;
    return (
      shown.map((item) => chipMark(item.kind, item.id, "on")).join("") +
      (rest > 0 ? `<span class="chip on more">+${rest}</span>` : "")
    );
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

  const emptyBox = (title, text, extra = "") =>
    `<div class="empty"><h2>${escapeHtml(title)}</h2><p>${text}</p>${extra}</div>`;

  const matchRow = (m, { href, attrs = "", sub = "", unread = 0, locked = false, time = "" } = {}) => {
    if (locked) {
      return `
    <div class="match locked" ${attrs}>
      <div class="locked-face" aria-hidden="true"><i></i></div>
      <div>
        <h3>кто-то лайкнул</h3>
        <p>${sub}</p>
      </div>
    </div>`;
    }
    return `
    <a class="match ${unread ? "has-unread" : ""}" href="${href}" ${attrs}>
      <img src="${avatarUrl(m.photo, m.name)}" alt="" width="64" height="64">
      <div class="match-body">
        <div class="match-head">
          <h3>${escapeHtml(m.name)}, ${m.age}</h3>
          ${time ? `<time class="match-time">${escapeHtml(time)}</time>` : ""}
        </div>
        <p>${sub}</p>
      </div>
      ${unread ? `<span class="unread">${unread}</span>` : ""}
    </a>`;
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

  const pickerBlock = (kind, selected, { id = "", lead = "", gloss = false, bindAs = "" } = {}) => `
    <div class="chip-picker">
      <p class="hint">${lead}${gloss ? ` ${GLOSS_LINK}` : ""}</p>
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

  const noticeAction = (note) => async () => {
    if (!note) return;
    if (note.kind === "like") {
      state.view = "likes";
      if (state.user) await loadLikes();
      render();
      return;
    }
    if (note.kind === "match") {
      state.view = "matches";
      if (state.user) {
        const data = await api("/api/matches");
        state.matches = data.matches || [];
      }
      render();
      if (note.from_id) {
        try {
          await openChat(note.from_id);
        } catch (err) {
          toast(err.message);
        }
      }
      return;
    }
    if (note.kind === "referral") {
      state.view = "profile";
      if (state.user) await refreshMe();
      render();
      return;
    }
    if (note.from_id) {
      await openChat(note.from_id);
      return;
    }
    state.view = "matches";
    render();
  };

  const syncChrome = () => {
    const n = (state.likesIn || 0) + (state.unread || 0);
    document.title = n ? `(${n > 9 ? "9+" : n}) WIRING` : PAGE_TITLE;
    root.querySelectorAll("[data-count]").forEach((el) => {
      const n = el.dataset.count === "likes" ? state.likesIn || 0 : state.unread || 0;
      el.innerHTML = pip(n);
    });
  };

  const applyInbox = async (data, { announce = true } = {}) => {
    const prevLikes = state.likesIn || 0;
    const prevUnread = state.unread || 0;
    state.likesIn = data.likes_in || 0;
    state.unread = data.unread || 0;
    if (state.user) {
      state.user.likes_in = state.likesIn;
      state.user.unread = state.unread;
    }
    syncChrome();
    const fresh = (data.notices || []).filter((note) => !seenNotices.has(note.id));
    const shown = [];
    for (const note of fresh) {
      seenNotices.add(note.id);
      const inChat = state.view === "chat" && state.thread?.peer?.id === note.from_id && note.kind === "message";
      if (inChat || !announce) continue;
      toast(note.body, noticeAction(note));
      pingBrowser(note.body);
      shown.push(note.id);
    }
    if (shown.length) {
      api("/api/notices/read", { method: "POST", body: JSON.stringify({ ids: shown }) }).catch(() => {});
    }
    if (announce && state.likesIn > prevLikes && state.view === "likes") {
      await loadLikes();
      render();
    }
    if (announce && state.view === "matches") {
      const gotMatch = fresh.some((n) => n.kind === "match");
      if (gotMatch || state.unread > prevUnread) {
        const matches = await api("/api/matches");
        state.matches = matches.matches;
        render();
      }
    }
  };

  const pollInbox = async () => {
    if (!state.user) return;
    try {
      const data = await api("/api/inbox");
      await applyInbox(data);
    } catch {
      /* keep last counts */
    }
  };

  const startInbox = () => {
    clearInterval(inboxTimer);
    if (!state.user) return;
    inboxTimer = setInterval(pollInbox, 20000);
  };

  const stopInbox = () => {
    clearInterval(inboxTimer);
    inboxTimer = 0;
    document.title = PAGE_TITLE;
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

  const uploadPhoto = async (file) => {
    const blob = await compressImage(file);
    const fd = new FormData();
    fd.append("file", blob, "photo.jpg");
    const rights = root.querySelector("#photo-rights-consent");
    if (rights?.checked) fd.append("photo_rights_consent", "1");
    return api("/api/photos", { method: "POST", body: fd });
  };

  const loadLikes = async () => {
    const q = new URLSearchParams();
    const f = state.likesFilters || {};
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

  const timeLabel = (ts) => {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    const now = new Date();
    const same = d.toDateString() === now.toDateString();
    return same
      ? d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("ru", { day: "numeric", month: "short" });
  };

  const footer = () => `
    <footer class="site-foot">
      <span>18+</span>
      <a href="/rules">правила</a>
      <a href="/privacy">конфиденциальность</a>
      <a href="/support">поддержка</a>
      ${
        state.user && !state.user.guest
          ? `<a href="/glossary">глоссарий</a><a href="${TEST_HREF}" target="_blank" rel="noopener">тест нейроотличий</a>`
          : ""
      }
    </footer>`;

  const pip = (n) => (n ? `<span class="pip">${n > 9 ? "9+" : n}</span>` : "");
  const QUIET_VIEWS = new Set(["login", "register", "forgot", "reset", "verify", "onboard", "invite", "chat"]);
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
    const on = state.view === "profile";
    const plus = Boolean(state.user.plus);
    return `<span class="avatar-slot"><a class="avatar-link${on ? " on" : ""}${plus ? " plus" : ""}" href="${hrefFor("profile")}" data-nav="profile" aria-label="${plus ? "профиль · WIRING+" : "профиль"}"${on ? ' aria-current="page"' : ""}><img src="${avatarUrl(state.user.photo, state.user.name)}" alt=""></a>${plus ? `<span class="plus-mark" title="WIRING+" aria-hidden="true">+</span>` : ""}</span>`;
  };

  const appHead = (opts = {}) => {
    const isAuth = QUIET_VIEWS.has(state.view) && state.view !== "chat";
    const logoPos = opts.logoPosition !== undefined ? opts.logoPosition : (isAuth ? "center" : "left");
    const showActions = opts.showActions !== undefined ? opts.showActions : !isAuth;
    const showBack = opts.showBack !== undefined ? opts.showBack : isAuth;
    const backHref = opts.backHref || hrefFor("home");
    const backLabel = opts.backLabel || "Назад";
    const centerClass = logoPos === "center" ? " center" : "";
    return `
    <header class="app-head${centerClass}" data-logo-position="${logoPos}">
      ${showBack ? `
      <div class="app-head-start">
        <a class="icon-btn app-head-back" href="${escapeAttr(backHref)}" data-nav="back" aria-label="Вернуться назад" title="Назад">
          <svg class="app-head-back-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </a>
      </div>` : ""}
      <a class="brand" href="${hrefFor("home")}" data-nav="home"><span class="brand-name">WIR<span>ING</span></span><span class="beta-wrap" tabindex="0" role="button" aria-haspopup="dialog" aria-label="О бета-версии"><span class="beta-label">beta</span><span class="beta-popover" role="tooltip">Сайт в стадии беты: всё работает, но возможны небольшие ошибки. Мы постоянно улучшаем сервис.</span></span></a>
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
      ${signed ? `<a href="/glossary">глоссарий</a><a href="${TEST_HREF}" target="_blank" rel="noopener">тест</a>` : ""}
    </footer>`;

  const authLegalFoot = () => legalFooterBar(false);

  const authLayout = (body) => `
      ${appHead({ logoPosition: "center", showActions: true, showBack: true })}
      <div class="auth-shell">
        <section class="panel auth-panel">${body}</section>
      </div>
      ${tabbar()}`;

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

  const intentLabels = (card) => {
    const ids = Array.isArray(card.intents) && card.intents.length ? card.intents : card.intent ? [card.intent] : [];
    return ids.map((id) => labelOf("intents", id)).filter(Boolean).join(", ");
  };

  const formatMultiline = (text) => escapeHtml(String(text || "")).replace(/\n/g, "<br>");

  const lookingLabel = (card) => {
    const raw = labelOf("looking_for", card.looking_for);
    return raw ? `ищет ${raw}` : "";
  };

  const profileMeta = (card, { height = false } = {}) => {
    const top = [
      card.city,
      card.job,
      height && card.height ? `${card.height} см` : "",
      labelOf("genders", card.gender),
    ].filter(Boolean);
    const seek = [lookingLabel(card), intentLabels(card)].filter(Boolean);
    const topHtml = top.map((b) => escapeHtml(String(b))).join(" · ");
    if (!seek.length) return topHtml;
    return `${topHtml}<div class="meta-seek">${seek.map((b) => escapeHtml(String(b))).join(" · ")}</div>`;
  };

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

  const pendingThumbs = (files) =>
    (files || [])
      .map((f) => `<div class="photo-cell" style="background-image:url('${URL.createObjectURL(f)}')"></div>`)
      .join("");

  const wirePendingPicker = (inputId, gridId, bucket, prefixHtml = "") => {
    const input = root.querySelector(`#${inputId}`);
    const grid = root.querySelector(`#${gridId}`);
    if (!input || !grid) return;
    input.addEventListener("change", () => {
      state[bucket].push(...input.files);
      grid.innerHTML = prefixHtml + pendingThumbs(state[bucket]) + filePicker(inputId);
      wirePendingPicker(inputId, gridId, bucket, prefixHtml);
    });
  };

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

  const inviteView = () => {
    const u = state.user || {};
    const days = u.ref_days || 30;
    return {
      html: `
      ${appHead()}
      <section class="panel">
        <h2>Анкета готова</h2>
        <p class="lede">Пригласи друга по ссылке — WIRING+ на ${days} дней будет и у тебя, и у него. Подарок за регистрацию, не за лайк.</p>
        ${
          u.ref_url
            ? `<div class="plus-box on">
          <div class="q">твоя ссылка</div>
          <div class="ref-row">
            <input id="ref-link" readonly value="${escapeAttr(u.ref_url)}">
            <button class="ghost slim" type="button" id="ref-copy">копировать</button>
          </div>
          <p class="hint">ссылка всегда есть в профиле</p>
        </div>`
            : `<p class="hint">ссылка для приглашений появится в профиле</p>`
        }
        <div class="actions" style="margin-top:16px">
          <button class="solid" type="button" id="invite-go">в ленту</button>
        </div>
      </section>
      ${tabbar()}`,
      bind() {
        const copyRef = root.querySelector("#ref-copy");
        if (copyRef) {
          copyRef.addEventListener("click", async () => {
            const link = (root.querySelector("#ref-link") || {}).value || "";
            try {
              if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
              else {
                const input = root.querySelector("#ref-link");
                if (input) {
                  input.select();
                  document.execCommand("copy");
                }
              }
              toast("ссылка скопирована");
            } catch {
              toast("не удалось скопировать");
            }
          });
        }
        root.querySelector("#invite-go")?.addEventListener("click", () => {
          goAfterInvite().catch((err) => toast(err.message));
        });
      },
    };
  };

  const cardHtml = (card, stacked) => {
    const photos = cardPhotos(card);
    const idx = stacked ? 0 : state.photoIndex % Math.max(photos.length, 1);
    const src = photoUrl(photos[idx] || card.photo, card.name);
    return `
    <article class="card ${stacked ? "stacked" : ""}">
      <div class="card-media">
        <img class="card-photo" src="${src}" alt="">
        <div class="stamp yes">YES</div>
        <div class="stamp no">NOPE</div>
        ${
          photos.length > 1 && !stacked
            ? `<div class="dots">${photos.map((_, i) => `<i class="${i === idx ? "on" : ""}"></i>`).join("")}</div>`
            : ""
        }
      </div>
      <div class="card-body">
        <div class="card-head">
          <h3>${card.online ? '<span class="online-dot"></span>' : ""}${escapeHtml(card.name)}, ${card.age}</h3>
          ${stacked ? "" : `<a class="card-more" href="${hrefFor("person", { id: card.id })}" id="open-person">анкета</a>`}
        </div>
        <div class="meta">${profileMeta(card)}</div>
        ${card.bio ? `<p class="bio">${formatMultiline(card.bio)}</p>` : ""}
        <div class="chips static">
          ${feedChipsHtml(card)}
        </div>
      </div>
    </article>`;
  };

  const emptyDeck = () => {
    const filtered =
      state.filters.neuro.length + state.filters.vibe.length + (state.filters.intents || []).length > 0 ||
      state.filters.city ||
      state.filters.min_age > 18 ||
      state.filters.max_age < 99;
    const hasPassed = Number(state.passed || 0) > 0;
    return emptyBox(
      filtered ? "По фильтрам никого нет" : "Анкеты на сегодня закончились",
      filtered
        ? "Сними часть фильтров — так лента снова откроется."
        : hasPassed
          ? "Пропущенные сами не вернутся. Можно вернуть их вручную — лайки и чаты не сбросятся."
          : "Можно ослабить фильтры или заглянуть позже.",
      `<div class="actions center">
          ${filtered ? `<button class="ghost" id="clear-filters">сбросить фильтры</button>` : ""}
          ${hasPassed ? `<button class="solid" id="restart">вернуть пропущенных</button>` : ""}
        </div>`
    );
  };

  const deckView = () => {
    const card = state.cards[state.index];
    const next = state.cards[state.index + 1];
    const left = Math.max(0, state.cards.length - state.index);
    return `
      ${appHead()}
      ${profileNudge()}
      <section class="panel deck-panel">
        <div class="deck-meta">
          <button type="button" class="ghost slim js-filters">${state.filtersOpen ? "скрыть фильтры" : "фильтры"}</button>
          <span class="hint">${state.recycled ? "снова пропущенные · " : ""}ещё ${left}</span>
        </div>
        ${
          state.user?.paused
            ? `<div class="nudge">анкета на паузе — тебя не показывают в чужой ленте.
                <div class="actions"><button class="ghost slim" id="unpause">снять паузу</button></div>
              </div>`
            : ""
        }
        ${
          state.filtersOpen
            ? `<div class="filters">
                ${pickerBlock("neuro", state.filters.neuro, { id: "f-neuro", lead: "фильтр по диагнозам. лента сужается, если выбрать сразу много." })}
                ${pickerBlock("vibe", state.filters.vibe, { id: "f-vibe", lead: "фильтр по вайбу." })}
                ${pickerBlock("intents", state.filters.intents || (state.filters.intents = []), { id: "f-intent", lead: "формат — можно несколько.", gloss: false })}
                <div class="filter-row">
                  <label>от<input id="min-age" type="number" min="18" max="99" value="${state.filters.min_age}"></label>
                  <label>до<input id="max-age" type="number" min="18" max="99" value="${state.filters.max_age}"></label>
                  <label>город${citySelect("f-city", state.filters.city, { required: false, allowEmpty: true, emptyLabel: "неважно", id: "f-city" })}</label>
                </div>
                <div class="filter-foot"><button type="button" class="ghost slim js-filters">скрыть фильтры</button></div>
              </div>`
            : ""
        }
        ${
          card
            ? `<div class="deck">
                 ${next ? cardHtml(next, true) : ""}
                 ${cardHtml(card, false)}
               </div>
               <div class="controls">
                 <button class="pass" id="no" aria-label="пропустить" title="пропустить">${ICONS.pass}</button>
                 <button class="undo" id="undo" aria-label="вернуть предыдущего" title="вернуть предыдущего">${ICONS.undo}</button>
                 ${state.user?.plus ? `<button class="snooze" id="later" aria-label="отложить на неделю" title="отложить на неделю">${ICONS.snooze}</button>` : ""}
                 <button class="like" id="yes" aria-label="${friendlyLike().label}" title="${friendlyLike().title}">${friendlyLike().icon}</button>
               </div>`
            : emptyDeck()
        }
      </section>
      ${tabbar()}`;
  };

  const promptList = (prompts) =>
    (prompts || [])
      .map(
        (p) => `
      <div class="prompt-card">
        <div class="q">${escapeHtml(labelOf("prompts", p.id))}</div>
        <p>${escapeHtml(p.answer)}</p>
      </div>`
      )
      .join("");

  const personBody = (p) => {
    const photos = cardPhotos(p);
    const idx = state.photoIndex % Math.max(photos.length, 1);
    return `
      <div class="person-hero">
        <img class="card-photo" src="${photoUrl(photos[idx] || p.photo, p.name)}" alt="">
        ${
          photos.length > 1
            ? `<div class="dots">${photos.map((_, i) => `<i class="${i === idx ? "on" : ""}"></i>`).join("")}</div>`
            : ""
        }
        <div class="card-body">
          <h3>${p.online ? '<span class="online-dot"></span>' : ""}${escapeHtml(p.name)}, ${p.age}</h3>
          <div class="meta">${profileMeta(p, { height: true })}</div>
        </div>
      </div>
      ${
        photos.length > 1
          ? `<div class="photo-strip">${photos
              .map(
                (url, i) =>
                  `<button type="button" class="${i === idx ? "on" : ""}" data-photo="${i}"><img src="${avatarUrl(url, p.name)}" alt=""></button>`
              )
              .join("")}</div>`
          : ""
      }
      ${p.bio ? `<p class="lede bio-text">${formatMultiline(p.bio)}</p>` : ""}
      ${p.communication ? `<div class="prompt-card"><div class="q">как тебе писать</div><p>${escapeHtml(p.communication)}</p></div>` : ""}
      <div class="chips static" style="margin:12px 0">
        ${(p.neuro || []).map((id) => chipMark("neuro", id, "on")).join("")}
        ${(p.vibe || []).map((id) => chipMark("vibe", id, "on")).join("")}
      </div>
      <div class="form" style="gap:10px">${promptList(p.prompts)}</div>`;
  };

  const personView = () => {
    const p = state.person;
    if (!p) return deckView();
    const fromDeck = state.personFrom === "deck" || state.personFrom === "likes";
    return `
      ${appHead()}
      <section class="panel">
        <a class="ghost slim person-back" href="${hrefFor(state.personFrom === "likes" ? "likes" : state.personFrom === "matches" || state.personFrom === "chat" ? "matches" : "deck")}" data-nav="${state.personFrom === "likes" ? "likes" : state.personFrom === "matches" || state.personFrom === "chat" ? "matches" : "deck"}">← назад</a>
        ${personBody(p)}
        <div class="actions" style="margin-top:16px">
          ${fromDeck ? `<button class="pass" id="no" aria-label="пропустить" title="пропустить">${ICONS.pass}</button>${state.user?.plus ? `<button class="ghost" id="later" title="отложить на неделю">отложить</button>` : ""}<button class="like" id="yes" aria-label="${friendlyLike().label}" title="${friendlyLike().title}">${friendlyLike().icon}</button>` : ""}
          ${p.matched ? `<button class="solid" id="open-chat">написать</button>` : ""}
        </div>
        <div class="safety">
          ${p.matched ? `<button class="ghost slim" id="unmatch">размэтчить</button>` : ""}
          ${p.matched ? `<button class="ghost slim" id="block">в блок</button>` : ""}
          <button class="ghost slim" id="report">пожаловаться</button>
        </div>
      </section>
      ${tabbar()}`;
  };

  const likesGate = () => {
    if (state.user?.plus || !state.likes.length) return "";
    if (state.user?.guest) {
      return `<div class="plus-box likes-gate">
        <p class="hint">Без своего профиля и WIRING+ не видно, кто лайкнул. Собери аккаунт, потом открой анкеты.</p>
        <a class="solid" href="${hrefFor("register")}" data-nav="register">создать профиль</a>
      </div>`;
    }
    return `<div class="plus-box likes-gate">
      <p class="hint">Без WIRING+ фото скрыты. Открой, кто лайкнул — и ответь взаимно, если захочешь.</p>
      <label>промокод<input id="plus-code" maxlength="24" placeholder="если есть код"></label>
      <button class="ghost slim" type="button" id="plus-redeem">открыть, кто лайкнул</button>
    </div>`;
  };

  const likesView = () => {
    if (!state.likesFilters.intents) state.likesFilters.intents = [];
    const card = (m) => {
      if (m.hidden || !m.id) {
        return `<article class="like-card locked" data-plus-gate>
          <div class="like-card-media locked-face" aria-hidden="true"><i></i></div>
          <div class="like-card-body">
            <h3>кто-то лайкнул</h3>
            <p class="meta">лайкнул тебя</p>
          </div>
        </article>`;
      }
      const bio = (m.bio || m.communication || "").trim();
      return `<a class="like-card" data-person="${m.id}" data-from="likes" href="${hrefFor("person", { id: m.id })}">
        <div class="like-card-media"><img src="${photoUrl(m.photo, m.name)}" alt=""></div>
        <div class="like-card-body">
          <h3>${escapeHtml(m.name)}, ${m.age}</h3>
          <p class="meta">${escapeHtml(m.city || "")}${intentLabels(m) ? ` · ${escapeHtml(intentLabels(m))}` : ""}</p>
          ${bio ? `<p class="like-bio">${escapeHtml(bio.slice(0, 140))}${bio.length > 140 ? "…" : ""}</p>` : ""}
          <span class="like-cta">открыть анкету</span>
        </div>
      </a>`;
    };
    const emptyHint =
      (state.matches || []).length
        ? "Новых лайков нет — взаимные уже в Чатах. Когда кто-то лайкнет тебя первым, анкета появится здесь."
        : "Когда кто-то лайкнет тебя первым, анкета появится здесь. Можно ответить лайком или пропустить.";
    return `
    ${appHead()}
    ${profileNudge()}
    <section class="panel">
      <h2>Кто лайкнул</h2>
      ${likesGate()}
      <div class="deck-meta">
        <button type="button" class="ghost slim" id="likes-filters-toggle">${state.likesFiltersOpen ? "скрыть фильтры" : "фильтры"}</button>
        <span class="hint">${state.likes.length ? `${state.likes.length}` : ""}</span>
      </div>
      ${
        state.likesFiltersOpen
          ? `<div class="filters">
              ${pickerBlock("neuro", state.likesFilters.neuro, { id: "l-neuro", lead: "диагнозы в лайках.", gloss: false })}
              ${pickerBlock("vibe", state.likesFilters.vibe, { id: "l-vibe", lead: "вайб.", gloss: false })}
              ${pickerBlock("intents", state.likesFilters.intents, { id: "l-intent", lead: "формат.", gloss: false })}
              <div class="filter-row">
                <label>от<input id="l-min-age" type="number" min="18" max="99" value="${state.likesFilters.min_age}"></label>
                <label>до<input id="l-max-age" type="number" min="18" max="99" value="${state.likesFilters.max_age}"></label>
                <label>город${citySelect("l-city", state.likesFilters.city, { required: false, allowEmpty: true, emptyLabel: "неважно", id: "l-city" })}</label>
              </div>
              <div class="filter-foot"><button type="button" class="ghost slim" id="likes-filters-clear">сбросить</button></div>
            </div>`
          : ""
      }
      ${
        state.likes.length
          ? `<div class="like-cards">${state.likes.map(card).join("")}</div>`
          : emptyBox("Пока пусто", emptyHint)
      }
    </section>
    ${tabbar()}`;
  };

  const matchesView = () => `
    ${appHead()}
    ${profileNudge()}
    <section class="panel">
      <h2>Чаты</h2>
      ${
        state.matches.length
          ? `<div class="match-list">${state.matches
              .map((m) =>
                `<div class="match-wrap">
                  ${matchRow(m, {
                    href: hrefFor("chat", { id: m.id }),
                    attrs: `data-open="${m.id}"`,
                    sub: m.last_message
                      ? `${state.user?.id && m.last_from_id === state.user.id ? "ты: " : ""}${escapeHtml(m.last_message)}`
                      : "взаимно · напиши первым",
                    time: timeLabel(m.last_at),
                    unread: m.unread || 0,
                  })}
                  <button type="button" class="match-remove" data-unmatch="${m.id}" aria-label="убрать из чатов" title="убрать из чатов">×</button>
                </div>`
              )
              .join("")}</div>`
          : emptyBox("Пока тихо", "Лайкни анкету. Если человек ответит тем же — здесь появится переписка.")
      }
    </section>
    ${tabbar()}`;

  const bubbleHtml = (m) => {
    const quote = m.reply_to
      ? `<div class="bubble-quote">${m.reply_to.has_photo && !m.reply_to.body ? "фото" : escapeHtml(m.reply_to.body || "фото")}</div>`
      : "";
    const photo = m.photo_url
      ? `<a class="bubble-photo" href="${escapeAttr(m.photo_url)}" target="_blank" rel="noopener"><img src="${escapeAttr(m.photo_url)}" alt="" loading="lazy"></a>`
      : "";
    const text = m.body ? `<div class="bubble-body">${escapeHtml(m.body)}</div>` : "";
    const replyLabel = m.photo_url && !m.body ? "фото" : m.body || "фото";
    return `<div class="bubble ${m.mine ? "mine" : ""}${m.photo_url ? " has-photo" : ""}" data-msg="${m.id}">${quote}${photo}${text}<span class="time"><button type="button" class="bubble-reply" data-reply="${m.id}" data-reply-body="${escapeAttr(replyLabel)}" title="ответить" aria-label="ответить">ответить</button>${timeLabel(m.created_at)}${
      m.mine
        ? `<i class="receipt${m.read ? " on" : ""}" title="${m.read ? "прочитано" : "отправлено"}">${m.read ? "✓✓" : "✓"}</i>`
        : ""
    }</span></div>`;
  };

  const threadInner = (t) => {
    if ((t.messages || []).length) return t.messages.map(bubbleHtml).join("");
    return `<p class="hint">Напиши первым. Подсказки по анкете — ткни, отредактируй и отправь.</p>
       <div class="openers">${(t.openers || [])
         .map((o) => `<button type="button" class="ghost slim opener">${escapeHtml(o)}</button>`)
         .join("")}</div>`;
  };

  const scrollThreadEnd = () => {
    const box = root.querySelector("#thread");
    if (box) box.scrollTop = box.scrollHeight;
  };

  let sendChatMessage = async (_body) => {};

  const bindChatThreadActions = () => {
    root.querySelectorAll("[data-reply]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.replyTo = { id: Number(btn.dataset.reply), body: btn.dataset.replyBody || "" };
        render();
        root.querySelector("#composer input[name='body']")?.focus();
      });
    });
    root.querySelectorAll(".opener").forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = root.querySelector("#composer input[name='body']");
        if (!field) return;
        field.value = btn.textContent || "";
        field.focus();
        try { field.setSelectionRange(field.value.length, field.value.length); } catch (_) {}
      });
    });
    const replyCancel = root.querySelector("#reply-cancel");
    if (replyCancel) {
      replyCancel.addEventListener("click", () => {
        state.replyTo = null;
        root.querySelector(".reply-bar")?.remove();
      });
    }
  };

  const bindComposer = () => {
    const composer = root.querySelector("#composer");
    sendChatMessage = async (body) => {
      if (!state.thread?.peer?.id) return;
      const textBody = String(body || "").trim();
      if (!textBody) return;
      const payload = { to_id: state.thread.peer.id, body: textBody };
      if (state.replyTo?.id) payload.reply_to_id = state.replyTo.id;
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.replyTo = null;
      root.querySelector(".reply-bar")?.remove();
      const fresh = await api(`/api/messages/${state.thread.peer.id}`);
      applyThread(fresh, { scroll: true });
      requestAnimationFrame(() => {
        const field = root.querySelector("#composer input[name='body']");
        if (field) {
          field.focus();
          try { field.setSelectionRange(field.value.length, field.value.length); } catch (_) {}
        }
        pinChatHeight();
        scrollThreadEnd();
      });
    };
    const sendChatPhoto = async (file) => {
      if (!state.thread?.peer?.id || !file) return;
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append("to_id", String(state.thread.peer.id));
      fd.append("file", blob, "photo.jpg");
      const caption = String(root.querySelector("#composer input[name='body']")?.value || "").trim();
      if (caption) fd.append("body", caption.slice(0, 500));
      if (state.replyTo?.id) fd.append("reply_to_id", String(state.replyTo.id));
      toast("отправляю фото…");
      await api("/api/messages/photo", { method: "POST", body: fd });
      state.replyTo = null;
      root.querySelector(".reply-bar")?.remove();
      const field = root.querySelector("#composer input[name='body']");
      if (field) field.value = "";
      const fresh = await api(`/api/messages/${state.thread.peer.id}`);
      applyThread(fresh, { scroll: true });
      requestAnimationFrame(() => {
        pinChatHeight();
        scrollThreadEnd();
      });
    };
    if (!composer) return;
    const field = composer.querySelector("input[name='body']");
    const afterKeyboard = () => {
      pinChatHeight();
      requestAnimationFrame(() => {
        pinChatHeight();
        scrollThreadEnd();
      });
    };
    field?.addEventListener("focus", afterKeyboard);
    field?.addEventListener("input", () => {
      requestAnimationFrame(scrollThreadEnd);
    });
    const photoInput = root.querySelector("#chat-photo");
    if (photoInput) {
      photoInput.addEventListener("change", async () => {
        const file = photoInput.files?.[0];
        photoInput.value = "";
        if (!file) return;
        try {
          await sendChatPhoto(file);
        } catch (err) {
          toast(err.message);
        }
      });
    }
    composer.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = new FormData(composer).get("body");
      try {
        if (field) field.value = "";
        await sendChatMessage(body);
      } catch (err) {
        toast(err.message);
      }
    });
    bindChatThreadActions();
  };

  const chatView = () => {
    const t = state.thread;
    if (!t) return matchesView();
    const reply = state.replyTo;
    return `
      ${appHead()}
      <section class="panel chat-panel">
        <div class="deck-meta">
          <a class="ghost slim" href="${hrefFor("matches")}" data-nav="matches">← чаты</a>
          <a class="ghost slim" href="${hrefFor("person", { id: t.peer.id })}" data-person="${t.peer.id}" data-from="chat">анкета</a>
        </div>
        <h2>${escapeHtml(t.peer.name)}</h2>
        <div class="thread" id="thread">${threadInner(t)}</div>
        ${
          reply
            ? `<div class="reply-bar"><span>ответ: ${escapeHtml((reply.body || "").slice(0, 90))}</span><button type="button" class="ghost slim" id="reply-cancel">×</button></div>`
            : ""
        }
        <form class="composer" id="composer">
          <label class="composer-attach" title="фото" aria-label="прикрепить фото">
            ${ICONS.photo}
            <input type="file" id="chat-photo" accept="image/*" hidden>
          </label>
          <input name="body" maxlength="1000" placeholder="сообщение" autocomplete="off" enterkeyhint="send">
          <button class="solid" type="submit">отправить</button>
        </form>
      </section>`;
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

  const onboardView = () => {
    const u = state.user;
    const prompts = (u.prompts || []).map((p) => ({ ...p }));
    if (!prompts.length) prompts.push({ id: "special", answer: "" });
    const photos = Array.isArray(u.photos) && u.photos.length && typeof u.photos[0] === "object" ? u.photos : [];
    return {
      html: `
      ${appHead()}
      <section class="panel">
        <h2>Ещё чуть-чуть</h2>
        <p class="lede">Два фото и один промпт сильно лучше пустой анкеты. Можно пропустить, но тогда тебя труднее узнать.</p>
        <form class="form" id="onboard">
          <div>
            <div class="hint">фото — хотя бы ещё одно</div>
            <div class="photo-grid" id="onboard-photos">
              ${photos.map((ph) => `<div class="photo-cell" style="background-image:url('${photoUrl(ph.url, u.name)}')"></div>`).join("")}
              ${pendingThumbs(state.onboardFiles)}
              ${filePicker("onboard-files")}
            </div>
          </div>
          <label class="city-field">город${citySelect("city", u.city)}</label>
          <label>как тебе писать<textarea name="communication" maxlength="280" placeholder="сразу по делу, голосовые ок / нет">${escapeHtml(u.communication || "")}</textarea></label>
          <div>
            <div class="hint">один промпт</div>
            ${promptFields(prompts.slice(0, 1))}
          </div>
          <div class="err" id="err"></div>
          <div class="actions">
            <button class="solid" type="submit">дальше в ленту</button>
            <button class="ghost" type="button" id="skip-onboard">пропустить</button>
          </div>
        </form>
      </section>
      ${tabbar()}`,
      bind() {
        bindPrompts(prompts);
        const onboardSaved = photos
          .map((ph) => `<div class="photo-cell" style="background-image:url('${photoUrl(ph.url, u.name)}')"></div>`)
          .join("");
        wirePendingPicker("onboard-files", "onboard-photos", "onboardFiles", onboardSaved);
        root.querySelector("#skip-onboard").addEventListener("click", async () => {
          await api("/api/onboard/skip", { method: "POST" });
          await refreshMe();
          state.view = "deck";
          await loadFeed();
          render();
        });
        root.querySelector("#onboard").addEventListener("submit", async (e) => {
          e.preventDefault();
          const form = new FormData(e.target);
          const payload = {
            name: u.name,
            age: u.age,
            city: form.get("city"),
            gender: u.gender,
            looking_for: u.looking_for,
            bio: u.bio,
            job: u.job || "",
            intent: u.intent || "dating",
            height: u.height || "",
            communication: form.get("communication") || "",
            neuro: u.neuro || [],
            vibe: u.vibe || [],
            prompts: prompts.filter((p) => String(p.answer || "").trim().length >= 4),
          };
          try {
            for (const file of state.onboardFiles) {
              await uploadPhoto(file);
            }
            state.onboardFiles = [];
            const data = await api("/api/me", { method: "PATCH", body: JSON.stringify(payload) });
            state.user = data.user;
            if (state.user.needs_onboard) {
              await api("/api/onboard/skip", { method: "POST" });
              await refreshMe();
            }
            state.view = "deck";
            await loadFeed();
            render();
          } catch (err) {
            root.querySelector("#err").textContent = err.message;
          }
        });
      },
    };
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
          ${pickerBlock("neuro", neuro, { lead: "свои диагнозы и расстройства — хотя бы одно. Нажми «?» на теге — коротко, что это." })}
          ${pickerBlock("vibe", vibe, { lead: "вайб анкеты — как с тобой лучше быть." })}
          <label>о себе<textarea name="bio" maxlength="1200" placeholder="специальный интерес, сенсорные лимиты, чего лучше не делать">${escapeHtml(bioVal)}</textarea></label>
          <label>как тебе писать<textarea name="communication" maxlength="280" placeholder="голосовые ок / нет, small talk — сразу в блок">${escapeHtml(communicationVal)}</textarea></label>
          <div>
            <div class="hint">промпты — до трёх</div>
            ${promptFields(prompts)}
          </div>
          <div class="plus-box">
            <div class="q">тема</div>
            <p class="hint">пять гамм: день, пастель, сумерки, ночь и полночь. кнопка оформления в шапке тоже переключает.</p>
            ${themeSwatches()}
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
          <div class="plus-box${u.plus ? " on" : ""}">
            <div class="q">${u.plus ? "WIRING+ включён" : "WIRING+ выключен"}</div>
            ${
              u.plus
                ? `<p class="hint">до ${plusUntil(u.plus_until)}</p>
                   <label class="check"><input id="plus-incognito" type="checkbox" ${u.incognito ? "checked" : ""}> инкогнито — меня не показывают, пока я сам не лайкну</label>
                   <label class="check"><input id="plus-paused" type="checkbox" ${u.paused ? "checked" : ""}> пауза — временно скрыть анкету</label>`
                : `<p class="hint">спокойный режим: видно, кто лайкнул, инкогнито, пауза, заметки, отложить человека. сиды в ленте остаются.</p>
                   <label>промокод<input id="plus-code" maxlength="24" placeholder="если есть код"></label>
                   <button class="ghost slim" type="button" id="plus-redeem">активировать</button>`
            }
          </div>
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
        ${footer()}
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
        root.querySelector("#kill").addEventListener("click", async () => {
          if (!confirm("Удалить аккаунт, фото и переписку безвозвратно?")) return;
          await api("/api/me", { method: "DELETE" });
          state.user = null;
          clearProfileDraft();
          state.view = "home";
          stopInbox();
          render();
        });
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
        const savePlus = async (patch) => {
          try {
            const data = await api("/api/plus", { method: "PATCH", body: JSON.stringify(patch) });
            state.user = data.user;
            toast("сохранено");
          } catch (err) {
            toast(err.message);
          }
        };
        const incognito = root.querySelector("#plus-incognito");
        if (incognito) incognito.addEventListener("change", () => savePlus({ incognito: incognito.checked }));
        const paused = root.querySelector("#plus-paused");
        if (paused) paused.addEventListener("change", () => savePlus({ paused: paused.checked }));
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

  const reportPerson = async (id) => {
    const reasons = state.catalog.report_reasons || [];
    if (!reasons.length) return;
    state.reportFor = id;
    state.reportReason = reasons[0].id;
    state.reportDetails = "";
    render();
  };

  const reportModal = () => {
    if (!state.reportFor) return "";
    const reasons = state.catalog.report_reasons || [];
    return `<div class="modal-back" id="report-modal">
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="жалоба">
        <h3>Пожаловаться</h3>
        <p class="hint">Выбери причину. Человек скроется из ленты и чатов.</p>
        <div class="report-reasons">
          ${reasons
            .map(
              (r) =>
                `<label class="check"><input type="radio" name="report-reason" value="${escapeAttr(r.id)}" ${
                  r.id === state.reportReason ? "checked" : ""
                }> ${escapeHtml(r.label)}</label>`
            )
            .join("")}
        </div>
        <label>коротко, если нужно<textarea id="report-details" maxlength="280" rows="3">${escapeHtml(state.reportDetails || "")}</textarea></label>
        <div class="actions">
          <button type="button" class="danger" id="report-send">отправить</button>
          <button type="button" class="ghost" id="report-cancel">отмена</button>
        </div>
      </div>
    </div>`;
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

  const threadDelta = (prev, next) => {
    if ((prev || []).length !== (next || []).length) return "new";
    for (let i = 0; i < next.length; i += 1) {
      if (Boolean(prev[i]?.read) !== Boolean(next[i]?.read)) return "read";
    }
    return "";
  };

  const applyThread = (fresh, { scroll = false } = {}) => {
    const kind = threadDelta(state.thread?.messages || [], fresh.messages || []);
    const field = root.querySelector("#composer input");
    const draft = field?.value || "";
    const hadFocus = document.activeElement === field;
    state.thread = fresh;
    if (!kind && !scroll) return;
    // Keep composer alive on poll updates — full re-render breaks typing on mobile.
    if (state.view === "chat" && root.querySelector("#composer") && (kind === "new" || kind === "read" || scroll)) {
      const thread = root.querySelector("#thread");
      if (thread) {
        thread.innerHTML = threadInner(fresh);
        bindChatThreadActions();
      }
      if (field && draft) field.value = draft;
      if (hadFocus && field) field.focus();
      if (scroll || kind === "new") scrollThreadEnd();
      return;
    }
    render();
    const input = root.querySelector("#composer input");
    if (input && draft) input.value = draft;
    if (hadFocus && input) input.focus();
    if (scroll || kind === "new") scrollThreadEnd();
  };

  const openChat = async (id) => {
    const data = await api(`/api/messages/${id}`);
    state.thread = data;
    state.view = "chat";
    render();
    const box = root.querySelector("#thread");
    if (box) box.scrollTop = box.scrollHeight;
    clearInterval(chatTimer);
    chatTimer = setInterval(async () => {
      if (state.view !== "chat" || !state.thread || state.thread.peer.id !== id) return;
      try {
        const fresh = await api(`/api/messages/${id}`);
        applyThread(fresh);
      } catch {
        /* keep current thread */
      }
    }, 8000);
  };

  const resumeApp = async () => {
    if (!state.user) return;
    const draft = root.querySelector("#composer input")?.value || "";
    await pollInbox();
    try {
      if (state.view === "matches") {
        const data = await api("/api/matches");
        state.matches = data.matches;
        render();
      } else if (state.view === "chat" && state.thread?.peer?.id) {
        const fresh = await api(`/api/messages/${state.thread.peer.id}`);
        applyThread(fresh, { scroll: true });
        const input = root.querySelector("#composer input");
        if (input && draft) input.value = draft;
      } else if (state.view === "likes") {
        await loadLikes();
        render();
      }
    } catch {
      /* offline or sleeping radio */
    }
  };

  const cyclePhoto = (dir) => {
    const card = state.view === "person" ? state.person : state.cards[state.index];
    const photos = card ? cardPhotos(card) : [];
    if (photos.length < 2) return false;
    state.photoIndex = (state.photoIndex + dir + photos.length) % photos.length;
    const idx = state.photoIndex % photos.length;
    const src = photoUrl(photos[idx] || card.photo, card.name);
    const img = root.querySelector(state.view === "person" ? ".person-hero .card-photo" : ".card:not(.stacked) .card-photo");
    const dots = root.querySelectorAll(state.view === "person" ? ".person-hero .dots i" : ".card:not(.stacked) .dots i");
    const strip = root.querySelectorAll(".photo-strip button");
    if (img) {
      img.style.opacity = "0.35";
      const next = new Image();
      next.onload = () => {
        img.src = src;
        img.style.transition = "opacity 0.18s ease";
        img.style.opacity = "1";
      };
      next.src = src;
      if (next.complete) {
        img.src = src;
        img.style.transition = "opacity 0.18s ease";
        img.style.opacity = "1";
      }
    } else {
      render();
      return true;
    }
    dots.forEach((dot, i) => dot.classList.toggle("on", i === idx));
    strip.forEach((btn, i) => btn.classList.toggle("on", i === idx));
    return true;
  };

  const wireDeck = () => {
    root.querySelectorAll(".js-filters").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        state.filtersOpen = !state.filtersOpen;
        render();
      });
    });
    if (state.filtersOpen) {
      if (!state.filters.intents) state.filters.intents = [];
      bindChips({ neuro: state.filters.neuro, vibe: state.filters.vibe, intents: state.filters.intents });
      const apply = async () => {
        persistFilters();
        await loadFeed();
        render();
      };
      root.querySelectorAll("#f-neuro .chip, #f-vibe .chip, #f-intent .chip").forEach((btn) => {
        btn.addEventListener("click", apply);
      });
      const minAge = root.querySelector("#min-age");
      const maxAge = root.querySelector("#max-age");
      const city = root.querySelector("#f-city");
      if (minAge) minAge.addEventListener("change", async () => {
        state.filters.min_age = Number(minAge.value) || 18;
        await apply();
      });
      if (maxAge) maxAge.addEventListener("change", async () => {
        state.filters.max_age = Number(maxAge.value) || 99;
        await apply();
      });
      if (city) {
        const applyCity = async () => {
          state.filters.city = city.value.trim();
          await apply();
        };
        city.addEventListener("change", applyCity);
        city.addEventListener("blur", applyCity);
      }
    }
    const clear = root.querySelector("#clear-filters");
    if (clear) {
      clear.addEventListener("click", async () => {
        state.filters = { neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "", real_only: false };
        persistFilters();
        await loadFeed();
        render();
      });
    }
    const restartBtn = root.querySelector("#restart");
    if (restartBtn) restartBtn.addEventListener("click", () => restart());
    const yes = root.querySelector("#yes");
    const no = root.querySelector("#no");
    const undo = root.querySelector("#undo");
    if (yes) yes.addEventListener("click", () => swipe("like"));
    if (no) no.addEventListener("click", () => swipe("pass"));
    const later = root.querySelector("#later");
    if (later) later.addEventListener("click", () => swipe("snooze"));
    if (undo) undo.addEventListener("click", () => rewind());
    const unpause = root.querySelector("#unpause");
    if (unpause) {
      unpause.addEventListener("click", async () => {
        const data = await api("/api/plus", { method: "PATCH", body: JSON.stringify({ paused: false }) });
        state.user = data.user;
        render();
      });
    }
    const more = root.querySelector("#open-person");
    if (more) {
      more.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const card = state.cards[state.index];
        if (card) openPerson(card.id, "deck");
      });
    }
    const card = root.querySelector(".card:not(.stacked)");
    if (!card) return;
    let x0 = 0;
    let y0 = 0;
    let dx = 0;
    let dy = 0;
    let axis = "";
    let tracking = false;
    const THRESHOLD = 130;
    const start = (x, y) => {
      tracking = true;
      axis = "";
      x0 = x;
      y0 = y;
      dx = 0;
      dy = 0;
    };
    const move = (x, y) => {
      if (!tracking) return;
      dx = x - x0;
      dy = y - y0;
      if (!axis && (Math.abs(dx) > 14 || Math.abs(dy) > 14)) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
      }
      if (axis !== "x") return;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      card.querySelector(".stamp.yes").style.opacity = dx > 24 ? Math.min(1, (dx - 24) / 90) : 0;
      card.querySelector(".stamp.no").style.opacity = dx < -24 ? Math.min(1, (-dx - 24) / 90) : 0;
    };
    const end = (ev) => {
      if (!tracking) return;
      tracking = false;
      if (axis === "x" && dx > THRESHOLD) swipe("like");
      else if (axis === "x" && dx < -THRESHOLD) swipe("pass");
      else if (axis === "x" && Math.abs(dx) > 40) {
        cyclePhoto(dx < 0 ? 1 : -1);
        card.style.transition = "transform 0.2s ease";
        card.style.transform = "";
        card.querySelectorAll(".stamp").forEach((s) => (s.style.opacity = 0));
        setTimeout(() => (card.style.transition = ""), 200);
      } else if (axis === "y" && Math.abs(dy) > 40) {
        cyclePhoto(dy < 0 ? 1 : -1);
        card.style.transition = "transform 0.2s ease";
        card.style.transform = "";
      } else if (!axis && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        const rect = (card.querySelector(".card-media") || card).getBoundingClientRect();
        const x = (ev && ev.clientX) || x0;
        if (x < rect.left + rect.width * 0.32) cyclePhoto(-1);
        else if (x > rect.right - rect.width * 0.32) cyclePhoto(1);
        else {
          card.style.transition = "transform 0.2s ease";
          card.style.transform = "";
        }
      } else {
        card.style.transition = "transform 0.2s ease";
        card.style.transform = "";
        card.querySelectorAll(".stamp").forEach((s) => (s.style.opacity = 0));
        setTimeout(() => (card.style.transition = ""), 200);
      }
      axis = "";
    };
    card.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest("#open-person, .has-tip, .card-extra")) return;
      card.setPointerCapture(e.pointerId);
      start(e.clientX, e.clientY);
    });
    card.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  };

  const wirePerson = () => {
    const hero = root.querySelector(".person-hero");
    if (hero) {
      let x0 = 0;
      let y0 = 0;
      let dx = 0;
      let dy = 0;
      let axis = "";
      let tracking = false;
      let swiped = false;
      hero.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target.closest("[data-photo]")) return;
        tracking = true;
        swiped = false;
        axis = "";
        x0 = e.clientX;
        y0 = e.clientY;
        dx = 0;
        dy = 0;
        hero.setPointerCapture(e.pointerId);
      });
      hero.addEventListener("pointermove", (e) => {
        if (!tracking) return;
        dx = e.clientX - x0;
        dy = e.clientY - y0;
        if (!axis && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
          axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }
      });
      const finish = () => {
        if (!tracking) return;
        tracking = false;
        if (axis === "x" && Math.abs(dx) > 36) {
          swiped = cyclePhoto(dx < 0 ? 1 : -1);
        }
      };
      hero.addEventListener("pointerup", finish);
      hero.addEventListener("pointercancel", finish);
      hero.addEventListener("click", (e) => {
        if (e.target.closest("[data-photo]")) return;
        if (swiped) {
          e.preventDefault();
          e.stopPropagation();
          swiped = false;
          return;
        }
        const rect = hero.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width * 0.4) cyclePhoto(-1);
        else cyclePhoto(1);
      });
    }
    root.querySelectorAll("[data-photo]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.photoIndex = Number(btn.dataset.photo) || 0;
        render();
      });
    });
    const yes = root.querySelector("#yes");
    const no = root.querySelector("#no");
    if (yes) yes.addEventListener("click", () => swipe("like"));
    if (no) no.addEventListener("click", () => swipe("pass"));
    const later = root.querySelector("#later");
    if (later) later.addEventListener("click", () => swipe("snooze"));
    const chat = root.querySelector("#open-chat");
    if (chat) chat.addEventListener("click", () => openChat(state.person.id));
    const block = root.querySelector("#block");
    if (block) {
      block.addEventListener("click", async () => {
        if (!confirm("Скрыть этого человека из ленты и чатов?")) return;
        await api("/api/block", { method: "POST", body: JSON.stringify({ user_id: state.person.id }) });
        toast("в блоке");
        state.person = null;
        state.view = "deck";
        await loadFeed();
        render();
      });
    }
    const unmatch = root.querySelector("#unmatch");
    if (unmatch) {
      unmatch.addEventListener("click", async () => {
        if (!confirm("Убрать мэтч? Переписка пропадёт, анкета уйдёт к пропущенным.")) return;
        await api("/api/unmatch", { method: "POST", body: JSON.stringify({ user_id: state.person.id }) });
        state.person = null;
        state.view = "matches";
        const data = await api("/api/matches");
        state.matches = data.matches;
        toast("убрано · в пропущенных");
        render();
      });
    }
    const report = root.querySelector("#report");
    if (report) report.addEventListener("click", () => reportPerson(state.person.id));
  };

  const loadFeed = async () => {
    const q = new URLSearchParams();
    if (state.filters.neuro.length) q.set("neuro", state.filters.neuro.join(","));
    if (state.filters.vibe.length) q.set("vibe", state.filters.vibe.join(","));
    if ((state.filters.intents || []).length) q.set("intent", state.filters.intents.join(","));
    if (state.filters.min_age && state.filters.min_age !== 18) q.set("min_age", String(state.filters.min_age));
    if (state.filters.max_age && state.filters.max_age !== 99) q.set("max_age", String(state.filters.max_age));
    if (state.filters.city) q.set("city", state.filters.city);
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
  };

  const AUTH_FEATURE_VIEWS = new Set(["login", "register", "forgot", "verify", "reset"]);
  let authFeatureUnmount = null;
  let authFeatureModulePromise = null;

  const loadAuthFeatureModule = () => {
    authFeatureModulePromise ??= import(`${BASE}/public/dist/auth.js?v=2`);
    return authFeatureModulePromise;
  };

  let homeFeatureUnmount = null;
  let homeFeatureModulePromise = null;

  const loadHomeFeatureModule = () => {
    homeFeatureModulePromise ??= import(`${BASE}/public/dist/home.js?v=10`);
    return homeFeatureModulePromise;
  };

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
      hrefFor,
      navigate: (view) => {
        void goToView(view);
      },
      onThemeSelect: (theme) => {
        applyTheme(theme);
      },
    };
  };

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
    if (!state.user && ["deck", "likes", "matches", "profile", "person", "chat"].includes(next)) {
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
    if (next !== "profile") clearProfileDraft();
    if (state.view === "deck" && state.user) await loadFeed();
    if (state.view === "matches" && state.user) {
      const data = await api("/api/matches");
      state.matches = data.matches;
      state.thread = null;
      await refreshMe();
    }
    if (state.view === "likes" && state.user) {
      await loadLikes();
      await refreshMe();
    }
    if (state.view === "profile" && state.user && !state.profileDraft) await refreshMe();
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
      const mod = await loadAuthFeatureModule();
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
      const mod = await loadHomeFeatureModule();
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

  const render = () => {
    if (state.view === "profile") {
      captureProfileDraft();
      profileScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    }
    document.documentElement.dataset.view = state.view;
    document.documentElement.toggleAttribute("data-tabs", showsTabbar());
    if (state.view !== "chat") clearInterval(chatTimer);
    let bound = null;
    if (!AUTH_FEATURE_VIEWS.has(state.view)) {
      authFeatureUnmount?.();
      authFeatureUnmount = null;
    }
    if (state.view !== "home") {
      homeFeatureUnmount?.();
      homeFeatureUnmount = null;
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
    else if (state.view === "chat") root.innerHTML = chatView();
    else if (state.view === "matches") root.innerHTML = matchesView();
    else if (state.view === "likes") root.innerHTML = likesView();
    else if (state.view === "person") root.innerHTML = personView();
    else if (state.view === "profile") bound = profileView();
    else if (state.view === "onboard") bound = onboardView();
    else if (state.view === "invite") bound = inviteView();
    else root.innerHTML = deckView();

    if (bound) {
      root.innerHTML = bound.html;
      bound.bind();
    }
    if (state.view === "profile") {
      requestAnimationFrame(() => window.scrollTo(0, profileScrollY));
    }
    if (state.reportFor) root.insertAdjacentHTML("beforeend", reportModal());
    bindDataNavLinks();
    root.querySelectorAll("[data-unmatch]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = Number(btn.dataset.unmatch);
        if (!id || !confirm("Убрать из чатов? Переписка пропадёт, анкета уйдёт к пропущенным.")) return;
        try {
          await api("/api/unmatch", { method: "POST", body: JSON.stringify({ user_id: id }) });
          state.matches = (state.matches || []).filter((m) => m.id !== id);
          if (state.thread?.peer?.id === id) {
            state.thread = null;
            state.view = "matches";
          }
          toast("убрано · в пропущенных");
          render();
        } catch (err) {
          toast(err.message);
        }
      });
    });
    const reportCancel = root.querySelector("#report-cancel");
    if (reportCancel) {
      reportCancel.addEventListener("click", () => {
        state.reportFor = null;
        render();
      });
    }
    const reportSend = root.querySelector("#report-send");
    if (reportSend) {
      reportSend.addEventListener("click", async () => {
        const picked = root.querySelector('input[name="report-reason"]:checked')?.value;
        const details = root.querySelector("#report-details")?.value || "";
        if (!picked || !state.reportFor) return;
        try {
          await api("/api/report", {
            method: "POST",
            body: JSON.stringify({ user_id: state.reportFor, reason: picked, details }),
          });
          toast("жалоба отправлена, человек скрыт");
          state.reportFor = null;
          state.person = null;
          state.view = "deck";
          await loadFeed();
          render();
        } catch (err) {
          toast(err.message);
        }
      });
    }
    const reportBack = root.querySelector("#report-modal");
    if (reportBack) {
      reportBack.addEventListener("click", (e) => {
        if (e.target === reportBack) {
          state.reportFor = null;
          render();
        }
      });
    }
    root.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (btn.tagName === "A") e.preventDefault();
        openChat(Number(btn.dataset.open));
      });
    });
    root.querySelectorAll("[data-person]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (btn.tagName === "A") e.preventDefault();
        openPerson(Number(btn.dataset.person), btn.dataset.from || "deck");
      });
    });
    bindComposer();
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
    const redeem = root.querySelector("#plus-redeem");
    if (redeem) {
      redeem.addEventListener("click", async () => {
        const code = (root.querySelector("#plus-code") || {}).value || "";
        try {
          const data = await api("/api/premium/redeem", { method: "POST", body: JSON.stringify({ code }) });
          state.user = data.user;
          toast("WIRING+ включён");
          if (state.view === "likes") await loadLikes();
          render();
        } catch (err) {
          toast(err.message);
        }
      });
    }
    root.querySelectorAll("[data-plus-gate]").forEach((el) => {
      el.addEventListener("click", () => {
        const code = root.querySelector("#plus-code");
        if (code) {
          code.focus();
          code.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        toast("WIRING+ откроет, кто лайкнул");
      });
    });
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

    const likesToggle = root.querySelector("#likes-filters-toggle");
    if (likesToggle) {
      likesToggle.addEventListener("click", () => {
        state.likesFiltersOpen = !state.likesFiltersOpen;
        render();
      });
    }
    if (state.view === "likes" && state.likesFiltersOpen) {
      if (!state.likesFilters.intents) state.likesFilters.intents = [];
      bindChips({ neuro: state.likesFilters.neuro, vibe: state.likesFilters.vibe, intents: state.likesFilters.intents });
      const applyLikes = async () => {
        await loadLikes();
        render();
      };
      root.querySelectorAll("#l-neuro .chip, #l-vibe .chip, #l-intent .chip").forEach((btn) => {
        btn.addEventListener("click", applyLikes);
      });
      const lMin = root.querySelector("#l-min-age");
      const lMax = root.querySelector("#l-max-age");
      const lCity = root.querySelector("#l-city");
      if (lMin) lMin.addEventListener("change", async () => { state.likesFilters.min_age = Number(lMin.value) || 18; await applyLikes(); });
      if (lMax) lMax.addEventListener("change", async () => { state.likesFilters.max_age = Number(lMax.value) || 99; await applyLikes(); });
      if (lCity) {
        const applyCity = async () => {
          state.likesFilters.city = lCity.value.trim();
          await applyLikes();
        };
        lCity.addEventListener("change", applyCity);
        lCity.addEventListener("blur", applyCity);
      }
      const lClear = root.querySelector("#likes-filters-clear");
      if (lClear) lClear.addEventListener("click", async () => {
        state.likesFilters = { neuro: [], vibe: [], intents: [], min_age: 18, max_age: 99, city: "" };
        await applyLikes();
      });
    }
bindTips();
    if (state.user && state.view === "deck") wireDeck();
    if (state.user && state.view === "person") wirePerson();
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
      try {
        await openChat(plan.id);
      } catch (err) {
        toast(err.message);
        state.view = "matches";
        const data = await api("/api/matches");
        state.matches = data.matches;
        render();
      }
      return;
    }
    state.view = plan.view;
    state.photoIndex = 0;
    if (state.view === "deck") await loadFeed();
    if (state.view === "matches") {
      const data = await api("/api/matches");
      state.matches = data.matches;
      state.thread = null;
    }
    if (state.view === "likes") await loadLikes();
    if (state.view === "profile") await refreshMe();
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
