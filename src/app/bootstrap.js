import { applyTheme, themeNow } from "../lib/theme";
import { fetchFeed } from "./feed";
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
    feedHasMore: true,
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

    pendingPath: "",
    pendingRef: sessionStorage.getItem("wiring-ref") || "",
    chatId: null,
  };
  const urlSyncState = { lastUrl: "" };

  let routing = null;
  const ensureRouting = () => {
    if (routing) return Promise.resolve(routing);
    return import(`${BASE}/public/dist/router.js?v=4`).then((mod) => {
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
    profilePlaceholder: svgIcon(
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

  applyTheme(themeNow());

  const persistFilters = () => {
    const { real_only: _ignore, ...rest } = state.filters;
    sessionStorage.setItem("wiring-filters", JSON.stringify(rest));
  };
  state.filters.real_only = false;

  const photoRef = (photo) => {
    if (Array.isArray(photo)) photo = photo[0];
    if (photo && typeof photo === "object") photo = photo.url;
    return String(photo || "").trim();
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
    const initial = [...String(name || "?").trim()][0]?.toUpperCase() || "?";
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='hsl(${hue} 38% 32%)'/><stop offset='1' stop-color='hsl(${(hue + 36) % 360} 42% 22%)'/></linearGradient></defs><rect width='64' height='64' fill='url(#g)'/><text x='32' y='32' dominant-baseline='central' text-anchor='middle' fill='#d8ff3c' font-size='26' font-family='Georgia' font-weight='500'>${initial}</text></svg>`
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

  const toast = (text, action) => {
    const el = document.createElement("div");
    el.className = action ? "toast tap" : "toast";
    el.textContent = text;
    if (action) el.addEventListener("click", () => action());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), action ? 10000 : 2200);
  };

  const pingBrowser = (text) => {
    if (state.user?.notify_enabled === false || state.user?.notify_push === false) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !text) return;
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    try {
      bitmap.close?.();
    } catch {
      /* ignore */
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob || file;
  };

  const uploadPhoto = async (file, rightsConsent = false) => {
    const compressed = await compressImage(file);
    const blob = compressed instanceof Blob ? compressed : file;
    const fallbackName = blob.type === "image/png" ? "photo.png" : blob.type === "image/webp" ? "photo.webp" : "photo.jpg";
    const uploadName = file.name && /\.(jpe?g|png|webp)$/i.test(file.name) ? file.name : fallbackName;
    const fd = new FormData();
    fd.append("file", blob, uploadName);
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
  const QUIET_VIEWS = new Set(["register", "forgot", "reset", "verify", "onboard", "invite", "chat", "delete-account"]);
  const showsTabbar = () => !QUIET_VIEWS.has(state.view);
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
      const isMe =
        state.view === "profile"
        || state.view === "plus"
        || state.view === "login"
        || (state.view === "person" && from === "profile");
      const dest = state.user ? "my-preview" : "login";
      const label = state.user ? "Профиль" : "Войти";
      const icon = state.user
        ? photoRef(state.user.photo)
          ? `<span class="nav-avatar"><img src="${avatarUrl(state.user.photo, state.user.name)}" alt=""></span>`
          : `<span class="nav-avatar nav-avatar--empty" aria-hidden="true">${ICONS.profilePlaceholder}</span>`
        : ICONS.user;
      items.push([dest, label, icon, isMe]);
    }
    return items
      .map(([view, label, icon, on]) => {
        const badge = view === "likes" ? countSlot("likes") : view === "matches" ? countSlot("unread") : "";
        const href = view === "my-preview" ? hrefFor("person", { id: state.user.id }) : hrefFor(view);
        return `<a href="${href}" data-nav="${view}" class="${kind}-link${on ? " on" : ""}"${on ? ' aria-current="page"' : ""}>
          <span class="nav-ico" aria-hidden="true">${icon}${badge}</span>
          <span class="nav-lbl">${label}</span>
        </a>`;
      })
      .join("");
  };

  const tabbar = () =>
    showsTabbar()
      ? `<nav class="tabbar" aria-label="разделы">${navLinks("tab")}</nav>`
      : "";

  const friendlyLike = () => {
    const intents = state.user?.intents || (state.user?.intent ? [state.user.intent] : []);
    const soft = intents.length > 0 && intents.every((id) => id === "friends" || id === "chat");
    return {
      icon: soft ? ICONS.thumb : ICONS.like,
      label: soft ? "лайк / ок" : "лайк",
      title: soft ? "лайк — дружба или общение" : "лайк",
    };
  };

  const logout = async () => {
    try {
      await api("/api/logout", { method: "POST" });
    } catch (_) {}
    state.user = null;
    state.cards = [];
    state.index = 0;
    state.feedHasMore = true;
    state.view = "home";
    stopInbox();
    render();
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
    try {
      const data = await api("/api/swipe", {
        method: "POST",
        body: JSON.stringify({ target_id: targetId, direction }),
      });
      const removedIndex = state.cards.findIndex((candidate) => candidate.id === targetId);
      state.cards = state.cards.filter((candidate) => candidate.id !== targetId);
      if (removedIndex >= 0 && removedIndex < state.index) state.index -= 1;
      state.index = Math.min(state.index, state.cards.length);
      state.photoIndex = 0;
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
        if (!state.cards.length && state.feedHasMore) await loadFeed();
      }
    } else {
      if (!state.cards.length && state.feedHasMore) await loadFeed();
    }
    state.busy = false;
    render();
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
    const data = await fetchFeed(api, state.filters);
    state.feedHasMore = !!data.has_more;
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
  let supportFeatureUnmount = null;
  const ACCOUNT_FEATURE_VIEWS = new Set(["invite", "delete-account", "onboard"]);
  const CHAT_FEATURE_VIEWS = new Set(["matches", "chat"]);
  let chatFeatureUnmount = null;
  let chatFeatureMountToken = 0;

  const cityGateActive = () => Boolean(state.user && !state.user.guest && state.user.needs_city && !state.user.needs_profile && state.view !== "profile");

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
      fetchHomeFaces: () => api("/api/home/faces").then((data) => data.faces || []).catch(() => []),
      userTraits,
      profileAvatar:
        state.user && photoRef(state.user.photo) ? avatarUrl(state.user.photo, state.user.name) : undefined,
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
    hasMore: state.feedHasMore,
    basePath: BASE,
    hrefFor,
    navigate: (view, params = {}) => {
      if (view === "person" && params.id) {
        void openPerson(Number(params.id), "deck");
        return;
      }
      void goToView(view);
    },
    loadFeed: (filters, signal) => fetchFeed(api, filters, signal),
    onFeedChange: (cards, index, filters, hasMore) => {
      state.cards = cards;
      state.index = index;
      state.filters = filters;
      state.feedHasMore = hasMore;
      persistFilters();
    },
    onMatch: (match) => {
      toast(`взаимно с ${match.name || "тобой"}`);
      void openChat(match.id);
    },
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

  const buildSupportHostBridge = () => ({
    user: state.user,
    basePath: BASE,
    hrefFor,
    navigate: (view, params = {}) => void goToView(view, params),
    goBack: () => {
      if (
        window.history.length > 1 &&
        (window.history.state?.view ||
          (document.referrer && new URL(document.referrer, location.origin).origin === location.origin))
      ) {
        window.history.back();
      } else {
        void goToView("home");
      }
    },
    api,
    toast,
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
    if (meta.neuro && next === "register") sessionStorage.setItem("wiring_pick_neuro", meta.neuro);
    if (meta.neuro && next === "deck") {
      state.filters.neuro = [meta.neuro];
      persistFilters();
    }
    if (!state.user && ["deck", "profile", "consents", "person", "chat", "delete-account", "plus"].includes(next)) {
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
    if (next === "my-preview" && state.user?.id) {
      await openPerson(state.user.id, "profile");
      return;
    }
    state.view = next;
    state.photoIndex = 0;
    if (next !== "chat") state.chatId = null;
    if (state.view === "deck" && state.user && !state.cards.length) await loadFeed();
    if (state.view === "matches" && state.user) {
      const data = await api("/api/matches");
      state.matches = data.matches;
      await refreshMe();
    }
    if (state.view === "likes" && state.user) {
      await loadLikes();
      await refreshMe();
    }
    if (["profile", "consents", "plus"].includes(state.view) && state.user) await refreshMe();
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
    const withTabbar = mode === "login" && showsTabbar();
    root.innerHTML = '<div id="auth-feature-root"></div>' + (withTabbar ? tabbar() : "");
    bindDataNavLinks();
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
    const mountEl = root.querySelector("#home-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.home();
      homeFeatureUnmount = mod.mountHome(mountEl, buildHomeHostBridge());
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      root.innerHTML = `<p class="err">не загрузился модуль home (${escapeHtml(err.message)}). выполни npm run build</p>`;
      toast(`не загрузился модуль home (${err.message}).`);
    }
  };

  const renderProfileFeature = async (view = state.view) => {
    profileFeatureUnmount?.();
    profileFeatureUnmount = null;
    root.innerHTML = '<div id="profile-feature-root"></div>' + tabbar();
    bindDataNavLinks();
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
      root.innerHTML = `<p class="err">не загрузился модуль profile (${escapeHtml(err.message)}). выполни npm run build</p>`;
      toast(`не загрузился модуль profile (${err.message}).`);
    }
  };

  const renderLikesFeature = async () => {
    likesFeatureUnmount?.();
    likesFeatureUnmount = null;
    root.innerHTML = '<div id="likes-feature-root"></div>' + tabbar();
    bindDataNavLinks();
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
    root.innerHTML = '<div id="account-feature-root"></div>' + (ACCOUNT_FEATURE_VIEWS.has(view) && view !== "delete-account" ? tabbar() : "");
    bindDataNavLinks();
    const mountEl = root.querySelector("#account-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.account();
      if (view === "city-gate" ? !cityGateActive() : !ACCOUNT_FEATURE_VIEWS.has(state.view)) return;
      const accountHost = buildAccountHostBridge();
      accountFeatureUnmount = view === "city-gate"
        ? mod.mountCityGate(mountEl, accountHost)
        : view === "invite"
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

  const renderSupportFeature = async () => {
    supportFeatureUnmount?.();
    supportFeatureUnmount = null;
    root.innerHTML = '<div id="support-feature-root"></div>';
    bindDataNavLinks();
    const mountEl = root.querySelector("#support-feature-root");
    if (!mountEl) return;
    try {
      const mod = await featureLoader.support();
      if (state.view !== "support") return;
      const supportHost = buildSupportHostBridge();
      supportFeatureUnmount = mod.mountSupport(mountEl, supportHost);
      bindDataNavLinks();
      syncUrl();
    } catch (err) {
      root.innerHTML = `<p class="err">не загрузился модуль support (${escapeHtml(err.message)}). выполни npm run build</p>`;
      toast(`не загрузился модуль support (${err.message}).`);
    }
  };

  const render = () => {
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
    if (!ACCOUNT_FEATURE_VIEWS.has(state.view) && !cityGateActive()) {
      accountFeatureUnmount?.();
      accountFeatureUnmount = null;
    }
    if (state.view !== "support") {
      supportFeatureUnmount?.();
      supportFeatureUnmount = null;
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
    else if (state.view === "support") {
      void renderSupportFeature();
      return;
    }
    else if (state.view === "home") {
      void renderHomeFeature();
      return;
    }
    else if (!state.user) {
      if (state.view === "likes") {
        void renderLikesFeature();
        return;
      }
      if (state.view === "matches") {
        void renderChatFeature();
        return;
      }
      void renderHomeFeature();
      return;
    }
    else if (cityGateActive()) {
      void renderAccountFeature("city-gate");
      return;
    }
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
    else if (ACCOUNT_FEATURE_VIEWS.has(state.view)) {
      void renderAccountFeature(state.view);
      return;
    }
    else if (["profile", "consents", "plus"].includes(state.view)) {
      void renderProfileFeature(state.view);
      return;
    }
    else root.innerHTML = `<p class="err">неизвестный раздел приложения</p>`;

    if (bound) {
      root.innerHTML = bound.html;
      bound.bind();
    }
    bindDataNavLinks();
    root.querySelectorAll("[data-person]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (btn.tagName === "A") e.preventDefault();
        openPerson(Number(btn.dataset.person), btn.dataset.from || "deck");
      });
    });
    root.querySelectorAll(".beta-wrap").forEach((wrap) => {
      wrap.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        wrap.classList.toggle("is-open");
      });
    });
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
    if (state.view === "matches" && state.user) {
      const data = await api("/api/matches");
      state.matches = data.matches;
    }
    if (state.view === "likes" && state.user) await loadLikes();
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
